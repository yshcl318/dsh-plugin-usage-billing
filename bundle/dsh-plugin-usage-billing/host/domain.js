/**
 * Storage-domain declaration and small KV helpers.
 *
 * The domain facility validates every stored record at open() through the
 * declared `valueSchema.parse()` and the global through `safeParse(null)` +
 * `parse()`. This module prefers the real `zod` runtime (the platform ships
 * zod 4.x for storage-domain) and falls back to a tiny Zod-shaped validator
 * when `zod` cannot be resolved, so a profile without the package still opens
 * its ledger instead of failing the plugin. Records are our own JSON, never
 * user-authored, so the fallback is a compatibility shim, not a validation
 * regression.
 *
 * Domain data lives in the platform storage backend (`$DSH_HOME/storages`);
 * the plugin itself never writes files.
 */

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const isString = value => typeof value === 'string';
const isOptionalString = value => value === undefined || isString(value);
const isOptionalNumber = value => value === undefined || isFiniteNumber(value);
const isOptionalObject = value => value === undefined || isObject(value);
const isBool = value => typeof value === 'boolean';

/* ------------------------------------------------------------------ */
/* Record predicates                                                  */
/* ------------------------------------------------------------------ */

const ledgerRowOk = row => isObject(row)
  && isString(row.id)
  && isString(row.sessionId)
  && isFiniteNumber(row.seq)
  && isFiniteNumber(row.time)
  && isString(row.provider)
  && isString(row.model)
  && isString(row.day)
  && isFiniteNumber(row.input)
  && isFiniteNumber(row.cacheRead)
  && isFiniteNumber(row.cacheWrite)
  && isFiniteNumber(row.output)
  && isFiniteNumber(row.costCny)
  && isBool(row.priced)
  && isBool(row.backfilled);

const ledgerShardOk = shard => isObject(shard)
  && isFiniteNumber(shard.v)
  && isString(shard.day)
  && Array.isArray(shard.rows)
  && shard.rows.every(row => ledgerRowOk(row));

const sessionRecordOk = record => isObject(record)
  && isString(record.sessionId)
  && isOptionalString(record.cwd)
  && isFiniteNumber(record.lastTime)
  && isFiniteNumber(record.foldedThroughSeq)
  && (record.revision === undefined || record.revision === null || isString(record.revision))
  && isBool(record.isSubagent);

const priceEntryOk = entry => isObject(entry)
  && isFiniteNumber(entry.input)
  && isFiniteNumber(entry.cacheRead)
  && isFiniteNumber(entry.cacheWrite)
  && isFiniteNumber(entry.output)
  && (entry.currency === 'CNY' || entry.currency === 'USD');

const priceSnapshotOk = snapshot => isObject(snapshot)
  && isString(snapshot.id)
  && isFiniteNumber(snapshot.at)
  && (snapshot.kind === 'base' || snapshot.kind === 'delta')
  && isString(snapshot.reason)
  && isFiniteNumber(snapshot.usdToCny)
  && (snapshot.usdToCnySource === 'live' || snapshot.usdToCnySource === 'default')
  && isObject(snapshot.entries)
  && Object.values(snapshot.entries).every(entry => priceEntryOk(entry));

const modelAliasOk = alias => isObject(alias)
  && isString(alias.provider)
  && isString(alias.rawModel)
  && isString(alias.canonicalModel);

const customTableOk = record => isObject(record)
  && isObject(record.entries)
  && Object.values(record.entries).every(entry => priceEntryOk(entry));

const prefsOk = prefs => isObject(prefs)
  && isBool(prefs.budgetEnabled)
  && isFiniteNumber(prefs.monthlyCny)
  && isBool(prefs.entrySidebar)
  && isBool(prefs.entryComposer)
  && isBool(prefs.includeSubagents)
  && isBool(prefs.showTierCurve);

const diagnosticOk = record => isObject(record)
  && isString(record.id)
  && isFiniteNumber(record.at)
  && isFiniteNumber(record.count)
  && isString(record.kind)
  && isString(record.detail);

const metaOk = value => isObject(value)
  && isOptionalNumber(value.installAt)
  && isOptionalString(value.baseSnapshotId)
  && isOptionalNumber(value.rebuiltAt)
  && isOptionalNumber(value.backfilledAt)
  && isOptionalNumber(value.rebuiltRows)
  && isOptionalNumber(value.rebuiltShards)
  && (value.backfillDismissed === undefined || isBool(value.backfillDismissed))
  && isOptionalObject(value.budgetNotified)
  && isOptionalObject(value.budgetPending);

/* ------------------------------------------------------------------ */
/* Schema construction: zod when available, duck-typed fallback        */
/* ------------------------------------------------------------------ */

/**
 * Build one schema through `z.custom` (real zod) or the fallback shim.
 * `z.custom` keeps the predicate as the single source of validation while the
 * facility still observes a genuine `ZodType` (parse/safeParse, throwing
 * ZodError on failure).
 */
function makeSchema(zod, predicate, label) {
  if (zod !== null) {
    return zod.custom(predicate, { message: `usage-billing: invalid ${label}` });
  }
  const parse = (value) => {
    if (!predicate(value)) {
      const error = new Error(`usage-billing: invalid ${label}`);
      error.name = 'ZodError';
      throw error;
    }
    return value;
  };
  return {
    parse,
    safeParse(value) {
      try {
        return { success: true, data: parse(value) };
      } catch (error) {
        return { success: false, error };
      }
    },
  };
}

