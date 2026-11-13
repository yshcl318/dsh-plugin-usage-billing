/**
 * Usage-billing pricing engine (pure, no platform imports).
 *
 * Money model: every price is CNY-or-USD per 1,000,000 tokens. Cost of one model
 * call = (input*inputPrice + cacheRead*cacheReadPrice + cacheWrite*cacheWritePrice
 * + output*outputPrice) / 1e6 * priceFactor, converted by the FX rate for USD
 * entries. `reasoningTokens` are already counted inside outputTokens and are
 * never priced separately.
 *
 * Peak/off-peak: Beijing time (UTC+8) weekday 09:00-12:00 and 14:00-18:00 are
 * peak; every other moment (including weekends and CN statutory holidays) is
 * off-peak at peak price × OFF_PEAK_RATIO. The tier is decided by the event
 * timestamp, never by "now".
 */

export const CNY = 'CNY';
export const USD = 'USD';

/** Fallback FX when the optional exchange-rate fetch fails. */
export const DEFAULT_USD_TO_CNY = 7.1;

/** Beijing time offset from UTC, in minutes. */
export const TZ_OFFSET_MINUTES = 480;

/** Peak windows as [startMinute, endMinute) in Beijing local time. */
export const PEAK_WINDOWS = Object.freeze([
  Object.freeze([9 * 60, 12 * 60]),
  Object.freeze([14 * 60, 18 * 60]),
]);

/** Off-peak price multiplier (peak price × 0.5). */
export const OFF_PEAK_RATIO = 0.5;

/** Optional policy start (epoch ms): before it the single-tier price applied. */
export const TIER_RULE_SINCE = 0;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalize a provider id for price keys and alias ids. */
export function normalizeProvider(provider) {
  return String(provider ?? '').trim().toLowerCase();
}

/** Built-in synonym table: API name -> catalog name (same model, same price). */
export const MODEL_SYNONYMS = Object.freeze({
  'deepseek-flash': 'deepseek-v4-flash',
});

const DATE_SUFFIX = /-(?:\d{8}|\d{6}|\d{4}-\d{2})$/;
const ORG_PREFIX = /^[a-z0-9][a-z0-9._-]*\//;

/** Normalize a raw model id for price lookup (lowercase, strip org/date, synonym). */
export function normalizeModelId(raw) {
  let id = String(raw ?? '').trim().toLowerCase();
  id = id.replace(ORG_PREFIX, '');
  id = id.replace(DATE_SUFFIX, '');
  return MODEL_SYNONYMS[id] ?? id;
}

/** Display grouping key: same normalization but keeps the date suffix. */
export function sameModelName(raw) {
  const id = String(raw ?? '').trim().toLowerCase().replace(ORG_PREFIX, '');
  return MODEL_SYNONYMS[id] ?? id;
}

/** `<provider>/<model>` price-table key. */
export function priceKey(provider, model) {
  return `${normalizeProvider(provider)}/${String(model ?? '').trim()}`;
}

function entry(e) {
  return Object.freeze({ ...e });
}

/**
 * Built-in fallback catalog (CNY per 1M tokens unless `currency` says USD).
 * DeepSeek official list price; a few well-known comparison entries.
 */
export const BUILTIN_CATALOG = Object.freeze({
  'deepseek/deepseek-flash': entry({ input: 2, cacheRead: 0.04, cacheWrite: 2, output: 8, currency: CNY }),
  'deepseek/deepseek-v4-flash': entry({ input: 2, cacheRead: 0.04, cacheWrite: 2, output: 8, currency: CNY }),
  'deepseek/deepseek-v4-pro': entry({ input: 9, cacheRead: 0.3, cacheWrite: 9, output: 27, currency: CNY }),
  'deepseek/deepseek-chat': entry({ input: 2, cacheRead: 0.04, cacheWrite: 2, output: 8, currency: CNY }),
  'deepseek/deepseek-reasoner': entry({ input: 4, cacheRead: 1, cacheWrite: 4, output: 16, currency: CNY }),
  'openai/gpt-4o-mini': entry({ input: 0.15, cacheRead: 0.075, cacheWrite: 0.15, output: 0.6, currency: USD }),
  'openai/gpt-4o': entry({ input: 2.5, cacheRead: 1.25, cacheWrite: 2.5, output: 10, currency: USD }),
  'anthropic/claude-sonnet-4': entry({ input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15, currency: USD }),
});

