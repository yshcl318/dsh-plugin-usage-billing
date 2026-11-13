/**
 * Backward-compatibility regression: a 1.3.x reader (the seven-table spec
 * without `balances`) opens the same `usage_billing` version-2 domain that
 * already contains wallet sample documents, ignoring them instead of failing.
 *
 * This uses the real platform `DomainFacility` with an in-memory kv unit, so
 * the "unknown table documents are ignored" promise is locked by the actual
 * storage-domain open sequence rather than by our own mock.
 */
import assert from 'node:assert/strict';
import { DomainFacility, defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { USAGE_BILLING_DOMAIN, createDomainSpec } from '../bundle/dsh-plugin-usage-billing/host/domain.js';

const ledgerShard = {
  v: 1,
  day: '2026-11-13',
  rows: [{
    id: 'session-1__1', sessionId: 'session-1', seq: 1, time: 1,
    provider: 'deepseek-account', model: 'deepseek-flash', day: '2026-11-13',
    input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costCny: 0.1,
    priced: true, backfilled: false,
  }],
};
const balanceRecord = {
  id: 'bal-1', at: 1, cny: 10.5, bonusCny: 0, usd: 0, bonusUsd: 0, source: 'account',
};
const storedSnapshot = {
  global: { installAt: 1, budgetNotified: {} },
  tables: {
    ledger: { '2026-11-13': ledgerShard },
    sessions: {},
    snapshots: {},
    aliases: {},
    custom: {},
    prefs: {},
    diag: {},
    // Written by 1.4.0; a 1.3.x reader must not choke on this table.
    balances: { 'bal-1': balanceRecord },
  },
};

function makeFacility() {
  const opened = [];
  const unit = {
    loadAll: async () => storedSnapshot,
    setGlobal: async () => {},
    close: async () => {},
    backupRecord: async () => 'moved.json',
  };
  const backend = {
    kv: {
      open: async (descriptor) => {
        opened.push(descriptor);
        return unit;
      },
    },
  };
  const ctx = {
    storage: { backend: { get: () => backend } },
    logger: { error() {}, warn() {} },
    emit() {},
  };
  return { facility: new DomainFacility(/** @type {any} */ (ctx), { backend: 'json', routes: {} }), opened };
}

function oldReaderSpec() {
  const { balances, ...tables } = USAGE_BILLING_DOMAIN.tables;
  assert.ok(balances !== undefined, 'the new spec should declare the balances table');
  return defineDomain({ ...USAGE_BILLING_DOMAIN, tables });
}

const { facility, opened } = makeFacility();

/* ---- 1.3.x reader: seven tables, ignores the balances documents ---- */
const oldSpec = oldReaderSpec();
assert.equal(Object.keys(oldSpec.tables).length, 7);
assert.equal(oldSpec.version, 2);
const oldDomain = /** @type {any} */ (await facility.open(oldSpec));
assert.deepEqual(opened.at(-1).tables, Object.keys(oldSpec.tables));
assert.ok(!opened.at(-1).tables.includes('balances'));
assert.throws(() => oldDomain.table('balances'), /declares no table 'balances'/);
// The ledger still opens and its records are readable.
assert.equal(oldDomain.table('ledger').get('2026-11-13').rows.length, 1);
await oldDomain.close();
// The balances documents were not touched: the same snapshot is still there.
assert.equal(storedSnapshot.tables.balances['bal-1'].cny, 10.5);

/* ---- 1.4.0 reader: eight tables, validates the wallet table too ---- */
const newSpec = await createDomainSpec();
assert.equal(newSpec.version, 2);
assert.equal(Object.keys(newSpec.tables).length, 8);
const newDomain = /** @type {any} */ (await facility.open(newSpec));
assert.ok(opened.at(-1).tables.includes('balances'));
assert.equal(newDomain.table('ledger').get('2026-11-13').rows.length, 1);
assert.equal(newDomain.table('balances').get('bal-1').cny, 10.5);
await newDomain.close();

/* ---- A corrupt wallet record is backed up, not fatal ---- */
storedSnapshot.tables.balances['bal-bad'] = { id: 1, at: 'nope' };
const backupFacility = makeFacility();
const tolerant = /** @type {any} */ (await backupFacility.facility.open(newSpec));
assert.equal(tolerant.table('balances').size, 1);
assert.equal(tolerant.table('balances').get('bal-1').cny, 10.5);
await tolerant.close();

console.log('domain compatibility ok: 1.3.x reader ignores balances; 1.4.0 validates and tolerates a bad wallet row');
