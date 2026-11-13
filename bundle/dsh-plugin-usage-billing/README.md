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
  peak/off-peak strip. Escape or a click outside closes it; Tab is trapped inside
  and focus returns to the capsule.
- **Settings → 计费** (`settings.section`): four tabs — Overview (tokens and
  money, activity heatmap, per-model), Trend (daily bars and table), Detail
  (by day / by model / price table, filter, sort, pagination) and Wallet (real
  account balance, observed changes, refresh settings).

Both resident entries have their own switch in the plugin preferences; the
Settings page always stays available even when both are off.

## Billing rules

- Token buckets are disjoint: `inputTokens` is uncached input, and the billed
  input is `input + cacheRead + cacheWrite`. `reasoningTokens` are already
  included in `outputTokens` and are never priced twice.
- Prices are CNY (or USD converted with a live/default FX rate) per 1,000,000
  tokens. A price change appends a new snapshot; ledger rows keep the snapshot
  that was effective at their event time, so history is never rewritten.
- **Beijing time (UTC+8)** weekdays 09:00–12:00 and 14:00–18:00 are peak.
  Everything else — including weekends and CN statutory holidays — is off-peak
  at peak price × 0.5. The tier is decided per event timestamp and stored on the
  row. Day buckets and "today" also use Beijing time; the holiday table covers
  2025–2027 (the UI shows the coverage year).
- A model missing from the price table stays **unpriced**: the row shows `—`,
  never a guessed `0`. Rows may be re-priced later only while they are still
  unpriced.
- Events older than the plugin's first install are estimated with the price
  snapshot recorded at install time and marked as estimated (top-of-page banner
  in Overview).
- The monthly budget (default ¥100) fires the 50% / 80% / 100% notices once per
  month and keeps each unacknowledged notice until dismissed; the progress bar
  turns amber at ≥80% and red when over budget. A budget of `0` is treated as
  disabled, not as a silent 0% bar.

## Actual account balance

The plugin asks the platform's `deepseekAccount` service for the signed-in
account's recharge and bonus wallets — no API key is read, stored or sent by
this plugin. The observed wallets are shown as the **实际余额** strip in the
panel (also in the popover and the Wallet tab), with:

- **balance drop today** — the sum of observed balance decreases between the
  samples of the current Beijing day; a top-up is flagged and does not hide the
  spend, and a single sample reports `—` instead of a fake 0;
- **estimated today** — the local ledger cost of the same day, so the
  difference between estimated and actually charged money is visible;
- **vs previous sample** and a persisted change history;
- **link out** to the account usage and top-up pages.

Refresh cadence is configurable (15/30/60/120 s, default 30 s) and drives a
client-side scheduler; every manual refresh is immediate, and a live model
response triggers one extra check after a few seconds. There is no host-side
idle polling: with no open UI the plugin does not call the platform. Hidden
tabs back off to 5 minutes. Signed-out or unavailable states are labeled
instead of showing a fake zero.

## Data, install and privacy

- The ledger is stored through the platform's `storage-domain` facility
  (`usage_billing` domain, version 2, one record per day). No bare files are
  written into the user's directories by this plugin.
- **v1 data is not migrated.** Version 1 of this domain name belonged to
  `@zzerx/dsh-plugin-usage-billing` 1.3.1; the v2 domain reads those per-record
  documents as absent (they are left on disk untouched). Its
  `ledger_shards/`/`folds/` tables are ignored; history from that plugin is not
  imported.
- The optional online price refresh reads `models.dev/api.json` and
  `open.er-api.com`; when either fails the built-in price table and the default
  exchange rate are used and the UI labels the prices as non-live.
- Nothing blocks startup: the storage domain opens and history is backfilled
  asynchronously after activation. A failed open retries with backoff and the UI
  shows "ledger not ready" instead of fake zeros.

## Known limits

- Uninstalling the bundle removes rows, slots and profile dependencies; the
  platform's domain storage keeps the ledger documents under
  `$DSH_HOME/storages/usage_billing` (storage-domain has no unit-delete API).
  Remove that directory to erase the history.
- Subsessions created by forks inherit their parent's prefix; those events are
  billed once, in the source session.
- `sidebar.panellist` rows are icon + label only; the rich amount/progress card
  lives in the panel the entry opens.
