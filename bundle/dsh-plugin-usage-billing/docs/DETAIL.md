# Usage billing

Real token usage from **local session logs**, with each model call priced at the
price in effect when the event happened (write-time lock). No model tools and no
system-prompt text are registered or injected: the plugin only reads session
history and renders UI.

## Where it appears

- **Sidebar entry** (`sidebar.panellist`): one budget-ring icon plus the
  localized label; its id addresses the panel below, so clicking the row opens
  the full billing page in the main column.
- **Under the composer** (`conversation.composer.dock`): a capsule with the
  current session's amount and a monthly budget donut. Clicking it opens the
  detail popover.
- **Popover** (`shell.overlay`): this month spent/budget, cumulative sessions and
  projects, today's project/other split, unpriced-model warning and the
  peak/off-peak strip. Escape or a click outside closes it.
- **Settings → 计费** (`settings.section`): four tabs — Overview, Trend, Detail
  and Wallet (real account balance, observed changes, refresh settings).

Both resident entries have their own switch in the plugin preferences; the
Settings page always stays available even when both are off.

## Billing rules

- Token buckets are disjoint: `inputTokens` is uncached input, and the billed
  input is `input + cacheRead + cacheWrite`. `reasoningTokens` are already
  included in `outputTokens` and are never priced twice.
- Prices are CNY (or USD converted with a live/default FX rate) per 1,000,000
  tokens. A price change appends a new snapshot; ledger rows keep the snapshot
  that was effective at their event time, so history is never rewritten.
- **Beijing time** weekdays 09:00–12:00 and 14:00–18:00 are peak. Everything
  else — including weekends and CN statutory holidays — is off-peak at
  peak price × 0.5. The tier is decided per event timestamp and stored on the
  row.
- A model missing from the price table stays **unpriced**: the row shows `—`,
  never a guessed `0`. Rows may be re-priced later only while they are still
  unpriced.
- Events older than the plugin's first install are estimated with the price
  snapshot recorded at install time and marked as estimated everywhere.
- The monthly budget (default ¥100) fires the 50% / 80% / 100% notices once per
  month; the progress bar turns amber at ≥80% and red when over budget.

## Actual account balance

The wallet is read from the platform `deepseekAccount` service (recharge and
bonus wallets); this plugin never reads or stores an API key. Samples are kept
in the `balances` table of the `usage_billing` domain and pruned to the newest
1,200 rows. Daily spend is the sum of observed balance drops within the Beijing
day; a top-up is flagged in the UI instead of being silently counted as zero
spend, and fewer than two samples for the day reports unknown (`—`). The refresh
interval is a preference (default 30 s) and drives a client-side scheduler;
manual refresh bypasses it and a hidden tab backs off to 5 minutes.

Adding the `balances` table did not bump the domain version: per-record readers
only load the tables declared by their own spec, so a 1.3.x reader ignores the
extra wallet documents while the version-2 ledger keeps working. Bumping would
hide the existing ledger from this reader, so the version stays 2.

## Versioning and v1 data

The storage domain is `usage_billing` **version 2**, per-day shards. Version 1 of
the same domain name belonged to `@zzerx/dsh-plugin-usage-billing` 1.3.1; its
`ledger_shards/` and `folds/` documents are not part of this spec and read as
absent, so no v1 history is imported or mixed into the new ledger. The v1 files
are left on disk (the platform has no unit-delete API); delete
`$DSH_HOME/storages/usage_billing/ledger_shards` and its `folds` sibling if you
want them gone.

## Data and privacy

- The ledger is stored through the platform's `storage-domain` facility
  (`usage_billing` domain, one record per day). No bare files are written into
  the user's directories by this plugin.
- The optional online price refresh reads `models.dev/api.json` and
  `open.er-api.com`; when either fails the built-in price table and the default
  exchange rate are used and the UI labels the prices as non-live.
- The holiday table covers 2025–2027; the UI states that coverage year. Beyond
  it, only weekends are off-peak. Day buckets and peak windows use Beijing time
  (UTC+8); the billing method line in the UI says so.
- A monthly budget of 0 is treated as disabled and shown as such, never as a
  silent 0% progress bar.
- Nothing blocks startup: the storage domain opens and history is backfilled
  asynchronously after activation.

## Known limits

- Uninstalling the bundle removes rows, slots and profile dependencies; the
  platform's domain storage keeps the ledger documents under
  `$DSH_HOME/storages/usage_billing` (storage-domain has no unit-delete API).
  Remove that directory to erase the history.
- The holiday table covers 2025–2027; outside it, only weekends are off-peak.
- Subsessions created by forks inherit their parent's prefix; those events are
  billed once, in the source session.
