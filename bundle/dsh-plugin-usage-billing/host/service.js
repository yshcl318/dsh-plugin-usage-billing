/**
 * Host half of the usage-billing plugin: one Remote-callable service.
 *
 * Responsibilities:
 * - fold `assistant/message` usage into a durable, per-day ledger (write-time
 *   price lock: a row's price is resolved from the price snapshot that was in
 *   effect at the event time, and never changes afterwards);
 * - seed a built-in catalog, optionally refresh it from the network with a
 *   graceful fallback to the built-in catalog and a default FX rate;
 * - expose the aggregate views through Typert Remote to the plugin's own
 *   Client half;
 * - track the monthly budget and its 50/80/100% one-shot notices.
 *
 * The service registers itself under `ctx.usageBilling` through
 * `TypertRemoteService`; it is created before the storage domain finishes
 * opening, so every method answers a safe "not ready" snapshot until then.
 */

import { createRequire } from 'node:module';

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

import {
  BUILTIN_CATALOG, CNY, DEFAULT_USD_TO_CNY, HOLIDAY_DATA_THROUGH, OFF_PEAK_RATIO,
  dayKeyAt, nextTierSwitchAt, normalizeProvider, priceKeyCandidates, priceUsage,
  splitUsage, tierAndFactorAt, tierAt, tierDayProfileAt,
} from './pricing.js';
import {
  DEFAULT_PREFS, USAGE_BILLING_DOMAIN, domainSchemaRuntime, ledgerRowId,
} from './domain.js';
import {
  buildByWorkspace, buildDaily, buildHeatmap, buildMarkers, buildOverview,
  buildSessionCost, buildTodaySplit, filterRows, mergeByModel,
} from './ledger.js';
import {
  extractUsageItems, listStoredSessions, readSessionEvents, sessionMetaOf, warn,
} from './collector.js';
import {
  balanceView, emptyBalanceView, normalizeAccountBalance, pruneBalanceHistory,
  shouldAppendBalance, snapshotFromBalance,
} from './balance.js';

/** Wire namespace and Cordis service key. */
export const REMOTE_NAMESPACE = 'usageBilling';

/** Ordered Remote surface; the Client half must declare the same list. */
export const REMOTE_METHODS = Object.freeze([
  'overview', 'sessionCost', 'daily', 'byModel', 'byWorkspace',
  'pricing', 'prefs', 'savePrefs', 'setCustomPrice', 'removeCustomPrice',
  'refreshPricing', 'setAlias', 'aliasList', 'repricing', 'status', 'dismissBackfill',
  'dismissBudgetNotice', 'balance', 'refreshBalance',
]);

const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods';

/** Manual replica of the @Remote decorator artifact (no build-time transform). */
function markRemoteMethods(prototype, methods) {
  Object.defineProperty(prototype, REMOTE_METHODS_KEY, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(methods.map(method => Object.freeze({
        method,
        invocation: Object.freeze({ kind: 'direct' }),
      }))),
    }),
  });
}

const requireFromBundle = createRequire(import.meta.url);
let packageVersionCache = null;

/** Bundle version reported to the account service (no hardcoded release tag). */
function packageVersion() {
  if (packageVersionCache !== null) return packageVersionCache;
  try {
    const manifest = requireFromBundle('../package.json');
    packageVersionCache = typeof manifest?.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    packageVersionCache = '0.0.0';
  }
  return packageVersionCache;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BUDGET_TIERS = Object.freeze([0.5, 0.8, 1]);
const MAX_SNAPSHOTS = 40;
const DEFAULT_REFRESH_HOURS = 6;
const REFRESH_CHECK_MS = 15 * 60 * 1000;

const EMPTY_OVERVIEW = Object.freeze({
  totalCny: 0, todayCny: 0, weekCny: 0, avgDailyCny: 0, cacheHitRate: 0,
  calls: 0, unpricedRows: 0, pricedCalls: 0, dayCount: 0,
  hasBackfilled: false, unpricedModels: [],
  tokens: Object.freeze({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }),
});

function clampMoney(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1e8);
}

