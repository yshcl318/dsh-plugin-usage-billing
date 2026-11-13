/**
 * Host-half unit tests. Runs the real bundle modules against an in-memory
 * storage domain and a mocked Harness context, so aggregation, pricing,
 * write-time locking, budget notices and preference persistence are all
 * exercised without installing anything.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UsageBillingService, REMOTE_METHODS } from '../bundle/dsh-plugin-usage-billing/host/service.js';
import { USAGE_BILLING_DOMAIN, DEFAULT_PREFS, createDomainSpec } from '../bundle/dsh-plugin-usage-billing/host/domain.js';
import {
  BUILTIN_CATALOG, OFF_PEAK_RATIO, dayKeyAt, priceUsage, priceKeyCandidates,
  tierAndFactorAt, tierAt, nextTierSwitchAt,
} from '../bundle/dsh-plugin-usage-billing/host/pricing.js';
import { extractUsageItems } from '../bundle/dsh-plugin-usage-billing/host/collector.js';
import {
  balanceView, shouldAppendBalance, snapshotFromBalance, walletSum,
} from '../bundle/dsh-plugin-usage-billing/host/balance.js';

const manifestVersion = JSON.parse(readFileSync(new URL('../bundle/dsh-plugin-usage-billing/package.json', import.meta.url), 'utf8')).version;
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`NOT OK - ${name}`);
    console.log(error);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`NOT OK - ${name}`);
    console.log(error);
  }
}

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

function createDomain(initialGlobal) {
  const globalValue = { value: initialGlobal ?? {} };
  const tables = new Map();
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    const store = tables.get(name);
    return {
      get: key => store.get(key),
      entries: () => store.entries(),
      keys: () => store.keys(),
      get size() { return store.size; },
      put: async (key, value) => { store.set(key, value); },
      delete: async (key) => store.delete(key),
      deleteMany: async (keys) => {
        let count = 0;
        for (const key of keys) if (store.delete(key)) count += 1;
        return count;
      },
      update: async (key, fn) => {
        if (!store.has(key)) throw new Error('missing-key');
        const next = fn(store.get(key));
        store.set(key, next);
        return next;
      },
    };
  };
  return {
    name: USAGE_BILLING_DOMAIN.name,
    global: {
      get: () => globalValue.value,
      set: async (value) => { globalValue.value = value; },
    },
    table,
    tables,
    close: async () => {},
  };
}

/**
 * @param {string} id
 * @param {{ cwd?: string, parent?: string, depth?: number, subagent?: boolean, createdAt?: number }} [options]
 */
function makeSession(id, { cwd = 'D:\\proj', parent, depth = 0, subagent = false, createdAt = 0 } = {}) {
  const header = { version: 4, id, createdAt, isSeeded: false };
  if (cwd !== undefined) header.cwd = cwd;
  if (parent !== undefined) header.parentSession = parent;
  if (depth !== 0) header.delegationDepth = depth;
  if (subagent) header.origin = 'subagent';
  return header;
}

function assistantEvent(seq, time, provider, model, usage) {
  return {
    type: 'assistant/message',
    seq,
    time,
    data: {
      turn: 1,
      step: 1,
      message: { role: 'assistant', content: [], source: { kind: 'model', provider, model } },
      stream: [],
      usage,
    },
  };
}

/**
 * @param {{ sessions?: any[], liveContainer?: any, account?: any }} [options]
 */
