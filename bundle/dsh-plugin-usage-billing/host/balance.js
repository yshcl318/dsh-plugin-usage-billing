/**
 * Actual DeepSeek account balance: parsing, persisted snapshots and the
 * client-safe view.
 *
 * The Host half reads the wallet balances through the platform's
 * `deepseekAccount` service (`getBalance`), which already owns the account
 * grant. Nothing here touches a token directly: the plugin only asks the
 * account service and remembers the values it observed, so it can show
 * "balance now", "change since the previous observation" and today's
 * actually-charged amount next to the locally estimated cost.
 *
 * Wallet amounts are strings in the platform response; they are stored as
 * numbers in our own domain rows (never user-authored text).
 */

import { dayKeyAt } from './pricing.js';

/** Keep roughly one day of dense samples plus sparse older changes. */
export const BALANCE_HISTORY_LIMIT = 1200;

/** A heartbeat sample is written even when nothing changed, to bound gaps. */
export const BALANCE_HEARTBEAT_MS = 10 * 60 * 1000;

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

function roundMoney(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** Sum one currency across wallets; unknown/invalid entries are ignored. */
export function walletSum(wallets, currency) {
  if (!Array.isArray(wallets)) return 0;
  let total = 0;
  for (const wallet of wallets) {
    if (wallet === null || typeof wallet !== 'object') continue;
    if (wallet.currency !== currency) continue;
    const value = Number(wallet.balance);
    if (Number.isFinite(value) && value > 0) total += value;
  }
  return roundMoney(total);
}

/**
 * Normalize the account service answer into a plain, loggable result.
 * `details === null` means signed out; `{status:'failed'}` means the platform
 * call failed; `{status:'ready', ...}` carries the wallets.
 */
export function normalizeAccountBalance(details) {
  if (details === null || details === undefined) {
    return { status: 'signedOut', wallets: [], bonusWallets: [], error: null };
  }
  if (details.status === 'failed') {
    return { status: 'failed', wallets: [], bonusWallets: [], error: 'account balance query failed' };
  }
  if (details.status !== 'ready') {
    return { status: 'failed', wallets: [], bonusWallets: [], error: 'unexpected account balance payload' };
  }
  return {
    status: 'ready',
    wallets: Array.isArray(details.value) ? details.value : [],
    bonusWallets: Array.isArray(details.bonusWallets) ? details.bonusWallets : [],
    error: null,
  };
}

/**
 * Build one persisted snapshot row from a ready account balance.
 * `cny`/`usd` are recharge wallets, `bonusCny`/`bonusUsd` the bonus wallets.
 */
export function snapshotFromBalance(details, at) {
  const normalized = normalizeAccountBalance(details);
  if (normalized.status !== 'ready') return null;
  return {
    id: `bal-${at}`,
    at,
    cny: walletSum(normalized.wallets, 'CNY'),
    bonusCny: walletSum(normalized.bonusWallets, 'CNY'),
    usd: walletSum(normalized.wallets, 'USD'),
    bonusUsd: walletSum(normalized.bonusWallets, 'USD'),
    source: 'account',
  };
}

/** Total CNY value of a snapshot (USD converted at the current FX rate). */
export function totalCnyOf(row, usdToCny) {
  if (row === null || row === undefined) return null;
  const rate = isFiniteNumber(usdToCny) && usdToCny > 0 ? usdToCny : 0;
  return roundMoney(row.cny + row.bonusCny + ((row.usd ?? 0) + (row.bonusUsd ?? 0)) * rate);
}

/** True when a new observation is worth persisting. */
export function shouldAppendBalance(previous, next, now) {
  if (previous === undefined || previous === null) return true;
  if (now - previous.at >= BALANCE_HEARTBEAT_MS) return true;
  return previous.cny !== next.cny
    || previous.bonusCny !== next.bonusCny
    || previous.usd !== next.usd
    || previous.bonusUsd !== next.bonusUsd;
}

/** Drop the oldest rows beyond the limit; returns the removed rows. */
export function pruneBalanceHistory(history) {
  if (history.length <= BALANCE_HISTORY_LIMIT) return [];
  const removed = history.slice(0, history.length - BALANCE_HISTORY_LIMIT);
  history.splice(0, history.length - BALANCE_HISTORY_LIMIT);
  return removed;
}

/**
 * Client-safe view of the wallet state and the observed changes.
 *
 * `todaySpentCny` is derived from observations, not from billing documents:
 * it is the drop between the first observation of the Beijing day (or the last
 * observation of the previous day) and the newest one. `todayBaseline` tells
 * the UI which anchor was used; null means the plugin has not observed a
 * baseline yet.
 */
export function balanceView(history, options) {
  const {
    now, todayKey, usdToCny, estimatedTodayCny, estimatedMonthCny,
    links, status, enabled, refreshSeconds, error, checkedAt,
  } = options;
  const rows = Array.isArray(history) ? history.slice().sort((a, b) => a.at - b.at) : [];
  const last = rows.at(-1) ?? null;
  const previous = rows.length >= 2 ? rows.at(-2) : null;
  const lastTotal = totalCnyOf(last, usdToCny);
  const previousTotal = totalCnyOf(previous, usdToCny);

  const todayRows = rows.filter(row => dayKeyAt(row.at) === todayKey);
  // Sum observed balance drops today, so a top-up does not erase the spend.
  // A single sample cannot prove a drop yet; report unknown instead of 0.
  let todaySpentCny = null;
  let todayTopUp = false;
  let todayStartCny = todayRows.length === 0 ? null : totalCnyOf(todayRows[0], usdToCny);
  if (todayRows.length >= 2) {
    let spent = 0;
    for (let index = 1; index < todayRows.length; index += 1) {
      const before = totalCnyOf(todayRows[index - 1], usdToCny);
      const after = totalCnyOf(todayRows[index], usdToCny);
      if (before === null || after === null) continue;
      const diff = before - after;
      if (diff > 0.00005) spent += diff;
      else if (diff < -0.00005) todayTopUp = true;
    }
    todaySpentCny = roundMoney(spent);
  }
  const todayBaseline = todayRows.length >= 2 ? 'today' : null;

  const recent = rows.slice(-40).map(row => ({
    at: row.at,
    totalCny: totalCnyOf(row, usdToCny),
    cny: row.cny,
    bonusCny: row.bonusCny,
    usd: row.usd,
  }));

  return {
    ready: status === 'ready',
    enabled: enabled !== false,
    status: enabled === false ? 'disabled' : status,
    wallets: last === null ? [] : [
      ...(last.cny > 0 ? [{ currency: 'CNY', balance: String(last.cny) }] : []),
      ...(last.usd > 0 ? [{ currency: 'USD', balance: String(last.usd) }] : []),
    ],
    bonusWallets: last === null ? [] : [
      ...(last.bonusCny > 0 ? [{ currency: 'CNY', balance: String(last.bonusCny) }] : []),
      ...(last.bonusUsd > 0 ? [{ currency: 'USD', balance: String(last.bonusUsd) }] : []),
    ],
    totalCny: lastTotal,
    bonusCny: last === null ? null : roundMoney(last.bonusCny),
    usd: last === null ? null : last.usd,
    // Last successful account check (may be newer than the last stored row).
    fetchedAt: checkedAt !== undefined && checkedAt !== null ? checkedAt : (last === null ? null : last.at),
    sampleAt: last === null ? null : last.at,
    previousAt: previous === null ? null : previous.at,
    previousCny: previousTotal,
    deltaCny: previousTotal === null || lastTotal === null ? null : roundMoney(lastTotal - previousTotal),
    todayKey,
    todayStartCny,
    todayBaseline,
    todaySpentCny,
    todayTopUp,
    todayEstimatedCny: isFiniteNumber(estimatedTodayCny) ? roundMoney(estimatedTodayCny) : null,
    estimateDiffCny: isFiniteNumber(estimatedTodayCny) && todaySpentCny !== null
      ? roundMoney(estimatedTodayCny - todaySpentCny)
      : null,
    monthEstimatedCny: isFiniteNumber(estimatedMonthCny) ? roundMoney(estimatedMonthCny) : null,
    history: recent,
    links: links === undefined || links === null ? null : links,
    refreshSeconds: isFiniteNumber(refreshSeconds) && refreshSeconds > 0 ? refreshSeconds : 30,
    error: error ?? null,
    now,
  };
}

/** Placeholder view used before the storage domain is ready. */
export function emptyBalanceView(refreshSeconds = 30) {
  return {
    ready: false,
    enabled: true,
    status: 'loading',
    wallets: [],
    bonusWallets: [],
    totalCny: null,
    bonusCny: null,
    usd: null,
    fetchedAt: null,
    previousAt: null,
    previousCny: null,
    deltaCny: null,
    todayKey: null,
    todayStartCny: null,
    todayBaseline: null,
    todaySpentCny: null,
    todayTopUp: false,
    todayEstimatedCny: null,
    estimateDiffCny: null,
    monthEstimatedCny: null,
    history: [],
    links: null,
    refreshSeconds,
    error: null,
    now: Date.now(),
  };
}