function buildSpec(zod) {
  return Object.freeze({
    name: 'usage_billing',
    version: 2,
    layout: 'per-record',
    // A single corrupt/stale shard must never brick the whole ledger: the JSON
    // per-record backend moves the bad document aside and the rest opens.
    invalidRecords: 'backup-and-skip',
    global: {
      schema: makeSchema(zod, metaOk, 'domain meta'),
      initial: Object.freeze({ budgetNotified: {} }),
    },
    tables: {
      ledger: { valueSchema: makeSchema(zod, ledgerShardOk, 'ledger shard') },
      sessions: { valueSchema: makeSchema(zod, sessionRecordOk, 'session record') },
      snapshots: { valueSchema: makeSchema(zod, priceSnapshotOk, 'price snapshot') },
      aliases: { valueSchema: makeSchema(zod, modelAliasOk, 'model alias') },
      custom: { valueSchema: makeSchema(zod, customTableOk, 'custom price table') },
      prefs: { valueSchema: makeSchema(zod, prefsOk, 'preferences') },
      diag: { valueSchema: makeSchema(zod, diagnosticOk, 'diagnostic') },
    },
  });
}

/**
 * Resolve the platform zod runtime without making it a hard dependency of the
 * bundle. A profile that lacks it still opens the ledger via the shim.
 */
let activeRuntime = 'shim';

/** Validation runtime chosen by the last createDomainSpec() call. */
export function domainSchemaRuntime() {
  return activeRuntime;
}

async function loadZod() {
  // 1. Ordinary bare-specifier resolution (works when a bundler/profile maps it).
  try {
    const module = await import('zod');
    const candidate = module.z ?? module.default?.z ?? module.default;
    if (typeof candidate?.custom === 'function') return candidate;
  } catch {
    /* fall through to the explicit runtime locations */
  }
  // 2. The running profile and the dsh installation both ship zod for
  //    storage-domain. The Host process exposes both directories through its
  //    environment and its launch arguments, so resolve from those anchors
  //    instead of hardcoding an installation path.
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const anchors = new Set();
    const add = (value) => {
      if (typeof value === 'string' && value !== '') anchors.add(value);
    };
    add(process.env.DSH_PROFILE_DIR);
    add(process.env.DSH_INSTALL_DIR);
    if (typeof process.env.DSH_HOME === 'string') {
      add(process.env.DSH_HOME + '/profiles/' + (process.env.DSH_PROFILE ?? 'desktop'));
    }
    try {
      const { homedir } = await import('node:os');
      add(homedir() + '/.dsh/profiles/desktop');
    } catch {
      /* os unavailable */
    }
    for (const argument of process.argv) {
      if (typeof argument !== 'string') continue;
      if (/[\/]profiles[\/][^\/]+$/.test(argument)) add(argument);
      if (/app\.asar[\/]dsh$/.test(argument)) add(argument);
    }
    for (const anchor of anchors) {
      for (const base of [anchor, anchor + '/node_modules']) {
        try {
          const resolved = require.resolve('zod', { paths: [base] });
          const module = require(resolved);
          const candidate = module.z ?? module.default?.z ?? module.default;
          if (typeof candidate?.custom === 'function') return candidate;
        } catch {
          /* try the next anchor */
        }
      }
    }
  } catch {
    /* node:module unavailable: keep the shim */
  }
  return null;
}

/** Domain declaration built through real zod when it resolves, else the shim. */
export async function createDomainSpec() {
  const zod = await loadZod();
  activeRuntime = zod === null ? 'shim' : 'zod';
  return buildSpec(zod);
}

/** Shim-backed declaration (used by tests and as the static fallback view). */
export const USAGE_BILLING_DOMAIN = buildSpec(null);

/** Domain name; must match the platform `UNIT_NAME_RE`. */
export const DOMAIN_NAME = 'usage_billing';

/**
 * Current domain version.
 *
 * Version 1 of this domain name belongs to `@zzerx/dsh-plugin-usage-billing`
 * 1.3.1 (different table schemas, `per-record`). Bumping to 2 without a
 * `compatibleVersions` entry makes those stale per-record documents read as
 * absent instead of failing validation or mixing two ledgers; the files stay
 * untouched on disk.
 */
export const DOMAIN_VERSION = 2;

/**
 * Default preferences (also the shape persisted in the prefs table).
 * @type {{ budgetEnabled: boolean, monthlyCny: number, entrySidebar: boolean,
 *   entryComposer: boolean, includeSubagents: boolean, showTierCurve: boolean,
 *   autoRefreshPricing?: boolean, refreshHours?: number }}
 */
export const DEFAULT_PREFS = Object.freeze({
  budgetEnabled: true,
  monthlyCny: 100,
  entrySidebar: true,
  entryComposer: true,
  includeSubagents: true,
  showTierCurve: true,
});

/** Row id: one assistant message is unique by (session, seq). */
export function ledgerRowId(sessionId, seq) {
  return `${sessionId}__${seq}`;
}

/** Shard key: one record per Beijing calendar day. */
export function ledgerShardKey(day) {
  return day;
}

/** Safe JSON clone (records come back from domain storage). */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