/** Split TokenUsage into the four mutually exclusive priced buckets. */
export function splitUsage(usage) {
  const u = usage ?? {};
  return {
    input: num(u.inputTokens),
    cacheRead: num(u.cacheReadTokens),
    cacheWrite: num(u.cacheWriteTokens),
    output: num(u.outputTokens),
    reasoning: u.reasoningTokens === undefined ? undefined : num(u.reasoningTokens),
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const ROUTE_TOKEN = /^[a-z0-9]+-/;

function stripRouteToken(name) {
  const rest = name.replace(ROUTE_TOKEN, '');
  if (rest === name || rest === '') return null;
  return rest.includes('-') || /\d/.test(rest) ? rest : null;
}

/** Ordered lookup candidates for one raw provider/model pair. */
export function priceKeyCandidates(provider, rawModel, alias) {
  const p = normalizeProvider(provider);
  const raw = String(rawModel ?? '').trim();
  const normalized = normalizeModelId(raw);
  const out = [`${p}/${raw}`, `${p}/${normalized}`];
  if (alias !== undefined && alias.canonicalModel !== '') {
    out.push(`${p}/${alias.canonicalModel}`, `*/${normalizeModelId(alias.canonicalModel)}`);
  }
  out.push(`*/${normalized}`, `*/${raw}`);
  const unlabeled = stripRouteToken(normalized);
  if (unlabeled !== null) out.push(`*/${unlabeled}`);
  out.push(`${p}/*`, `*/*`);
  return [...new Set(out)];
}

const nameIndexCache = new WeakMap();

function sameNameEntryKey(table, name) {
  let index = nameIndexCache.get(table);
  if (index === undefined) {
    index = new Map();
    for (const key of Object.keys(table)) {
      const slash = key.indexOf('/');
      if (slash <= 0) continue;
      const modelPart = key.slice(slash + 1);
      if (modelPart === '*') continue;
      const normalized = normalizeModelId(modelPart);
      if (normalized !== '' && !index.has(normalized)) index.set(normalized, key);
    }
    nameIndexCache.set(table, index);
  }
  return index.get(normalizeModelId(name));
}

const NAME_FALLBACK_PREFIX = '*/';

function entryFor(table, key) {
  const direct = table[key];
  if (direct !== undefined) return direct;
  if (!key.startsWith(NAME_FALLBACK_PREFIX)) return undefined;
  const hit = sameNameEntryKey(table, key.slice(NAME_FALLBACK_PREFIX.length));
  return hit === undefined ? undefined : table[hit];
}

/**
 * Price one usage record.
 * @returns {{costCny:number,currency:string,priced:boolean,matchedKey:string|null,matchRank:number}}
 */
export function priceUsage(usage, table, keys, usdToCny, priceFactor = 1) {
  for (let rank = 0; rank < keys.length; rank += 1) {
    const key = keys[rank];
    const found = entryFor(table, key);
    if (found === undefined) continue;
    if (found.currency === USD && !(usdToCny > 0)) {
      return { costCny: 0, currency: USD, priced: false, matchedKey: key, matchRank: rank };
    }
    const s = splitUsage(usage);
    const native = (
      s.input * found.input
      + s.cacheRead * found.cacheRead
      + s.cacheWrite * found.cacheWrite
      + s.output * found.output
    ) / 1e6 * priceFactor;
    const costCny = found.currency === USD ? native * usdToCny : native;
    return {
      costCny: Math.max(0, costCny),
      currency: found.currency,
      priced: true,
      matchedKey: key,
      matchRank: rank,
    };
  }
  return { costCny: 0, currency: CNY, priced: false, matchedKey: null, matchRank: -1 };
}

/* ------------------------------------------------------------------ */
/* CN statutory holidays (best-effort table; a missing year means only  */
/* weekends are off-peak). Dates are Beijing-local YYYY-MM-DD.         */
/* ------------------------------------------------------------------ */

const CN_HOLIDAY_RANGES = [
  // 2025
  ['2025-01-01', '2025-01-01'],
  ['2025-01-28', '2025-02-04'],
  ['2025-04-04', '2025-04-06'],
  ['2025-05-01', '2025-05-05'],
  ['2025-05-31', '2025-06-02'],
  ['2025-10-01', '2025-10-08'],
  // 2026
  ['2026-01-01', '2026-01-03'],
  ['2026-02-15', '2026-02-22'],
  ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'],
  ['2026-06-19', '2026-06-21'],
  ['2026-09-25', '2026-09-27'],
  ['2026-10-01', '2026-10-08'],
  // 2027 (best-effort)
  ['2027-01-01', '2027-01-03'],
  ['2027-02-05', '2027-02-12'],
  ['2027-04-04', '2027-04-06'],
  ['2027-05-01', '2027-05-05'],
  ['2027-06-09', '2027-06-11'],
  ['2027-09-15', '2027-09-17'],
  ['2027-10-01', '2027-10-08'],
];

function dayKeyFromMs(timeMs) {
  return new Date(timeMs + TZ_OFFSET_MINUTES * MINUTE_MS).toISOString().slice(0, 10);
}

function buildHolidaySet() {
  const set = new Set();
  for (const [from, to] of CN_HOLIDAY_RANGES) {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    for (let t = start; t <= end; t += DAY_MS) {
      set.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  return set;
}

const CN_HOLIDAYS = buildHolidaySet();

/** Latest table year; used to label the holiday data coverage in the UI. */
export const HOLIDAY_DATA_THROUGH = 2027;

/** Beijing-local day key `YYYY-MM-DD` for an epoch-ms timestamp. */
export function dayKeyAt(timeMs) {
  return dayKeyFromMs(timeMs);
}

/** True when the Beijing-local date is a CN statutory holiday. */
export function isHolidayAt(timeMs) {
  return CN_HOLIDAYS.has(dayKeyFromMs(timeMs));
}

/** Beijing-local weekday 0=Sunday … 6=Saturday. */
export function weekdayAt(timeMs) {
  return new Date(timeMs + TZ_OFFSET_MINUTES * MINUTE_MS).getUTCDay();
}

/** Minutes since Beijing-local midnight. */
export function minuteOfDayAt(timeMs) {
  const local = new Date(timeMs + TZ_OFFSET_MINUTES * MINUTE_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Tier at one instant: `'peak' | 'offPeak'`. Unknown holiday years fall back to peak. */
export function tierAt(timeMs) {
  if (timeMs < TIER_RULE_SINCE) return 'peak';
  if (isHolidayAt(timeMs)) return 'offPeak';
  const weekday = weekdayAt(timeMs);
  if (weekday === 0 || weekday === 6) return 'offPeak';
  const minute = minuteOfDayAt(timeMs);
  for (const [from, to] of PEAK_WINDOWS) {
    if (minute >= from && minute < to) return 'peak';
  }
  return 'offPeak';
}

/** Tier plus the price multiplier to apply for that tier. */
export function tierAndFactorAt(timeMs) {
  const tier = tierAt(timeMs);
  return { tier, factor: tier === 'offPeak' ? OFF_PEAK_RATIO : 1 };
}

/** Today's tier shape for the peak/off-peak mini chart (client geometry only). */
export function tierDayProfileAt(nowMs) {
  const workday = !isHolidayAt(nowMs) && weekdayAt(nowMs) !== 0 && weekdayAt(nowMs) !== 6;
  return {
    workday,
    peakWindows: workday ? PEAK_WINDOWS.map(w => [...w]) : [],
    offPeakRatio: OFF_PEAK_RATIO,
    utcOffsetMinutes: TZ_OFFSET_MINUTES,
  };
}

/** Next tier change instant (null when stable for the next 8 days). */
export function nextTierSwitchAt(nowMs) {
  const horizon = nowMs + 8 * DAY_MS;
  let best = null;
  const consider = (ms) => {
    if (ms <= nowMs) return;
    if (ms > horizon) return;
    const before = tierAt(ms - 1);
    const after = tierAt(ms);
    if (before !== after && (best === null || ms < best)) best = ms;
  };
  const localNow = nowMs + TZ_OFFSET_MINUTES * MINUTE_MS;
  const localMidnight = localNow - (localNow % DAY_MS);
  const firstMidnight = localMidnight - TZ_OFFSET_MINUTES * MINUTE_MS;
  for (let d = 0; d < 9; d += 1) {
    const dayStart = firstMidnight + d * DAY_MS;
    consider(dayStart);
    for (const [from, to] of PEAK_WINDOWS) {
      consider(dayStart + from * MINUTE_MS);
      consider(dayStart + to * MINUTE_MS);
    }
  }
  return best;
}

/** Whether two usage records describe the same token counts. */
export function sameUsage(a, b) {
  return a.input === b.input
    && a.cacheRead === b.cacheRead
    && a.cacheWrite === b.cacheWrite
    && a.output === b.output;
}