function parseDayMs(day) {
  const parsed = Date.parse(`${day}T00:00:00+08:00`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function aliasStorageKey(provider, rawModel) {
  return Buffer.from(`${normalizeProvider(provider)}\u0000${String(rawModel).trim()}`, 'utf8').toString('base64url');
}

/** The one service the plugin exposes. */
export class UsageBillingService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, REMOTE_NAMESPACE);
    this.ctx = ctx;
    this.logger = ctx.logger;
    this.ready = false;
    this.closed = false;
    this.domain = null;
    this.tables = null;
    this.installAt = 0;
    this.meta = { budgetNotified: {} };
    this.prefsData = /** @type {any} */ ({ ...DEFAULT_PREFS });
    this.snapshots = [];
    this.catalog = { ...BUILTIN_CATALOG };
    this.custom = {};
    this.customKeys = [];
    this.aliases = new Map();
    this.rowIds = new Set();
    this.rowsCache = null;
    this.writeChain = Promise.resolve();
    this.refreshChain = /** @type {Promise<any>} */ (Promise.resolve());
    this.backfillState = { active: false, done: false, scanned: 0, folded: 0, skipped: 0, failures: 0, rows: 0 };
    this.diag = new Map();
    this.liveQueue = [];
    this.liveScheduled = false;
    this.timers = [];
    this.startedAt = Date.now();
    this.account = null;
    this.balanceHistory = [];
    this.balanceStatus = 'loading';
    this.balanceError = null;
    this.balanceFetchedAt = 0;
    this.balanceInflight = null;
    this.balanceLinks = null;
    this.balanceKickAt = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Attach the opened storage domain, seed the base snapshot, start live
   * collection and the asynchronous backfill. Never throws.
   */
  async attach(domain) {
    if (this.closed) {
      await domain.close().catch(() => {});
      return;
    }
    this.domain = domain;
    this.tables = {
      ledger: domain.table('ledger'),
      sessions: domain.table('sessions'),
      snapshots: domain.table('snapshots'),
      aliases: domain.table('aliases'),
      custom: domain.table('custom'),
      prefs: domain.table('prefs'),
      diag: domain.table('diag'),
      balances: domain.table('balances'),
    };
    this.meta = normalizeMeta(domain.global.get());
    this.loadSnapshots();
    this.loadPrefs();
    this.loadAliases();
    this.loadCustomPrices();
    this.loadDiagnostics();
    this.loadBalanceHistory();
    this.resolveAccount();
    this.indexRows();
    await this.ensureBaseSnapshot();
    this.ready = true;
    this.subscribeLive();
    this.startTimers();
    setTimeout(() => { void this.backfill(); }, 250);
    setTimeout(() => { void this.refreshPricing(false).catch(error => warn(this.ctx, 'initial price refresh failed', error)); }, 4000);
    if (this.account !== null) {
      const timer = setTimeout(() => { void this.fetchBalance(false).catch(error => warn(this.ctx, 'initial balance refresh failed', error)); }, 1200);
      this.timers.push(timer);
    }
  }

  /** Detach everything this service owns. */
  async dispose() {
    this.closed = true;
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.timers = [];
    this.liveQueue = [];
    if (this.domain !== null) {
      const domain = this.domain;
      this.domain = null;
      await domain.close().catch(() => {});
    }
  }

  subscribeLive() {
    this.ctx.on('session/event', (session, event) => {
      if (!this.ready || this.closed) return;
      if (event?.type !== 'assistant/message') return;
      const usage = event.data?.usage;
      if (usage === undefined || usage === null) return;
      this.liveQueue.push({ header: session.header, event });
      if (this.liveScheduled) return;
      this.liveScheduled = true;
      setTimeout(() => { void this.drainLive(); }, 20);
    });
  }

  startTimers() {
    const timer = setInterval(() => {
      if (this.closed) return;
      if (this.prefsData.autoRefreshPricing === false) return;
      void this.refreshPricing(false).catch(error => warn(this.ctx, 'background price refresh failed', error));
    }, REFRESH_CHECK_MS);
    this.timers.push(timer);
    // The wallet is refreshed lazily by client requests and after live usage.
    // No idle platform polling: with no open UI there is no background timer.
  }

  /* ---------------------------------------------------------------- */
  /* Writes: serial queue + ledger shards                             */
  /* ---------------------------------------------------------------- */

  enqueue(operation) {
    const next = this.writeChain.then(operation, operation);
    this.writeChain = next.catch(() => {});
    return next;
  }

  async drainLive() {
    this.liveScheduled = false;
    const batch = this.liveQueue.splice(0, this.liveQueue.length);
    if (batch.length === 0) return;
    await this.enqueue(async () => {
      for (const item of batch) {
        try {
          await this.recordAssistant(item.header, item.event);
        } catch (error) {
          warn(this.ctx, 'write failed', error);
        }
      }
    }).catch(error => warn(this.ctx, 'live usage queue failed', error));
  }

  async recordAssistant(header, event) {
    const meta = sessionMetaOf(header);
    const id = ledgerRowId(meta.sessionId, event.seq);
    if (this.rowIds.has(id)) return;
    const row = this.buildRow(meta, {
      seq: event.seq,
      time: event.time,
      provider: event.data?.message?.source?.provider ?? 'unknown',
      model: event.data?.message?.source?.model ?? 'unknown',
      usage: event.data.usage,
    }, false);
    await this.putRows([row]);
    this.noteUsageForBalance();
    const previous = this.tables.sessions.get(meta.sessionId);
    await this.tables.sessions.put(meta.sessionId, {
      sessionId: meta.sessionId,
      ...(meta.cwd === undefined ? {} : { cwd: meta.cwd }),
      lastTime: Math.max(event.time, previous?.lastTime ?? 0),
      foldedThroughSeq: Math.max(event.seq, previous?.foldedThroughSeq ?? -1),
      revision: null,
      isSubagent: meta.isSubagent,
    });
  }

  buildRow(meta, item, backfilled) {
    const snapshot = this.snapshotAt(item.time);
    const alias = this.aliases.get(aliasStorageKey(item.provider, item.model));
    const keys = priceKeyCandidates(item.provider, item.model, alias);
    const { tier, factor } = tierAndFactorAt(item.time);
    const priced = priceUsage(item.usage, snapshot.entries, keys, snapshot.usdToCny, factor);
    const usage = splitUsage(item.usage);
    return {
      id: ledgerRowId(meta.sessionId, item.seq),
      sessionId: meta.sessionId,
      seq: item.seq,
      time: item.time,
      provider: item.provider,
      model: item.model,
      day: dayKeyAt(item.time),
      ...(meta.cwd === undefined ? {} : { cwd: meta.cwd }),
      isSubagent: meta.isSubagent,
      ...(meta.delegationDepth === undefined ? {} : { delegationDepth: meta.delegationDepth }),
      input: usage.input,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      output: usage.output,
      ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
      costCny: priced.costCny,
      currency: priced.currency,
      priced: priced.priced,
      snapshotId: snapshot.id,
      tier,
      backfilled,
    };
  }

  async putRows(rows) {
    const byDay = new Map();
    for (const row of rows) {
      if (this.rowIds.has(row.id)) continue;
      const list = byDay.get(row.day) ?? [];
      list.push(row);
      byDay.set(row.day, list);
    }
    for (const [day, list] of byDay) {
      const existing = this.tables.ledger.get(day);
      const merged = existing === undefined ? list.slice() : [...existing.rows, ...list];
      merged.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
      await this.tables.ledger.put(day, { v: 1, day, rows: merged });
      for (const row of list) this.rowIds.add(row.id);
    }
    if (byDay.size > 0) this.rowsCache = null;
  }

  indexRows() {
    this.rowIds = new Set();
    for (const [, shard] of this.tables.ledger.entries()) {
      for (const row of shard.rows) this.rowIds.add(row.id);
    }
    this.rowsCache = null;
  }

  allRows() {
    if (this.rowsCache !== null) return this.rowsCache;
    const rows = [];
    for (const [, shard] of this.tables.ledger.entries()) {
      for (const row of shard.rows) rows.push(row);
    }
    rows.sort((a, b) => a.time - b.time);
    this.rowsCache = rows;
    return rows;
  }

  /* ---------------------------------------------------------------- */
  /* Backfill (asynchronous, never on the apply path)                 */
  /* ---------------------------------------------------------------- */

  async backfill() {
    if (!this.ready || this.closed || this.backfillState.active) return;
    this.backfillState.active = true;
    try {
      const sessions = await listStoredSessions(this.ctx);
      this.backfillState.scanned = sessions.length;
      let changed = false;
      for (const { header, revision } of sessions) {
        if (this.closed) break;
        const meta = sessionMetaOf(header);
        const folded = this.tables.sessions.get(meta.sessionId);
        if (folded !== undefined && revision !== null && folded.revision === revision) {
          this.backfillState.skipped += 1;
          continue;
        }
        try {
          const { events, inheritedEventCount } = await readSessionEvents(this.ctx, meta.sessionId);
          const { items, lastSeq, lastTime } = extractUsageItems(events, inheritedEventCount);
          const rows = [];
          for (const item of items) {
            const id = ledgerRowId(meta.sessionId, item.seq);
            if (this.rowIds.has(id)) continue;
            rows.push(this.buildRow(meta, item, item.time < this.installAt));
          }
          if (rows.length > 0) {
            await this.enqueue(() => this.putRows(rows));
            this.backfillState.rows += rows.length;
            changed = true;
          }
          await this.enqueue(() => this.tables.sessions.put(meta.sessionId, {
            sessionId: meta.sessionId,
            ...(meta.cwd === undefined ? {} : { cwd: meta.cwd }),
            lastTime: Math.max(lastTime, folded?.lastTime ?? 0),
            foldedThroughSeq: Math.max(lastSeq, folded?.foldedThroughSeq ?? -1),
            revision,
            isSubagent: meta.isSubagent,
          }));
          this.backfillState.folded += 1;
        } catch (error) {
          this.backfillState.failures += 1;
          await this.recordDiag('session-read', `${meta.sessionId}: ${String(error?.message ?? error)}`);
        }
        await new Promise(resolve => setImmediate(resolve));
      }
      if (changed) this.rowsCache = null;
      this.backfillState.done = true;
      const nextMeta = { ...this.meta, backfilledAt: Date.now() };
      this.meta = nextMeta;
      await this.enqueue(() => this.domain.global.set(nextMeta)).catch(() => {});
      if (this.backfillState.rows > 0) {
        this.logger.info(`[usage-billing] backfill done: ${this.backfillState.rows} rows / ${this.backfillState.folded} sessions`);
      }
    } catch (error) {
      warn(this.ctx, 'backfill failed', error);
    } finally {
      this.backfillState.active = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Prices: snapshots, custom entries, aliases, network refresh      */
  /* ---------------------------------------------------------------- */

  loadSnapshots() {
    this.snapshots = [];
    for (const [, snapshot] of this.tables.snapshots.entries()) this.snapshots.push(snapshot);
    this.snapshots.sort((a, b) => a.at - b.at);
    const latest = this.snapshots.at(-1);
    if (latest !== undefined) {
      this.catalog = { ...latest.entries };
    }
  }

  currentSnapshot() {
    return this.snapshots.at(-1) ?? null;
  }

  snapshotAt(time) {
    let found = null;
    for (const snapshot of this.snapshots) {
      if (snapshot.at <= time) found = snapshot;
      else break;
    }
    if (found !== null) return found;
    const base = this.snapshots.find(snapshot => snapshot.kind === 'base');
    return base ?? (this.snapshots[0] ?? this.fallbackSnapshot());
  }

  fallbackSnapshot() {
    return {
      id: 'snap-fallback', at: 0, kind: 'base', reason: 'install',
      usdToCny: DEFAULT_USD_TO_CNY, usdToCnySource: 'default',
      entries: { ...BUILTIN_CATALOG },
    };
  }

  mergedEntries() {
    return { ...this.catalog, ...this.custom };
  }

  async ensureBaseSnapshot() {
    let meta = this.meta;
    let changed = false;
    if (typeof meta.installAt !== 'number') {
      meta = { ...meta, installAt: Date.now() };
      changed = true;
    }
    this.installAt = meta.installAt;
    if (this.snapshots.length === 0) {
      const at = this.installAt;
      const snapshot = {
        id: `snap-${at}-base`,
        at,
        kind: 'base',
        reason: 'install',
        usdToCny: DEFAULT_USD_TO_CNY,
        usdToCnySource: 'default',
        entries: { ...this.catalog, ...this.custom },
      };
      this.snapshots = [snapshot];
      await this.tables.snapshots.put(snapshot.id, snapshot);
      meta = { ...meta, baseSnapshotId: snapshot.id };
      changed = true;
    }
    if (typeof meta.backupSnapshotId === 'string') delete meta.backupSnapshotId;
    if (!isPlainObject(meta.budgetNotified)) {
      meta = { ...meta, budgetNotified: {} };
      changed = true;
    }
    if (changed) {
      this.meta = meta;
      await this.domain.global.set(meta);
    }
  }

  async appendSnapshot(reason, entries, usdToCny, usdToCnySource) {
    const at = Date.now();
    const snapshot = {
      id: `snap-${at}-${reason}-${Math.max(0, this.snapshots.length + 1)}`,
      at,
      kind: 'delta',
      reason,
      usdToCny,
      usdToCnySource,
      entries,
    };
    this.snapshots.push(snapshot);
    this.snapshots.sort((a, b) => a.at - b.at);
    await this.tables.snapshots.put(snapshot.id, snapshot);
    await this.pruneSnapshots();
    this.rowsCache = null;
    return snapshot;
  }

  async pruneSnapshots() {
    if (this.snapshots.length <= MAX_SNAPSHOTS) return;
    const base = this.snapshots.find(snapshot => snapshot.kind === 'base');
    const doomed = this.snapshots.slice(0, this.snapshots.length - MAX_SNAPSHOTS)
      .filter(snapshot => snapshot.id !== base?.id);
    for (const snapshot of doomed) {
      await this.tables.snapshots.delete(snapshot.id);
      this.snapshots = this.snapshots.filter(candidate => candidate.id !== snapshot.id);
    }
  }

  loadPrefs() {
    const stored = this.tables.prefs.get('default');
    this.prefsData = /** @type {any} */ ({ ...DEFAULT_PREFS, ...(stored ?? {}) });
    this.prefsData.monthlyCny = clampMoney(this.prefsData.monthlyCny, DEFAULT_PREFS.monthlyCny);
  }

  loadAliases() {
    this.aliases = new Map();
    for (const [key, alias] of this.tables.aliases.entries()) this.aliases.set(key, alias);
  }

  loadCustomPrices() {
    const record = this.tables.custom.get('all');
    this.custom = record === undefined ? {} : { ...record.entries };
    this.customKeys = Object.keys(this.custom).sort();
  }

  loadDiagnostics() {
    this.diag = new Map();
    for (const [key, value] of this.tables.diag.entries()) this.diag.set(key, value);
  }

  async recordDiag(kind, detail) {
    const id = kind;
    const previous = this.diag.get(id);
    const now = Date.now();
    const record = {
      id,
      at: previous?.at ?? now,
      lastAt: now,
      count: (previous?.count ?? 0) + 1,
      kind,
      detail: String(detail).slice(0, 500),
    };
    this.diag.set(id, record);
    try {
      await this.tables.diag.put(id, record);
    } catch {
      /* diagnostics are best-effort */
    }
  }

  async refreshPricing(force) {
    if (!this.ready) return { ok: false, reason: 'initializing', entries: 0, usdToCny: DEFAULT_USD_TO_CNY, partial: false };
    const run = this.refreshChain.then(() => this.doRefresh(Boolean(force)), () => this.doRefresh(Boolean(force)));
    this.refreshChain = run.catch(() => {});
    return run;
  }

  async doRefresh(force) {
    if (this.closed) return { ok: false, reason: 'disposed', entries: Object.keys(this.mergedEntries()).length, usdToCny: DEFAULT_USD_TO_CNY, partial: false };
    const now = Date.now();
    const refreshHours = Number.isFinite(this.prefsData.refreshHours) ? this.prefsData.refreshHours : DEFAULT_REFRESH_HOURS;
    const lastCatalog = [...this.snapshots].reverse().find(snapshot => snapshot.reason === 'catalog-refresh');
    if (!force && lastCatalog !== undefined && now - lastCatalog.at < refreshHours * 3600 * 1000) {
      return {
        ok: true, cached: true, reason: null,
        entries: Object.keys(this.mergedEntries()).length,
        usdToCny: (this.currentSnapshot() ?? this.fallbackSnapshot()).usdToCny,
        usdToCnySource: (this.currentSnapshot() ?? this.fallbackSnapshot()).usdToCnySource,
        partial: false,
      };
    }
    let catalog = { ...BUILTIN_CATALOG };
    let usdToCny = DEFAULT_USD_TO_CNY;
    let usdToCnySource = 'default';
    let partial = false;
    let reason = null;
    try {
      const fetched = await fetchModelCatalog();
      if (fetched.entries !== undefined && Object.keys(fetched.entries).length > 0) {
        catalog = { ...catalog, ...fetched.entries };
      }
      partial = fetched.partial;
    } catch (error) {
      reason = `catalog fetch failed: ${String(error?.message ?? error)}`;
      await this.recordDiag('pricing-fetch', reason);
    }
    try {
      const liveRate = await fetchUsdToCny();
      if (liveRate !== null) {
        usdToCny = liveRate;
        usdToCnySource = 'live';
      }
    } catch (error) {
      await this.recordDiag('pricing-fetch', `exchange-rate fetch failed: ${String(error?.message ?? error)}`);
    }
    if (reason !== null && usdToCnySource === 'default' && Object.keys(catalog).length === Object.keys(BUILTIN_CATALOG).length) {
      return { ok: false, reason, entries: Object.keys(catalog).length, usdToCny, usdToCnySource, partial };
    }
    this.catalog = catalog;
    const entries = { ...catalog, ...this.custom };
    await this.enqueue(() => this.appendSnapshot('catalog-refresh', entries, usdToCny, usdToCnySource));
    return {
      ok: true, cached: false, reason,
      entries: Object.keys(entries).length,
      usdToCny, usdToCnySource, partial,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Aggregation helpers                                              */
  /* ---------------------------------------------------------------- */

  todayKey() {
    return dayKeyAt(Date.now());
  }

  monthDays(now = Date.now()) {
    const today = dayKeyAt(now);
    const first = `${today.slice(0, 7)}-01`;
    return enumerateDays(first, today);
  }

  rangeDays(kind) {
    const now = Date.now();
    const today = dayKeyAt(now);
    if (kind === 'month') return this.monthDays(now);
    if (kind === '7d') return lastDays(today, 7);
    if (kind === '30d') return lastDays(today, 30);
    const all = this.allRows();
    if (all.length === 0) return [today];
    const earliest = all[0].day;
    const span = Math.min(90, Math.max(1, dayDiff(earliest, today) + 1));
    return lastDays(today, span);
  }

  scopeRows(days, includeSubagents, now = Date.now()) {
    const set = new Set(days);
    const rows = this.allRows().filter(row => set.has(row.day));
    return filterRows(rows, includeSubagents);
  }

  async budgetOf(spentCny, includeSubagents) {
    const monthlyCny = clampMoney(this.prefsData.monthlyCny, DEFAULT_PREFS.monthlyCny);
    const enabled = this.prefsData.budgetEnabled !== false && monthlyCny > 0;
    const monthKey = this.todayKey().slice(0, 7);
    const notified = isPlainObject(this.meta.budgetNotified) ? this.meta.budgetNotified : {};
    const pendingAll = isPlainObject(this.meta.budgetPending) ? this.meta.budgetPending : {};
    const seen = Array.isArray(notified[monthKey]) ? notified[monthKey].map(Number) : [];
    const pending = Number(pendingAll[monthKey]) || 0;
    const pct = monthlyCny <= 0 ? 0 : spentCny / monthlyCny;
    const crossed = BUDGET_TIERS.filter(tier => pct >= tier).map(tier => Math.round(tier * 100));
    const fresh = crossed.filter(value => !seen.includes(value));
    let nextPending = pending;
    if (enabled && fresh.length > 0) {
      nextPending = Math.max(pending, ...fresh);
      this.meta = {
        ...this.meta,
        budgetNotified: { ...notified, [monthKey]: [...new Set([...seen, ...crossed])].sort((a, b) => a - b) },
        budgetPending: { ...pendingAll, [monthKey]: nextPending },
      };
      await this.enqueue(() => this.domain.global.set(this.meta)).catch(() => {});
    }
    const notice = enabled && nextPending > 0 ? nextPending : null;
    return {
      enabled,
      monthlyCny,
      spentCny,
      pct,
      level: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok',
      notice,
      notified: crossed,
      color: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok',
      includeSubagents,
    };
  }

  /** Clear the one unacknowledged budget notice for a month (the user saw it). */
  async dismissBudgetNotice(month) {
    if (!this.ready) return { ok: false, reason: 'initializing' };
    const monthKey = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
      ? month
      : this.todayKey().slice(0, 7);
    const pendingAll = isPlainObject(this.meta.budgetPending) ? { ...this.meta.budgetPending } : {};
    if (Object.prototype.hasOwnProperty.call(pendingAll, monthKey)) {
      delete pendingAll[monthKey];
      this.meta = { ...this.meta, budgetPending: pendingAll };
      await this.enqueue(() => this.domain.global.set(this.meta)).catch(() => {});
    }
    return { ok: true, month: monthKey };
  }

  tierStatus() {
    const now = Date.now();
    return {
      current: tierAt(now),
      nextSwitchAt: nextTierSwitchAt(now),
      holidayDataThrough: HOLIDAY_DATA_THROUGH,
      day: tierDayProfileAt(now),
      offPeakRatio: OFF_PEAK_RATIO,
    };
  }

  pricingMeta() {
    const snapshot = this.currentSnapshot() ?? this.fallbackSnapshot();
    return {
      snapshotId: snapshot.id,
      usdToCny: snapshot.usdToCny,
      usdToCnySource: snapshot.usdToCnySource,
      live: snapshot.usdToCnySource === 'live' && snapshot.reason !== 'install',
      entries: Object.keys(this.mergedEntries()).length,
      customKeys: this.customKeys,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Actual account balance (via the platform account service)        */
  /* ---------------------------------------------------------------- */

  /** Resolve the optional account service; absence only hides the wallet. */
  resolveAccount() {
    try {
      const account = this.ctx.get('deepseekAccount');
      this.account = account !== null && account !== undefined && typeof account.getBalance === 'function'
        ? account
        : null;
    } catch (error) {
      this.account = null;
      warn(this.ctx, 'read account service failed', error);
    }
    if (this.account === null) {
      this.balanceStatus = this.effectivePrefs().balanceEnabled === false ? 'disabled' : 'unavailable';
    }
  }

  /** Rehydrate the observed wallet history from the domain. */
  loadBalanceHistory() {
    this.balanceHistory = [];
    for (const [, row] of this.tables.balances.entries()) {
      if (row !== null && typeof row === 'object' && typeof row.at === 'number') this.balanceHistory.push(row);
    }
    this.balanceHistory.sort((a, b) => a.at - b.at);
    this.balanceFetchedAt = this.balanceHistory.at(-1)?.at ?? 0;
    if (this.balanceHistory.length > 0) this.balanceStatus = 'ready';
  }

  /** Client metadata the account service expects for its queries. */
  accountClientMeta() {
    return {
      version: packageVersion(),
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    };
  }

  async loadBalanceLinks() {
    try {
      const state = await this.account.getState();
      const links = state?.links;
      if (links !== undefined && links !== null) {
        this.balanceLinks = {
          usageUrl: String(links.usageUrl ?? ''),
          topUpUrl: String(links.topUpUrl ?? ''),
        };
      }
    } catch {
      /* links are decorative; never fail the balance */
    }
  }

  /**
   * Refresh the wallet observation unless the preference cache is still warm.
   * Returns the current client-safe view in every outcome.
   */
  async fetchBalance(force) {
    if (this.closed) return this.balanceSnapshot();
    const prefs = this.effectivePrefs();
    if (prefs.balanceEnabled === false) {
      this.balanceStatus = 'disabled';
      return this.balanceSnapshot();
    }
    if (this.account === null) {
      this.balanceStatus = 'unavailable';
      return this.balanceSnapshot();
    }
    const ttl = Math.max(10, prefs.balanceRefreshSeconds) * 1000;
    if (force !== true && this.balanceFetchedAt > 0 && Date.now() - this.balanceFetchedAt < ttl) {
      return this.balanceSnapshot();
    }
    if (this.balanceInflight !== null) return this.balanceInflight;
    this.balanceInflight = (async () => {
      try {
        const details = await this.account.getBalance(this.accountClientMeta());
        const normalized = normalizeAccountBalance(details);
        this.balanceStatus = normalized.status;
        this.balanceError = normalized.error;
        if (normalized.status === 'ready') {
          const at = Date.now();
          const row = snapshotFromBalance(details, at);
          if (row !== null) row.id = 'bal-' + at + '-' + String(this.balanceHistory.length);
          if (row !== null && shouldAppendBalance(this.balanceHistory.at(-1), row, at)) {
            this.balanceHistory.push(row);
            const removed = pruneBalanceHistory(this.balanceHistory);
            try {
              await this.tables.balances.put(row.id, row);
              for (const old of removed) await this.tables.balances.delete(old.id);
            } catch (error) {
              warn(this.ctx, 'persist balance snapshot failed', error);
            }
          }
          this.balanceFetchedAt = at;
        } else if (normalized.status === 'signedOut') {
          this.balanceFetchedAt = Date.now();
        } else {
          this.balanceFetchedAt = 0;
        }
        if (this.balanceLinks === null) await this.loadBalanceLinks();
      } catch (error) {
        this.balanceStatus = 'failed';
        this.balanceError = String(error?.message ?? error);
        this.balanceFetchedAt = 0;
        warn(this.ctx, 'account balance query failed', error);
      } finally {
        this.balanceInflight = null;
      }
      return this.balanceSnapshot();
    })();
    return this.balanceInflight;
  }

  /** Local estimated cost of one Beijing day / month (same scope as the UI). */
  estimatedCny(includeSubagents, days) {
    if (!this.ready) return null;
    return this.scopeRows(days, includeSubagents).reduce((total, row) => total + row.costCny, 0);
  }

  /** The snapshot the Client renders; never throws. */
  balanceSnapshot() {
    let prefs = DEFAULT_PREFS;
    try {
      prefs = this.effectivePrefs();
    } catch {
      /* keep defaults */
    }
    try {
      return balanceView(this.balanceHistory, {
        now: Date.now(),
        todayKey: this.todayKey(),
        usdToCny: this.currentSnapshot()?.usdToCny ?? DEFAULT_USD_TO_CNY,
        estimatedTodayCny: this.estimatedCny(prefs.includeSubagents, [this.todayKey()]),
        estimatedMonthCny: this.estimatedCny(prefs.includeSubagents, this.monthDays()),
        links: this.balanceLinks,
        status: this.balanceStatus,
        enabled: prefs.balanceEnabled,
        refreshSeconds: prefs.balanceRefreshSeconds,
        error: this.balanceError,
        checkedAt: this.balanceFetchedAt > 0 ? this.balanceFetchedAt : null,
      });
    } catch {
      return emptyBalanceView(prefs.balanceRefreshSeconds);
    }
  }

  /** Refresh the wallet soon after a live response; debounced, never throws. */
  noteUsageForBalance() {
    if (!this.ready || this.closed || this.account === null) return;
    if (this.effectivePrefs().balanceEnabled === false) return;
    const now = Date.now();
    if (now - this.balanceKickAt < 9000) return;
    this.balanceKickAt = now;
    const timer = setTimeout(() => {
      void this.fetchBalance(true).catch(() => {});
    }, 8000);
    this.timers.push(timer);
  }

  /* ---------------------------------------------------------------- */
  /* Remote: aggregates                                               */
  /* ---------------------------------------------------------------- */

  async overview(rangeKind, includeSubagents, cwd) {
    const kind = normalizeRange(rangeKind);
    const subagents = includeSubagents !== false;
    if (!this.ready) return this.notReadyOverview();
    const days = this.rangeDays(kind);
    const rows = this.scopeRows(days, subagents);
    const monthRows = this.scopeRows(this.monthDays(), subagents);
    const monthCny = monthRows.reduce((total, row) => total + row.costCny, 0);
    const allRows = filterRows(this.allRows(), subagents);
    const today = this.todayKey();
    const currentCwd = typeof cwd === "string" && cwd !== "" ? cwd : undefined;
    const budget = await this.budgetOf(monthCny, subagents);
    if (this.balanceFetchedAt === 0 || Date.now() - this.balanceFetchedAt > 20000) {
      void this.fetchBalance(false).catch(error => warn(this.ctx, 'overview balance refresh failed', error));
    }
    return {
      ready: true,
      range: kind,
      todayKey: today,
      overview: buildOverview(rows, { todayKey: today, weekDays: lastDays(today, 7) }),
      month: { ...budget, monthKey: today.slice(0, 7) },
      todaySplit: (() => {
        const split = buildTodaySplit(rows, { todayKey: today, cwd: currentCwd });
        return { ...split, hasProject: currentCwd !== undefined, totalCalls: split.projectCalls + split.otherCalls };
      })(),
      cumulative: {
        totalCny: allRows.reduce((total, row) => total + row.costCny, 0),
        calls: allRows.length,
        sessions: new Set(allRows.map(row => row.sessionId)).size,
        subagentSessions: new Set(allRows.filter(row => row.isSubagent).map(row => row.sessionId)).size,
        workspaces: new Set(allRows.map(row => (typeof row.cwd === 'string' ? row.cwd : '')).values()).size,
      },
      tier: this.tierStatus(),
      pricing: this.pricingMeta(),
      balance: this.balanceSnapshot(),
      prefs: this.effectivePrefs(),
    };
  }

  async sessionCost(sessionId, includeSubagents) {
    if (!this.ready) {
      return { ready: false, sessionId: String(sessionId ?? ''), costCny: 0, todayCny: 0, calls: 0, unpriced: 0 };
    }
    const subagents = includeSubagents !== false;
    const rows = filterRows(this.allRows().filter(row => row.sessionId === String(sessionId)), subagents);
    const cost = buildSessionCost(rows, String(sessionId), this.todayKey());
    const month = await this.budgetOf(
      this.scopeRows(this.monthDays(), subagents).reduce((total, row) => total + row.costCny, 0),
      subagents,
    );
    return { ready: true, ...cost, budget: month, tier: this.tierStatus() };
  }

  async daily(rangeKind, includeSubagents) {
    const kind = normalizeRange(rangeKind);
    const subagents = includeSubagents !== false;
    if (!this.ready) return { ready: false, days: [], hasBackfilled: false, unpricedModels: [], daysInRange: [] };
    const days = this.rangeDays(kind);
    const rows = this.scopeRows(days, subagents);
    const markers = buildMarkers(rows);
    return {
      ready: true,
      range: kind,
      days: buildDaily(rows, days),
      heatmap: buildHeatmap(rows, lastDays(this.todayKey(), 90)),
      hasBackfilled: markers.hasBackfilled,
      unpricedModels: markers.unpricedModels,
    };
  }

  async byModel(rangeKind, includeSubagents) {
    const kind = normalizeRange(rangeKind);
    const subagents = includeSubagents !== false;
    if (!this.ready) return { ready: false, models: [], hasBackfilled: false, unpricedModels: [] };
    const rows = this.scopeRows(this.rangeDays(kind), subagents);
    const markers = buildMarkers(rows);
    const aliasList = [...this.aliases.values()];
    return {
      ready: true,
      range: kind,
      models: mergeByModel(rows, aliasList),
      hasBackfilled: markers.hasBackfilled,
      unpricedModels: markers.unpricedModels,
    };
  }

  async byWorkspace(rangeKind, includeSubagents) {
    const kind = normalizeRange(rangeKind);
    const subagents = includeSubagents !== false;
    if (!this.ready) return { ready: false, workspaces: [], hasBackfilled: false, unpricedModels: [] };
    const rows = this.scopeRows(this.rangeDays(kind), subagents);
    const markers = buildMarkers(rows);
    return {
      ready: true,
      range: kind,
      workspaces: buildByWorkspace(rows, this.todayKey()),
      hasBackfilled: markers.hasBackfilled,
      unpricedModels: markers.unpricedModels,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Remote: pricing + preferences                                    */
  /* ---------------------------------------------------------------- */

  async pricing() {
    if (!this.ready) {
      return { ready: false, entries: { ...BUILTIN_CATALOG }, usdToCny: DEFAULT_USD_TO_CNY, usdToCnySource: 'default', snapshotId: 'fallback', customKeys: [], tier: null };
    }
    const entries = this.mergedEntries();
    const meta = this.pricingMeta();
    const sorted = Object.entries(entries)
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return {
      ready: true,
      entries,
      rows: sorted,
      usdToCny: meta.usdToCny,
      usdToCnySource: meta.usdToCnySource,
      live: meta.live,
      snapshotId: meta.snapshotId,
      customKeys: meta.customKeys,
      tier: this.tierStatus(),
      holidayDataThrough: HOLIDAY_DATA_THROUGH,
      schemaRuntime: domainSchemaRuntime(),
    };
  }

  async balance() {
    if (!this.ready) return emptyBalanceView(this.effectivePrefs().balanceRefreshSeconds);
    await this.fetchBalance(false).catch(() => {});
    return this.balanceSnapshot();
  }

  async refreshBalance(force) {
    if (!this.ready) return emptyBalanceView(this.effectivePrefs().balanceRefreshSeconds);
    await this.fetchBalance(force !== false).catch(() => {});
    return this.balanceSnapshot();
  }

  async prefs() {
    return { ready: this.ready, prefs: this.effectivePrefs() };
  }

  effectivePrefs() {
    return {
      budgetEnabled: this.prefsData.budgetEnabled !== false,
      monthlyCny: clampMoney(this.prefsData.monthlyCny, DEFAULT_PREFS.monthlyCny),
      entrySidebar: this.prefsData.entrySidebar !== false,
      entryComposer: this.prefsData.entryComposer !== false,
      includeSubagents: this.prefsData.includeSubagents !== false,
      showTierCurve: this.prefsData.showTierCurve !== false,
      balanceEnabled: this.prefsData.balanceEnabled !== false,
      balanceRefreshSeconds: clampSeconds(this.prefsData.balanceRefreshSeconds, DEFAULT_PREFS.balanceRefreshSeconds),
      autoRefreshPricing: this.prefsData.autoRefreshPricing !== false,
      refreshHours: this.prefsData.refreshHours ?? DEFAULT_REFRESH_HOURS,
    };
  }

  async savePrefs(patch) {
    if (!this.ready) return { ok: false, reason: 'initializing', prefs: this.effectivePrefs() };
    const input = isPlainObject(patch) ? patch : {};
    const next = { ...this.prefsData };
    if (typeof input.budgetEnabled === 'boolean') next.budgetEnabled = input.budgetEnabled;
    if (input.monthlyCny !== undefined) next.monthlyCny = clampMoney(input.monthlyCny, next.monthlyCny);
    if (typeof input.entrySidebar === 'boolean') next.entrySidebar = input.entrySidebar;
    if (typeof input.entryComposer === 'boolean') next.entryComposer = input.entryComposer;
    if (typeof input.includeSubagents === 'boolean') next.includeSubagents = input.includeSubagents;
    if (typeof input.showTierCurve === 'boolean') next.showTierCurve = input.showTierCurve;
    if (typeof input.balanceEnabled === 'boolean') next.balanceEnabled = input.balanceEnabled;
    if (input.balanceRefreshSeconds !== undefined) {
      next.balanceRefreshSeconds = clampSeconds(input.balanceRefreshSeconds, next.balanceRefreshSeconds);
    }
    if (typeof input.autoRefreshPricing === 'boolean') next.autoRefreshPricing = input.autoRefreshPricing;
    if (typeof input.refreshHours === 'number' && Number.isFinite(input.refreshHours)) {
      next.refreshHours = Math.max(1, Math.min(168, input.refreshHours));
    }
    this.prefsData = /** @type {any} */ (next);
    await this.enqueue(() => this.tables.prefs.put('default', next));
    if (input.balanceEnabled === true || input.balanceRefreshSeconds !== undefined) {
      void this.fetchBalance(true).catch(() => {});
    }
    return { ok: true, prefs: this.effectivePrefs() };
  }

  async setCustomPrice(entry) {
    if (!this.ready) return { ok: false, reason: 'initializing' };
    const input = isPlainObject(entry) ? entry : {};
    const provider = String(input.provider ?? '').trim();
    const model = String(input.model ?? '').trim();
    if (provider === '' || model === '') return { ok: false, reason: 'provider and model are required' };
    const currency = input.currency === 'USD' ? 'USD' : 'CNY';
    const parsed = {
      input: clampMoney(input.input, 0),
      cacheRead: clampMoney(input.cacheRead, 0),
      cacheWrite: clampMoney(input.cacheWrite, 0),
      output: clampMoney(input.output, 0),
      currency,
    };
    const key = `${normalizeProvider(provider)}/${model}`;
    this.custom = { ...this.custom, [key]: parsed };
    this.customKeys = Object.keys(this.custom).sort();
    await this.enqueue(() => this.tables.custom.put('all', { entries: this.custom }));
    const snapshot = this.currentSnapshot() ?? this.fallbackSnapshot();
    await this.enqueue(() => this.appendSnapshot('custom-price', this.mergedEntries(), snapshot.usdToCny, snapshot.usdToCnySource));
    await this.repriceUnpriced();
    return { ok: true, customKeys: this.customKeys, entries: this.mergedEntries() };
  }

  async removeCustomPrice(key) {
    if (!this.ready) return { ok: false, reason: 'initializing' };
    const target = String(key ?? '');
    if (this.custom[target] === undefined) return { ok: false, reason: 'not-found' };
    const next = { ...this.custom };
    delete next[target];
    this.custom = next;
    this.customKeys = Object.keys(this.custom).sort();
    await this.enqueue(() => this.tables.custom.put('all', { entries: this.custom }));
    const snapshot = this.currentSnapshot() ?? this.fallbackSnapshot();
    await this.enqueue(() => this.appendSnapshot('custom-price', this.mergedEntries(), snapshot.usdToCny, snapshot.usdToCnySource));
    return { ok: true, customKeys: this.customKeys };
  }

  async setAlias(input) {
    if (!this.ready) return { ok: false, reason: 'initializing' };
    const data = isPlainObject(input) ? input : {};
    const provider = normalizeProvider(data.provider);
    const rawModel = String(data.rawModel ?? '').trim();
    if (provider === '' || rawModel === '') return { ok: false, reason: 'provider and rawModel are required' };
    const key = aliasStorageKey(provider, rawModel);
    const canonical = data.canonicalModel === null || data.canonicalModel === '' ? null : String(data.canonicalModel).trim();
    if (canonical === null) {
      await this.enqueue(() => this.tables.aliases.delete(key));
      this.aliases.delete(key);
    } else {
      const alias = { id: key, provider, rawModel, canonicalModel: canonical };
      await this.enqueue(() => this.tables.aliases.put(key, alias));
      this.aliases.set(key, alias);
    }
    await this.repriceUnpriced();
    return { ok: true, aliases: [...this.aliases.values()] };
  }

  async aliasList() {
    return { ready: this.ready, aliases: [...this.aliases.values()] };
  }

  /** Re-price rows that had no price when they were written. */
  async repricing() {
    if (!this.ready) return { changed: 0, ready: false };
    return this.repriceUnpriced();
  }

  async repriceUnpriced() {
    const entries = this.mergedEntries();
    const snapshot = this.currentSnapshot() ?? this.fallbackSnapshot();
    const patched = new Map();
    for (const row of this.allRows()) {
      if (row.priced) continue;
      const alias = this.aliases.get(aliasStorageKey(row.provider, row.model));
      const keys = priceKeyCandidates(row.provider, row.model, alias);
      const { tier, factor } = tierAndFactorAt(row.time);
      const result = priceUsage(
        { inputTokens: row.input, outputTokens: row.output, cacheReadTokens: row.cacheRead, cacheWriteTokens: row.cacheWrite },
        entries, keys, snapshot.usdToCny, factor,
      );
      if (!result.priced) continue;
      patched.set(row.id, {
        ...row,
        costCny: result.costCny,
        currency: result.currency,
        priced: true,
        snapshotId: snapshot.id,
        tier,
      });
    }
    if (patched.size === 0) return { changed: 0, ready: true };
    await this.enqueue(async () => {
      for (const [day, shard] of [...this.tables.ledger.entries()]) {
        let changed = false;
        const rows = shard.rows.map((row) => {
          const replacement = patched.get(row.id);
          if (replacement === undefined) return row;
          changed = true;
          return replacement;
        });
        if (changed) await this.tables.ledger.put(day, { ...shard, rows });
      }
    });
    this.rowsCache = null;
    return { changed: patched.size, ready: true };
  }

  async status() {
    const latestDiag = [...this.diag.values()].sort((a, b) => (b.lastAt ?? b.at) - (a.lastAt ?? a.at))[0] ?? null;
    return {
      ready: this.ready,
      installAt: this.installAt,
      rows: this.rowIds.size,
      shards: this.ready ? this.tables.ledger.size : 0,
      sessions: this.ready ? this.tables.sessions.size : 0,
      snapshots: this.snapshots.length,
      backfill: { ...this.backfillState },
      pricing: this.ready ? this.pricingMeta() : null,
      tier: this.tierStatus(),
      diag: latestDiag,
      schemaRuntime: domainSchemaRuntime(),
      balance: {
        status: this.balanceStatus,
        fetchedAt: this.balanceFetchedAt,
        samples: this.balanceHistory.length,
        account: this.account !== null,
        links: this.balanceLinks !== null,
        error: this.balanceError,
      },
      version: 1,
    };
  }

  async dismissBackfill() {
    if (!this.ready) return { ok: false };
    this.meta = { ...this.meta, backfillDismissed: true };
    await this.enqueue(() => this.domain.global.set(this.meta)).catch(() => {});
    return { ok: true };
  }

  cwdOfSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined;
    const record = this.tables?.sessions?.get(sessionId);
    return typeof record?.cwd === 'string' && record.cwd !== '' ? record.cwd : undefined;
  }

  notReadyOverview() {
    const fallbackBudget = {
      enabled: true, monthlyCny: DEFAULT_PREFS.monthlyCny, spentCny: 0, pct: 0,
      level: 'ok', notice: null, notified: [], includeSubagents: true,
    };
    return {
      ready: false,
      range: 'month',
      todayKey: dayKeyAt(Date.now()),
      overview: { ...EMPTY_OVERVIEW },
      month: { ...fallbackBudget, monthKey: dayKeyAt(Date.now()).slice(0, 7) },
      todaySplit: { projectCny: 0, otherCny: 0, projectCalls: 0, otherCalls: 0, totalCny: 0, totalCalls: 0, hasProject: false },
      cumulative: { totalCny: 0, calls: 0, sessions: 0, workspaces: 0 },
      tier: this.tierStatus(),
      pricing: {
        snapshotId: 'fallback', usdToCny: DEFAULT_USD_TO_CNY, usdToCnySource: 'default',
        live: false, entries: Object.keys(BUILTIN_CATALOG).length, customKeys: [],
      },
      balance: emptyBalanceView(this.effectivePrefs().balanceRefreshSeconds),
      prefs: this.effectivePrefs(),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMeta(value) {
  const meta = isPlainObject(value) ? { ...value } : {};
  if (!isPlainObject(meta.budgetNotified)) meta.budgetNotified = {};
  return meta;
}

function clampSeconds(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(10, Math.min(600, Math.round(n)));
}

function normalizeRange(kind) {
  return kind === '7d' || kind === '30d' || kind === 'all' || kind === 'month' ? kind : 'month';
}

function enumerateDays(from, to) {
  const days = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 800) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

function lastDays(today, count) {
  const days = [];
  let cursor = today;
  for (let i = 0; i < count; i += 1) {
    days.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

function addDays(day, delta) {
  const ms = parseDayMs(day) + delta * DAY_MS;
  return dayKeyAt(ms);
}

function dayDiff(from, to) {
  return Math.round((parseDayMs(to) - parseDayMs(from)) / DAY_MS);
}

/* ------------------------------------------------------------------ */
/* Optional network pricing (fails soft, never blocks startup)        */
/* ------------------------------------------------------------------ */

const NETWORK_TIMEOUT_MS = 8000;
const MODELS_DEV_URL = 'https://models.dev/api.json';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';
const CATALOG_PROVIDER_ALLOWLIST = new Set([
  'deepseek', 'openai', 'anthropic', 'google', 'google-vertex', 'xai', 'mistral',
  'moonshotai', 'alibaba', 'qwen', 'zhipuai', 'z-ai', 'meta', 'meta-llama',
  'groq', 'cerebras', 'openrouter', 'together', 'fireworks',
]);
const MAX_CATALOG_ENTRIES = 1200;

async function fetchJson(url) {
  if (typeof globalThis.fetch !== 'function') throw new Error('fetch is unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Project models.dev into our price key space (USD per 1M tokens). */
async function fetchModelCatalog() {
  const raw = await fetchJson(MODELS_DEV_URL);
  if (raw === null || typeof raw !== 'object') throw new Error('catalog format is invalid');
  const entries = {};
  let partial = false;
  for (const [providerId, provider] of Object.entries(raw)) {
    if (Object.keys(entries).length >= MAX_CATALOG_ENTRIES) {
      partial = true;
      break;
    }
    const normalizedProvider = String(providerId).toLowerCase();
    if (!CATALOG_PROVIDER_ALLOWLIST.has(normalizedProvider)) continue;
    const models = provider?.models;
    if (models === null || typeof models !== 'object') continue;
    for (const [modelId, model] of Object.entries(models)) {
      const cost = model?.cost;
      if (cost === null || typeof cost !== 'object') continue;
      const input = Number(cost.input);
      const output = Number(cost.output);
      if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
      const cacheRead = Number.isFinite(Number(cost.cache_read)) ? Number(cost.cache_read) : input;
      const cacheWrite = Number.isFinite(Number(cost.cache_write)) ? Number(cost.cache_write) : input;
      entries[`${normalizedProvider}/${String(modelId).toLowerCase()}`] = {
        input, cacheRead, cacheWrite, output, currency: 'USD',
      };
      if (Object.keys(entries).length >= MAX_CATALOG_ENTRIES) {
        partial = true;
        break;
      }
    }
  }
  if (Object.keys(entries).length === 0) throw new Error('catalog contains no usable price');
  return { entries, partial };
}

/** Live USD to CNY rate, or null when the response carries no usable rate. */
async function fetchUsdToCny() {
  const raw = await fetchJson(FX_URL);
  const rate = Number(raw?.rates?.CNY);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

markRemoteMethods(UsageBillingService.prototype, REMOTE_METHODS);
