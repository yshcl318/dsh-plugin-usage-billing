# Changelog

## 1.3.1

Test/release hygiene only; runtime code unchanged.

- `pnpm test` now runs the DOM (jsdom) suite too, so `pnpm test` and
  `pnpm check` cover the same tests (check additionally runs `tsc`).
- The DOM suite uses React 18.3's own `act` from `react`, dropping the
  deprecated `react-dom/test-utils` warning.

## 1.3.0

## 1.3.0

Fourth review pass — reading semantics, layout and packaging.

- "Average per day" is now labelled **active daily average**, matching the
  calculation (total ÷ active days, not ÷ range days).
- Token labels are disambiguated: the overview cache card names both sides
  ("cache read … · input side …") and every total is labelled "Total tokens"
  instead of a bare "Token".
- The trend daily table hides zero-value days by default, with a
  "Show empty days" toggle; the chart still keeps the full range.
- Overview layout: the activity heatmap card sizes to its content, and the
  peak/off-peak strip is a compact row inside the budget card instead of its own
  full-width card, so the model table moves up.
- Added the MIT `LICENSE` file and included it in `files`; added a
  `.gitignore` for workspace-only artifacts.
- Type checking remains enabled (`tsc` 0 errors). A measured
  `noImplicitAny` trial reports 656 errors in the browser half and 339 in the
  host/tests (69 for pricing+ledger alone), so enabling it needs a dedicated
  typing pass rather than a config flip; this is documented as the next step.
- New jsdom + React DOM test suite renders the panel, capsule and popover and
  asserts today's calls, the 14-cell heatmap window, the single refresh button,
  the trend empty-day filter, and popover focus/close behaviour.

## 1.2.0

## 1.2.0

Second acceptance-review pass.

- **Today card bug**: it showed the selected range's call count; it now uses
  `todaySplit.totalCalls` (today only), covered by a view-model regression test.
- One refresh affordance per page: the header refresh forces every mounted query
  once (`refreshNonce`); the duplicate toolbar refresh is gone.
- Budget progress is no longer repeated in the month stat card; the dedicated
  budget card owns it. The month card title follows the selected range
  (this month / 7 days / 30 days / all) and shows the range's total.
- Peak/off-peak strip is capped to a compact width so it no longer pushes the
  model table off screen.
- Activity heatmap window is narrowed from the active days; the hint now states
  the rendered window ("last N days") instead of always "90 days".
- Price source is visible next to the range switch ("built-in price · default
  FX ×7.1" or "live price"), and the budget rows mark "incl. subagents".
- Capsule exposes an accessible label for the current-session amount.
- Type checking: `tsconfig.json` with `checkJs`, ambient declarations for
  `react`/`zod`/`window.__ModuleLoader__`, `pnpm typecheck`, and
  `// @ts-check` markers. `pnpm check` runs typecheck + both test suites.
- Tests now cover the view-model helpers (today calls, range labels, sparse
  heatmap, budget scope), not just Host aggregation and wiring.

## 1.1.0

## 1.1.0

Fixes from the acceptance review.

- Project split: the Client resolves the project cwd from the current (or newest)
  session and passes it to `overview`; unknown context hides the
  project/other rows instead of showing a misleading ¥0.00.
- Data hygiene: cleaned v1-era `ledger_shards`/`folds` records and
  invalid-record backups; the v2 domain never migrated v1 rows (documented).
- Storage-domain schemas prefer the real `zod` runtime (via `z.custom`) and
  fall back to a compatible shim only when zod cannot be resolved.
- Retry counter resets after a successful storage-domain open; a failed attach
  closes the domain instead of reserving the name.
- A zero budget now renders as "budget disabled" rather than 0%.
- Holiday coverage ("covers 2025–YYYY") and the Beijing-time basis are shown in
  the UI; `engines.dsh` declares the compatible Host range.
- Accessibility: the popover traps Tab, focuses the close button, restores focus
  on close, and the capsule exposes `aria-haspopup`/`aria-expanded`.
- Estimations ("估算") are surfaced at the top of the overview; cumulative
  session counts annotate subagent sessions; a sparse activity heatmap narrows
  its window instead of painting 90 mostly-empty days.
- Tests run from the workspace root (`pnpm test` / `npm test`).

## 1.0.0

Initial bundle: Host aggregation from session logs, write-time price lock,
peak/off-peak pricing, monthly budget notices, storage-domain persistence,
sidebar entry + main panel, composer capsule, popover, Settings section.