function createCtx(options = {}) {
  const { sessions = [], liveContainer, account } = /** @type {any} */ (options);
  const warnings = [];
  const listeners = new Map();
  const byId = new Map(sessions.map(session => [session.header.id, session]));
  const ctx = {
    logger: {
      warn: (...args) => warnings.push(args),
      info: () => {},
      debug: () => {},
    },
    get(name) {
      if (name === 'deepseekAccount') return account;
      if (name === 'sessionQuery') {
        return {
          listSessions: async () => sessions.map(session => ({ header: session.header, live: false, persisted: true })),
          readSession: async (id) => {
            const entry = byId.get(String(id));
            if (entry === undefined) throw new Error('not found');
            return { session: entry.header, inheritedEventCount: 0, events: entry.events };
          },
        };
      }
      return undefined;
    },
    on(event, callback) {
      const list = listeners.get(event) ?? [];
      list.push(callback);
      listeners.set(event, list);
      return () => {
        listeners.set(event, list.filter(item => item !== callback));
      };
    },
    effect(callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    warnings,
    listeners,
    emit(event, ...args) {
      for (const callback of listeners.get(event) ?? []) callback(...args);
    },
  };
  if (liveContainer) liveContainer.ctx = ctx;
  return ctx;
}

async function waitUntil(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/* ------------------------------------------------------------------ */
/* Pricing pure functions                                            */
/* ------------------------------------------------------------------ */

test('price usage: peak vs off-peak factor and cache buckets', () => {
  // 2026-11-13 is a Friday. 02:00Z = 10:00 Beijing (peak), 12:00Z = 20:00 (off-peak).
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const peakMs = Date.parse('2026-11-13T02:00:00Z');
  const offMs = Date.parse('2026-11-13T12:00:00Z');
  assert.equal(tierAt(peakMs), 'peak');
  assert.equal(tierAt(offMs), 'offPeak');
  const keys = priceKeyCandidates('deepseek-account', 'deepseek-flash');
  const peak = priceUsage(usage, BUILTIN_CATALOG, keys, 7.1, tierAndFactorAt(peakMs).factor);
  const off = priceUsage(usage, BUILTIN_CATALOG, keys, 7.1, tierAndFactorAt(offMs).factor);
  assert.equal(peak.priced, true);
  assert.equal(peak.costCny, 10);
  assert.equal(off.costCny, 5);
  assert.equal(off.costCny, peak.costCny * OFF_PEAK_RATIO);
  // 12:00 Beijing is the exclusive end of the peak window.
  assert.equal(tierAt(Date.parse('2026-11-13T04:00:00Z')), 'offPeak');
  // Weekend is all-day off-peak.
  assert.equal(tierAt(Date.parse('2026-11-14T02:00:00Z')), 'offPeak');
  // Cache buckets are priced separately.
  const cached = priceUsage({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 }, BUILTIN_CATALOG, keys, 7.1, 1);
  assert.equal(cached.costCny, 2.04);
});

test('price usage: unknown model is unpriced, never a silent zero price', () => {
  const keys = priceKeyCandidates('mystery', 'unknown-model-xyz');
  const result = priceUsage({ inputTokens: 1000, outputTokens: 1000 }, BUILTIN_CATALOG, keys, 7.1, 1);
  assert.equal(result.priced, false);
  assert.equal(result.matchedKey, null);
});

test('next tier switch is in the future and lands on a window edge', () => {
  const now = Date.parse('2026-11-13T02:30:00Z');
  const next = nextTierSwitchAt(now);
  assert.ok(next !== null && next > now);
  assert.equal(new Date(next).toISOString(), '2026-11-13T04:00:00.000Z');
});

test('collector extracts usage and model, skips inherited fork prefix', () => {
  const events = [
    assistantEvent(0, 1, 'p', 'm-old', { inputTokens: 1, outputTokens: 1 }),
    assistantEvent(1, 2, 'p', 'm', { inputTokens: 2, outputTokens: 2 }),
  ];
  const all = extractUsageItems(events);
  assert.equal(all.items.length, 2);
  const own = extractUsageItems(events, 1);
  assert.equal(own.items.length, 1);
  assert.equal(own.items[0].output, undefined);
  assert.equal(own.items[0].usage.outputTokens, 2);
  assert.equal(own.items[0].model, 'm');
  assert.equal(own.lastSeq, 1);
});

/* ------------------------------------------------------------------ */
/* Service integration                                               */
/* ------------------------------------------------------------------ */

async function buildFixture() {
  const installAt = Date.parse('2026-11-13T05:30:00Z');
  const peakUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2_000_000 };
  const smallUsage = { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const mainHeader = makeSession('session-A', { cwd: 'D:\\proj', createdAt: installAt - 86400000 });
  const childHeader = makeSession('child-B', { cwd: 'D:\\proj', parent: 'session-A', depth: 1, subagent: true, createdAt: installAt - 3600000 });
  const mainEvents = [
    // Before installAt: estimated row, backfilled flag.
    assistantEvent(0, Date.parse('2026-11-10T02:00:00Z'), 'deepseek-account', 'deepseek-flash', peakUsage),
    // 2026-11-13T02:00Z = 10:00 Beijing Friday, peak.
    assistantEvent(1, Date.parse('2026-11-13T02:00:00Z'), 'deepseek-account', 'deepseek-flash', peakUsage),
    // 2026-11-13T12:00Z = 20:00 Beijing, off-peak.
    assistantEvent(2, Date.parse('2026-11-13T12:00:00Z'), 'deepseek-account', 'deepseek-flash', peakUsage),
    // Unpriced model.
    assistantEvent(3, Date.parse('2026-11-13T03:00:00Z'), 'mystery', 'unknown-model-xyz', smallUsage),
    // Interrupted message without usage is ignored.
    { type: 'assistant/message', seq: 4, time: Date.parse('2026-11-13T03:10:00Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'deepseek-account', model: 'deepseek-flash' } }, stream: [], interrupted: true } },
  ];
  const childEvents = [
    assistantEvent(0, Date.parse('2026-11-13T03:30:00Z'), 'deepseek-account', 'deepseek-flash', smallUsage),
  ];
  const ctx = createCtx({
    sessions: [
      { id: 'session-A', header: mainHeader, events: mainEvents },
      { id: 'child-B', header: childHeader, events: childEvents },
    ],
  });
  const domain = createDomain();
  const service = new UsageBillingService(ctx);
  // Seed installAt through the persisted global so the estimated row is < installAt.
  domain.global.set({ installAt, budgetNotified: {} });
  await service.attach(domain);
  await waitUntil(() => service.backfillState.done);
  return { ctx, domain, service, installAt };
}

async function run() {
  const { ctx, domain, service, installAt } = await buildFixture();

  await testAsync('remote surface is marked for the gateway', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(UsageBillingService.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods');
    assert.ok(descriptor !== undefined);
    assert.equal(descriptor.value.version, 1);
    assert.deepEqual(descriptor.value.methods.map(item => item.method).sort(), [...REMOTE_METHODS].sort());
    for (const item of descriptor.value.methods) assert.deepEqual(item.invocation, { kind: 'direct' });
  });

  await testAsync('backfill prices each row at its own event time (write-time lock)', async () => {
    const rows = service.allRows();
    assert.equal(rows.length, 5);
    const bySeq = new Map(rows.filter(row => row.sessionId === 'session-A').map(row => [row.seq, row]));
    // Peak row: 1M in + 1M out at 2 + 8 CNY/M = 10 CNY.
    assert.equal(bySeq.get(1).costCny, 10);
    assert.equal(bySeq.get(1).tier, 'peak');
    // Off-peak row: 5 CNY.
    assert.equal(bySeq.get(2).costCny, 5);
    assert.equal(bySeq.get(2).tier, 'offPeak');
    // Pre-install row is marked estimated.
    assert.equal(bySeq.get(0).backfilled, true);
    // Unpriced row never counts as priced.
    assert.equal(bySeq.get(3).priced, false);
    assert.equal(bySeq.get(3).costCny, 0);
    // Subagent row is flagged.
    const sub = rows.find(row => row.sessionId === 'child-B');
    assert.equal(sub.isSubagent, true);
  });

  await testAsync('overview aggregates month/today/cumulative with subagent filtering', async () => {
    const withSub = await service.overview('month', true, 'D:\\proj');
    assert.equal(withSub.ready, true);
    // 10 + 5 + 0(unpriced) + estimated 20 + subagent 0.02
    assert.ok(Math.abs(withSub.overview.totalCny - (10 + 10 + 5 + 0.01)) < 1e-9);
    assert.equal(withSub.overview.calls, 5);
    assert.equal(withSub.overview.unpricedRows, 1);
    assert.deepEqual(withSub.overview.unpricedModels, ['mystery/unknown-model-xyz']);
    assert.equal(withSub.cumulative.sessions, 2);
    assert.equal(withSub.cumulative.subagentSessions, 1);
    const noCwd = await service.overview('month', true, null);
    assert.equal(noCwd.todaySplit.hasProject, false);
    assert.equal(withSub.overview.hasBackfilled, true);
    assert.equal(withSub.todaySplit.hasProject, true);
    assert.equal(typeof withSub.todaySplit.totalCalls, 'number');
    assert.equal(withSub.todaySplit.totalCalls, withSub.todaySplit.projectCalls + withSub.todaySplit.otherCalls);
    assert.ok(withSub.todaySplit.projectCny > 0);
    const withoutSub = await service.overview('month', false, 'D:\\proj');
    assert.ok(Math.abs(withoutSub.overview.totalCny - (10 + 10 + 5)) < 1e-9);
    assert.equal(withoutSub.overview.calls, 4);
    assert.equal(withoutSub.cumulative.sessions, 1);
  });

  await testAsync('daily/byModel/byWorkspace views agree with rows', async () => {
    const daily = await service.daily('month', true);
    const day = daily.days.find(point => point.day === '2026-11-13');
    assert.ok(day !== undefined);
    assert.ok(day.calls === 4); // 10:00, 20:00, unknown model, subagent (03:30Z)
    const models = await service.byModel('month', true);
    const flash = models.models.find(row => row.model === 'deepseek-v4-flash');
    assert.ok(flash !== undefined);
    assert.equal(flash.priced, true);
    const unknown = models.models.find(row => row.model === 'unknown-model-xyz');
    assert.ok(unknown !== undefined);
    assert.equal(unknown.priced, false);
    assert.equal(unknown.costCny, 0);
    const workspaces = await service.byWorkspace('month', true);
    assert.equal(workspaces.workspaces.length, 1);
    assert.equal(workspaces.workspaces[0].cwd, 'D:\\proj');
    assert.equal(workspaces.workspaces[0].sessions.length, 2);
  });

  await testAsync('budget notice stays until the user dismisses it, then fires once', async () => {
    await service.savePrefs({ monthlyCny: 20, budgetEnabled: true });
    const first = await service.overview('month', true, null);
    assert.ok(first.month.spentCny > 20);
    assert.equal(first.month.level, 'over');
    assert.equal(first.month.notice, 100);
    // A refresh keeps the unacknowledged notice.
    const second = await service.overview('month', true, null);
    assert.equal(second.month.notice, 100);
    const dismissed = await service.dismissBudgetNotice('2026-11');
    assert.equal(dismissed.ok, true);
    const third = await service.overview('month', true, null);
    assert.equal(third.month.notice, null);
    // The same threshold never fires again in this month.
    const fourth = await service.overview('month', true, null);
    assert.equal(fourth.month.notice, null);
    // A zero budget is disabled, never a silent 0% progress bar.
    await service.savePrefs({ monthlyCny: 0 });
    const disabled = await service.overview('month', true, null);
    assert.equal(disabled.month.enabled, false);
    assert.equal(disabled.month.notice, null);
    await service.savePrefs({ monthlyCny: 20 });
  });

  await testAsync('changing a price later never rewrites priced history', async () => {
    const before = service.allRows().map(row => ({ id: row.id, cost: row.costCny, priced: row.priced }));
    await service.setCustomPrice({ provider: 'deepseek-account', model: 'deepseek-flash', input: 100, cacheRead: 0, cacheWrite: 0, output: 100, currency: 'CNY' });
    const after = service.allRows().map(row => ({ id: row.id, cost: row.costCny, priced: row.priced }));
    assert.deepEqual(after, before);
    // A new event after the custom price takes effect is priced with the new table.
    ctx.emit('session/event', { header: makeSession('session-A', { cwd: 'D:\\proj' }) }, assistantEvent(9, Date.now(), 'deepseek-account', 'deepseek-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000 }));
    await waitUntil(() => service.allRows().some(row => row.seq === 9));
    const row = service.allRows().find(candidate => candidate.seq === 9);
    // 1M input at 100 CNY/M + 1M output at 100 CNY/M, times the event-time tier
    // factor (0.5 when the test runs outside the Beijing peak windows).
    const expected = 200 * (row.tier === 'offPeak' ? 0.5 : 1);
    assert.equal(row.costCny, expected);
  });

  await testAsync('adding a price re-prices only unpriced rows, never priced ones', async () => {
    const before = service.allRows().filter(row => row.priced).map(row => ({ id: row.id, cost: row.costCny }));
    const unknown = service.allRows().find(row => row.model === 'unknown-model-xyz');
    assert.equal(unknown.priced, false); // still unknown: no price for this exact key
    await service.setCustomPrice({ provider: 'mystery', model: 'unknown-model-xyz', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, currency: 'CNY' });
    const unknownAfter = service.allRows().find(row => row.model === 'unknown-model-xyz');
    assert.equal(unknownAfter.priced, true);
    assert.ok(unknownAfter.costCny > 0);
    const pricedRows = service.allRows().filter(row => row.priced && row.model !== 'unknown-model-xyz').map(row => ({ id: row.id, cost: row.costCny }));
    assert.deepEqual(pricedRows, before);
    const redundant = await service.repricing();
    assert.equal(redundant.changed, 0);
  });

  await testAsync('aliases and preferences persist through the domain', async () => {
    await service.setAlias({ provider: 'deepseek-account', rawModel: 'deepseek-flash', canonicalModel: 'deepseek-v4-flash' });
    const aliases = await service.aliasList();
    assert.equal(aliases.aliases.length, 1);
    await service.savePrefs({ monthlyCny: 123, includeSubagents: false, entrySidebar: false, entryComposer: true, showTierCurve: false });
    const second = new UsageBillingService(createCtx({ sessions: [] }));
    await second.attach(domain);
    await waitUntil(() => second.ready);
    const prefs = await second.prefs();
    assert.equal(prefs.prefs.monthlyCny, 123);
    assert.equal(prefs.prefs.includeSubagents, false);
    assert.equal(prefs.prefs.entrySidebar, false);
    assert.equal(prefs.prefs.showTierCurve, false);
    const aliasList = await second.aliasList();
    assert.equal(aliasList.aliases.length, 1);
    await second.dispose();
  });

  await testAsync('pricing snapshot survives a restart and keeps the default FX flag', async () => {
    const pricing = await service.pricing();
    assert.equal(pricing.ready, true);
    assert.ok(pricing.rows.length >= Object.keys(BUILTIN_CATALOG).length);
    assert.equal(pricing.usdToCnySource, 'default');
    assert.equal(pricing.live, false);
    const status = await service.status();
    assert.equal(status.ready, true);
    assert.ok(status.rows >= 5);
    assert.ok(status.snapshots >= 2);
    assert.equal(status.installAt, installAt);
  });

  await testAsync('empty store answers zeroed overview instead of throwing', async () => {
    const emptyDomain = createDomain();
    const empty = new UsageBillingService(createCtx({ sessions: [] }));
    await empty.attach(emptyDomain);
    await waitUntil(() => empty.backfillState.done);
    const overview = await empty.overview('month', true, null);
    assert.equal(overview.ready, true);
    assert.equal(overview.overview.totalCny, 0);
    assert.equal(overview.overview.calls, 0);
    assert.equal(overview.month.spentCny, 0);
    const cost = await empty.sessionCost('session-none', true);
    assert.equal(cost.costCny, 0);
    const daily = await empty.daily('30d', true);
    assert.equal(daily.days.length, 30);
    await empty.dispose();
  });


  await testAsync('domain spec parses stored records and rejects junk', async () => {
    const spec = await createDomainSpec();
    assert.equal(spec.name, 'usage_billing');
    assert.equal(spec.version, 2);
    assert.equal(spec.layout, 'per-record');
    assert.equal(spec.invalidRecords, 'backup-and-skip');
    const shard = { v: 1, day: '2026-11-13', rows: [{
      id: 's__1', sessionId: 's', seq: 1, time: 1, provider: 'p', model: 'm', day: '2026-11-13',
      input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costCny: 0.1, priced: true, backfilled: false,
    }] };
    assert.equal(spec.tables.ledger.valueSchema.safeParse(shard).success, true);
    assert.equal(spec.tables.ledger.valueSchema.safeParse({ no: 'shard' }).success, false);
    assert.equal(spec.global.schema.safeParse(null).success, false);
    assert.equal(spec.global.schema.safeParse({ installAt: 1, budgetNotified: {} }).success, true);
    const prefs = spec.tables.prefs.valueSchema;
    assert.equal(prefs.safeParse({ ...DEFAULT_PREFS }).success, true);
    assert.equal(prefs.safeParse({ budgetEnabled: 'yes' }).success, false);
    assert.equal(prefs.safeParse({ ...DEFAULT_PREFS, balanceEnabled: false, balanceRefreshSeconds: 15 }).success, true);
    assert.equal(prefs.safeParse({ ...DEFAULT_PREFS, balanceRefreshSeconds: 'fast' }).success, false);
    const balances = spec.tables.balances.valueSchema;
    assert.equal(balances.safeParse({ id: 'bal-1', at: 1, cny: 11.8, bonusCny: 0, usd: 0, source: 'account' }).success, true);
    assert.equal(balances.safeParse({ id: 1, at: 'x' }).success, false);
  });

  await testAsync('balance helpers parse wallets and compute observed changes', async () => {
    const details = {
      status: 'ready',
      value: [{ currency: 'CNY', balance: '11.7849021200000000' }],
      bonusWallets: [{ currency: 'CNY', balance: '0' }],
    };
    assert.equal(walletSum(details.value, 'CNY'), 11.784902);
    const row = snapshotFromBalance(details, Date.parse('2026-11-13T02:00:00Z'));
    assert.equal(row.cny, 11.784902);
    assert.equal(row.bonusCny, 0);
    assert.equal(row.source, 'account');
    const usdRow = snapshotFromBalance({ status: 'ready', value: [{ currency: 'USD', balance: '2' }], bonusWallets: [] }, Date.parse('2026-11-13T04:00:00Z'));
    assert.equal(usdRow.usd, 2);
    const view = balanceView([row, usdRow], {
      now: Date.parse('2026-11-13T05:00:00Z'), todayKey: '2026-11-13', usdToCny: 7.1,
      estimatedTodayCny: 0.4, estimatedMonthCny: 12, links: null,
      status: 'ready', enabled: true, refreshSeconds: 30, error: null,
    });
    assert.equal(view.ready, true);
    assert.ok(Math.abs(view.totalCny - 14.2) < 1e-9);
    assert.equal(view.todayBaseline, 'today');
    assert.equal(view.todaySpentCny, 0);
    const spent = balanceView([
      { id: 'b1', at: Date.parse('2026-11-13T02:00:00Z'), cny: 12, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
      { id: 'b2', at: Date.parse('2026-11-13T04:00:00Z'), cny: 11.8, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
    ], {
      now: Date.parse('2026-11-13T05:00:00Z'), todayKey: '2026-11-13', usdToCny: 7.1,
      estimatedTodayCny: 0.4, estimatedMonthCny: 12, links: null,
      status: 'ready', enabled: true, refreshSeconds: 30, error: null,
    });
    assert.equal(spent.todayBaseline, 'today');
    assert.ok(Math.abs(spent.todaySpentCny - 0.2) < 1e-9);
    assert.ok(Math.abs(spent.deltaCny + 0.2) < 1e-9);
    assert.ok(Math.abs(spent.estimateDiffCny - 0.2) < 1e-9);
    assert.equal(spent.todayTopUp, false);
    const toppedUp = balanceView([
      { id: 't1', at: Date.parse('2026-11-13T01:00:00Z'), cny: 12, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
      { id: 't2', at: Date.parse('2026-11-13T02:00:00Z'), cny: 10, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
      { id: 't3', at: Date.parse('2026-11-13T03:00:00Z'), cny: 20, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
      { id: 't4', at: Date.parse('2026-11-13T04:00:00Z'), cny: 18, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account' },
    ], {
      now: Date.parse('2026-11-13T05:00:00Z'), todayKey: '2026-11-13', usdToCny: 7.1,
      estimatedTodayCny: 5, estimatedMonthCny: 30, links: null,
      status: 'ready', enabled: true, refreshSeconds: 30, error: null,
    });
    assert.equal(toppedUp.todayTopUp, true);
    assert.ok(Math.abs(toppedUp.todaySpentCny - 4) < 1e-9);
    const empty = balanceView([], {
      now: 1, todayKey: '2026-11-13', usdToCny: 7.1, estimatedTodayCny: 1, estimatedMonthCny: 2,
      links: null, status: 'loading', enabled: true, refreshSeconds: 30, error: null,
    });
    assert.equal(empty.ready, false);
    assert.equal(empty.totalCny, null);
    assert.equal(empty.todaySpentCny, null);
    assert.equal(shouldAppendBalance(row, row, row.at + 60000), false);
    assert.equal(shouldAppendBalance(row, { ...row, cny: row.cny - 0.2 }, row.at + 60000), true);
  });

  await testAsync('wallet reflects the account service and persists observed changes', async () => {
    let balanceValue = '12.00';
    const accountCalls = [];
    const account = {
      getBalance: async (meta) => {
        accountCalls.push(meta);
        return { status: 'ready', value: [{ currency: 'CNY', balance: balanceValue }], bonusWallets: [{ currency: 'CNY', balance: '0' }] };
      },
      getState: async () => ({ status: 'credential-stored', links: { usageUrl: 'https://platform.test/usage', topUpUrl: 'https://platform.test/topup' }, attempt: null }),
    };
    const walletDomain = createDomain();
    const wallet = new UsageBillingService(createCtx({ sessions: [], account }));
    try {
    await wallet.attach(walletDomain);
    await waitUntil(() => wallet.ready);
    const first = await wallet.balance();
    assert.equal(first.status, 'ready');
    assert.ok(Math.abs(first.totalCny - 12) < 1e-9);
    assert.equal(first.links.topUpUrl, 'https://platform.test/topup');
    assert.ok(accountCalls.length >= 1);
    assert.equal(accountCalls[0].timezoneOffsetSeconds, -new Date().getTimezoneOffset() * 60);
    assert.equal(accountCalls[0].version, manifestVersion);
    balanceValue = '11.80';
    const second = await wallet.refreshBalance(true);
    assert.equal(second.status, 'ready');
    assert.ok(Math.abs(second.totalCny - 11.80) < 1e-9);
    assert.ok(Math.abs(second.deltaCny + 0.2) < 1e-9);
    const overview = await wallet.overview('month', true, null);
    assert.equal(overview.balance.status, 'ready');
    assert.ok(Math.abs(overview.balance.totalCny - 11.80) < 1e-9);
    const status = await wallet.status();
    assert.equal(status.balance.account, true);
    assert.ok(status.balance.samples >= 2);
    await wallet.savePrefs({ balanceEnabled: false });
    const paused = await wallet.balance();
    assert.equal(paused.status, 'disabled');
    assert.ok(walletDomain.tables.get('balances') !== undefined && walletDomain.tables.get('balances').size >= 2);
    } finally {
      await wallet.dispose();
    }
  });

  await testAsync('signed-out and missing account service degrade without throwing', async () => {
    const signedOut = new UsageBillingService(createCtx({ sessions: [], account: { getBalance: async () => null, getState: async () => ({ links: { usageUrl: '', topUpUrl: '' } }) } }));
    await signedOut.attach(createDomain());
    await waitUntil(() => signedOut.ready);
    assert.equal((await signedOut.balance()).status, 'signedOut');
    await signedOut.dispose();
    const missing = new UsageBillingService(createCtx({ sessions: [] }));
    await missing.attach(createDomain());
    await waitUntil(() => missing.ready);
    const view = await missing.balance();
    assert.equal(view.status, 'unavailable');
    assert.equal(view.totalCny, null);
    await missing.dispose();
  });

  await testAsync('network pricing failure degrades without throwing', async () => {
    const result = await service.refreshPricing(true);
    // Network may be unavailable in the sandbox: both outcomes are accepted,
    // but a failed refresh must not throw and must keep the built-in catalog.
    assert.equal(typeof result.ok, 'boolean');
    const pricing = await service.pricing();
    assert.ok(Object.keys(pricing.entries).some(key => key.includes('deepseek')));
  });

  await service.dispose();

  const failed = results.filter(item => item.ok === false);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
