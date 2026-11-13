# Host research — Remote channel, storage-domain, reference contract (DSH 0.2.2-rc.2)

All facts below were read from the installed build. Shorthand: `$INSTALL` = `D:\Users\Hp\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh`, `$AI` = `$INSTALL\node_modules\@deepseek-ai`, `$PROFILE` = `C:\Users\Hp\.dsh\profiles\desktop`, `$REF` = `D:\deepseek-harness\ref\usage-billing-1.3.1\package`. The target bundle `D:\deepseek-harness\bundle\dsh-plugin-usage-billing` already hand-writes Host markers; this document verifies it and supplies the Client half.

## Part A — exposing a Host service to the plugin's own dynamic Client half

### A.1 Mechanism (no Typert codegen)

1. **Host claim** — the Gateway claims any two-segment endpoint whose active service has a `typertRemote` binding and prototype markers: `$AI/dsh-api-gateway/src/index.ts:380-387` (`claimsEndpoint`), `:401-416` (`collectSrcClaims`), `:891-1012` (`resolveSrcDescriptor`/`srcDescriptor`). Marker property is `'@deepseek-ai/dsh-typert-protocol/remote-methods'`, payload `{version: 1, methods: [{method, invocation:{kind:'direct'}}]}` (`$PROFILE/node_modules/@deepseek-ai/dsh-typert-protocol/src/index.ts:224,404-408,469-476`). This is the "SRC fallback" of `$INSTALL/node_modules/@deepseek-ai/dsh/docs/api-gateway.md:136-142`, but applied unconditionally: it is how a profile plugin is callable on the shipped app.
2. **Client mount** — `ctx.remote.$mount(contribution)` installs concrete methods and a `remote.<namespace>` child service from a plain `TypertRemoteContribution` (`$AI/dsh-api-gateway/src/client/index.ts:214-222,254-324,638-718`; shape in protocol `src/types.ts:527-532`).

The reference plugin proves the combination: `class UsageBillingService extends TypertRemoteService` (`$REF/lib/index.js:18060-18081`) plus `markRemoteMethods` on its prototype (`:18340-18354`) plus a hand-built client contribution mounted through `ctx.remote.$mount` (`$REF/lib/client.js` ~1976-2009).

### A.2 Host half — verified minimal pattern

```js
// host/service.js (ESM, Host process)
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const REMOTE_NAMESPACE = 'usageBilling'          // wire namespace == Cordis service key
export const REMOTE_METHODS = Object.freeze([
  { method: 'overview', params: ['rangeKind', 'includeSubagents'] },
  { method: 'status', params: [] }])

const MARKER = '@deepseek-ai/dsh-typert-protocol/remote-methods'
function markRemoteMethods(prototype, methods) {
  Object.defineProperty(prototype, MARKER, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(methods.map(({ method }) =>
        Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }))),
    }),
  })
}

export class UsageBillingService extends TypertRemoteService {
  constructor(ctx) { super(ctx, REMOTE_NAMESPACE) }     // default namespace = service key
  async overview(rangeKind, includeSubagents) { /* ... */ }
  async status() { /* ... */ }
}
markRemoteMethods(UsageBillingService.prototype, REMOTE_METHODS)
```

Gateway-enforced rules:

- The class must be a Cordis `Service` on a plugin context; `TypertRemoteService` calls `super(ctx, key)` and sets the visible `typertRemote` binding (`protocol/src/index.ts:236-264`). Non-Service classes: `readonly typertRemote = bindTypertRemote(this, key, { namespace })`.
- SRC parses parameter names from `Function.prototype.toString` (`$AI/dsh-api-gateway/src/index.ts:1586-1628`): plain unique identifiers only, no destructuring/defaults/rest; a final parameter named exactly `signal` becomes injected cancellation (`:925-938,853`). Names must equal the client's `wire` names, in order.
- A parameter named like a registered lookup (`agent`, `session`, …) is auto-classified as a lookup (`:941-961`); avoid those names for plain JSON.
- Namespace/method satisfy `[A-Za-z0-9_$.-]+` and not `.`/`..` (`protocol/src/index.ts:24-33`); use camelCase, since a dotted namespace collides with Cordis child-service keys. Two services exporting one endpoint fail with `gateway/ambiguous-endpoint`, a mismatched binding with `gateway/binding-invalid` (`$AI/dsh-api-gateway/src/index.ts:909-916,1539-1579`).
- A TS build with standard decorators may use `@Remote` (same prototype descriptor); an esbuild bundle must hand-write the marker as above.
- Business throws fold to `gateway/internal`; `new RemoteError('my-plugin/x', …)` needs its code merged into `RemoteErrorDetailsMap` (`protocol/src/types.ts:103-132`); non-owner peers additionally need resource policies (`$AI/dsh-api-remote-access/src/index.ts:199-202`).

### A.3 Client half — a contribution `$mount` accepts

```js
// client.js (browser bundle; exports {name, inject, apply})
import { REMOTE_NAMESPACE, REMOTE_METHODS } from '../shared/remote-methods.js'

// $mount rejects any parameter codec whose mode !== 'strict'
// ($AI/dsh-api-gateway/src/client/index.ts:803-818)
const JSON_STRICT = Object.freeze({ mode: 'strict', typeSymbol: 'json', create: () => ({ parse: v => v }) })
const CONTRIBUTION = Object.freeze({
  package: '@yshcl318/dsh-plugin-usage-billing',
  descriptors: REMOTE_METHODS.map(({ method, params }) => ({
    id: `${REMOTE_NAMESPACE}.${method}`,
    service: REMOTE_NAMESPACE, namespace: REMOTE_NAMESPACE, method,
    invocation: { kind: 'direct' },
    parameters: params.map(name => ({ name, wire: name, source: 'json', codec: JSON_STRICT })),
    result: { mode: 'src-json' },                       // result codec may be src-json
  })),
})

export const inject = ['remote']
export function apply(ctx) {
  ctx.remote.$mount(CONTRIBUTION).catch(error => {
    ctx.logger.warn('[usage-billing] remote mount failed:', error)  // UI must survive this
  })
}
```

- `REMOTE_METHODS` must be the single source for both halves. Calls are positional: `ctx.remote.<ns>.<method>(...args)`; wrong arity throws locally as `client api: … expected N argument(s), got M` (`client/index.ts:499-517`) — an assembly fault, not a `RemoteResult`, so guard `try/catch` where arity can drift.
- `ctx.remote.<namespace>` exists only after `$mount` resolves (`:361-393,765-767`); wait with `ctx.inject(['remote.<namespace>'], cb)`.
- `$mount` rejects for a repeated `package`, duplicate endpoint/id, namespace/method conflict, missing strict codec, or illegal segment (`:254-324`; `$AI/dsh-typert-registry/src/service.ts:124-139,200-217`), unwinding everything installed.
- Mount success does not prove Host reachability: calls keep returning failed `RemoteResult`s until the Host service is mounted.

### A.4 Failure handling that keeps the UI alive

Reference pattern (two inject layers, `$REF/lib/types/client/index.d.ts:1-6`): mount once, catch+log, register UI only under the namespace dependency.

```js
export const inject = ['remote', 'slots']
export function apply(ctx) {
  ctx.remote.$mount(CONTRIBUTION).catch(error => {
    ctx.logger.warn('[usage-billing] remote namespace mount failed', error)
  })
  ctx.inject(['remote.usageBilling'], uiCtx => registerUi(uiCtx)) // fires only if mounted
}
```

Call sites branch on the result (`protocol/src/types.ts:123-132`):

```js
const result = await ctx.remote.usageBilling.overview('month', true)
if (!result.ok) { console.warn('[usage-billing] overview failed', result.error.code); return }
use(result.value)
```

That is why the reference's `usageBillingOf(ctx)` is typed `UsageBillingRemote | undefined` (`$REF/lib/types/client/core/remote.d.ts:126-130`). Official style instead lets a mount failure fail the plugin fiber (`$PROFILE/node_modules/@deepseek-ai/dsh-experimental-client-ui-forge/src/client/mount.ts:425-427`); a bundle keeping its own UI should catch and degrade.

### A.5 Fallbacks when Remote is unusable

**Preferred — a private Connection RPC channel** (same carrier, auth, cancellation, envelope):

```js
// host apply body
ctx.inject(['connection'], c => {
  c.effect(function* () { yield c.connection.rpc.handle('/usage-billing', handler) })
})
// client (needs inject: ['connection'])
const result = await ctx.connection.rpc.call('/usage-billing', 'overview', { rangeKind }, signal)
if (!result.ok) throw new Error(result.error.code)
```

`rpc.handle` registers a prefix channel plus, when `webServer` exists, an authenticated route (`$AI/dsh-client-connection/src/rpc-host.ts:253-277`); the browser POSTs `/<channel>/<endpoint>` as a JSON RPC envelope and throws only on transport failure (`client/rpc.ts:34-70`). Channel names match `^/[A-Za-z0-9._~-]+$` on both faces (`rpc-host.ts:67`, `client/rpc.ts:11`). No typert codecs, so the payload contract is yours.

**Last resort — a plain Web route:** `ctx.webServer.register({kind:'exact'|'prefix', path, handler(req,res) | resource(request)})` returns a disposer; duplicates throw (`$AI/dsh-host-webserver/src/index.ts:445-452`). The reference mounts a theme route exactly this way, via `ctx.inject(['webServer'], …)` (`$REF/lib/index.js` region `src/themes/route.ts`, offsets ~475564-481000). Caveats: exists only where `webServer` is mounted; handlers get **no** Connection auth unless they call `ctx.connection.admit(req)`; the browser must `fetch()` a document-relative path.

**Not available:** the dynamic Client half is a browser bundle, so `node:` modules, IPC, and direct filesystem access are impossible there. The channel must be Connection RPC, a Web route, or Typert Remote.

## Part B — storage-domain persistence

### B.1 API and declaration

`ctx.storageDomain` (alias `ctx.storage.domain`) is `DomainFacility` (`$PROFILE/node_modules/@deepseek-ai/dsh-storage-domain/src/index.ts:69-195`). The owning package declares a domain once with `defineDomain`; consumers `await ctx.storageDomain.open(spec)` and own the handle via `domain.close()`.

```ts
// host/domain.ts (TS + zod; a JS bundle may duck-type {parse, safeParse} — see B.2)
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

type DayKey = string & { readonly __dayKey: unique symbol }  // phantom key type only
const dailySchema = z.object({
  calls: z.number().default(0),
  costCny: z.number().default(0),
  updatedAt: z.number(),
}).passthrough()                                     // tolerates later fields

export const USAGE_BILLING_DOMAIN = defineDomain({
  name: 'usage_billing',                             // ^[a-z][a-z0-9_]*$; shared namespace
  version: 1,
  layout: 'per-record',                              // 'single' is the default
  global: {                                          // optional singleton slot; must reject null
    schema: z.object({ lastScanAt: z.number().optional() }).passthrough(),
    initial: {},
  },
  tables: {
    daily: domainTable<DayKey, z.infer<typeof dailySchema>>(dailySchema), // key = day string
  },
})
```

```js
// host/index.js
export const inject = ['storageDomain']
export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(USAGE_BILLING_DOMAIN)
  ctx.effect(() => () => { void domain.close() })     // caller owns the handle

  const daily = domain.table('daily')
  const today = dayKey(Date.now())                    // local-timezone 'YYYY-MM-DD'
  try {
    await daily.update(today, row => merge(row, delta))  // atomic on the write chain
  } catch (error) {
    if (error?.code === 'missing-key') await daily.put(today, merge(initialRow(today), delta))
    else throw error
  }
  const meta = domain.global.get()                    // sync; `initial` before first set()
  if (meta.lastScanAt === undefined) await domain.global.set({ ...meta, lastScanAt: 0 })
}
```

`KvTable` (`$PROFILE/node_modules/@deepseek-ai/dsh-storage-domain/src/domain.ts:43-108`): sync `get(key)`, snapshot `entries()`/`keys()`, `size`, whole-record `put(key,value)`, `delete -> boolean`, `deleteMany -> count`, `update(key, fn)` (missing → `DomainError('missing-key')`). Writes queue on one per-domain chain, are durable before resolving, then emit one `domain/changed` in write order (`domain.ts:283-301,391-408`; `src/events.ts:36-47`). Reads after `close()` throw `DomainError('closed')`.

### B.2 zod dependency

`dsh-storage-domain` depends on `zod 4.6.6` (`$PROFILE/node_modules/@deepseek-ai/dsh-storage-domain/package.json:38-41`), already hoisted in the profile. Runtime only calls `valueSchema.parse`, `global.schema.parse`, and `global.schema.safeParse(null)` (`src/index.ts:126,140,151`), so a JS plugin may duck-type `{parse, safeParse}` and skip zod; TS users should declare `"zod": "4.6.6"` for `ZodType`. Essential: `.default()`/`.optional()` every field added after v1 and `.passthrough()` object schemas — `open()` validates every stored record, and one missing required field rejects the whole domain with `invalid-record` (`$REF/lib/types/domain.d.ts:24-29`).

### B.3 Layout, keys, per-day shards

- `single` (default): whole unit = one document; each write republishes it. Fine for small units.
- `per-record`: one version-stamped document per record; point writes touch only that document. Keys become path segments and must match `[a-zA-Z0-9_-]+` (`$AI/dsh-storage/src/backend.ts:99-101`), so `YYYY-MM-DD` is legal; unsafe keys reject before I/O.
- Per-day modeling: one `daily` table keyed by local day string; optionally a per-session/day shard table keyed `sessionId__day` (reference: `ledger_shards`, `$REF/lib/types/domain.d.ts:11-17`). Retention: iterate `keys()` and `deleteMany(old)`.
- Domain and table names both match `^[a-z][a-z0-9_]*$` and are globally shared — prefix with the plugin name (`spec.ts:107-139`). `defineDomain` fails loud on bad name/version/layout/table, a global schema accepting `null`, or bad `invalidRecords` (`spec.ts:107-147`).

### B.4 Versioning and failures

Bump `version` without migration: `single` rejects `open()` with `version-mismatch`; `per-record` reads old documents as absent (invisible, not deleted) (`$AI/dsh-storage/src/backend.ts:31-43`). Declare `compatibleVersions: [old…]` when current schemas still accept old rows (`spec.ts:48-56`); writes stamp current, untouched records keep theirs. A stored record failing its schema rejects open with `DomainError('invalid-record', …, {detail:{table,key}})` unless `invalidRecords:'backup-and-skip'` and the backend supports `backupRecord` (`index.ts:120-167,197-209`). Codes: `already-open`, `facet-unsupported`, `missing-key`, `closed` (`src/error.ts:7-13`); backend `backend-not-found`/`version-mismatch`/`malformed-medium`/`unknown-state` pass through unwrapped, and after `unknown-state` all reads/writes reject until close. HMR reloads can race `already-open`; a short retry is reasonable. Catch `open()` failures in `apply` and degrade (empty/read-only service) instead of failing plugin load — `open` is a strict sequence (`src/index.ts:104-174`).

### B.5 On-disk location and uninstall residue

The default composition routes every domain to the `json` backend: `storage-json` `root: !!js dshHomePath('storages')`, `storage-domain` `backend: json` (`$AI/dsh-base/cordis.patch.yml:179-190`), i.e. `C:\Users\Hp\.dsh\storages\`. On disk (verified): `single` → `storages/<domain>.json` (e.g. `workspace.json`); `per-record` → `storages/<domain>/<table>/<key>.json` plus `storages/<domain>/global.json` (e.g. `storages\usage_billing\ledger_shards\session-93fa…__2026-11-12.json`).

**Uninstall leaves data behind**: no unit-delete API exists (`KvFacet`/`KvUnit` only open/loadAll/put/delete/setGlobal/backupRecord/close, `$AI/dsh-storage/src/backend.ts:30-168`) and the domain layer deletes nothing on unmount. Evidence: `@zzerx/dsh-plugin-usage-billing` is absent from `$PROFILE/package.json`, yet `storages\usage_billing\` remains. A reinstall resumes old rows; a clean uninstall needs the plugin to delete its records at dispose, or the user to remove `$DSH_HOME/storages/<domain>`.

## Part C — reference plugin contract (`@zzerx/dsh-plugin-usage-billing` 1.3.1)

Host lifecycle (`$REF/lib/index.js` region `src/index.ts`): `inject=['storageDomain']`; `open(domain)` then `ctx.effect(() => () => domain.close())`; `new UsageBillingService(ctx, {domain, settings, installAt, source, fetchPricing})`; base snapshot seeded; startup rebuild/warmup/repricing plus a 60 s refresh timer inside `ctx.effect`; degrades when `storageDomain` is absent.

### C.1 Config / settings (schemastery, whole containers `volatile()`)

| Section | Field | Type | Default |
|---|---|---|---|
| budget | enabled | boolean | `false` |
| budget | monthlyCny | number | `100` |
| display | showUnpricedWarning | boolean | `true` |
| display | showTierCurve | boolean | `true` |
| display | theme | string (theme id) | `'builtin'` |
| display | includeSubagents | boolean | `true` |
| display | entrySidebar | boolean | `true` |
| display | entryComposer | boolean | `false` |
| display | entryPosition | `'sidebar' \| 'composer'` | `'sidebar'` |
| pricing | autoRefresh | boolean | `true` |
| pricing | refreshHours | number | `6` |
| notices | backfillDismissed | boolean | `false` |
| notices | budgetNotified | `Record<monthKey, tier>` | `{}` |

(`$REF/lib/types/settings.d.ts:7-37`; defaults at bundle offset ~456318.) Each container is volatile as a whole because schemastery forbids nested volatile. The client reads/writes via `ctx.configForms.get(<profile entry id>)`, so the bundle row id must equal the config namespace (`USAGE_BILLING_NAMESPACE = 'usage-billing-zzerx'`, `$REF/lib/types/types.d.ts:126-127`). The plugin owns a `settings.section`, disabling the host's auto-built settings page.

### C.2 Pricing model

- `PriceEntry = {input, cacheRead, cacheWrite, output, currency:'CNY'|'USD'}` per **1M tokens**; key `"<provider>/<model>"`, provider trimmed/lowercased (`$REF/lib/types/types.d.ts:6-13`).
- Lookup candidates: provider/raw, provider/normalized, provider/alias, `*/canonical`, `*/normalized`, `*/raw`, `*/route-token-stripped`, `provider/*`, `*/*` (`$REF/lib/types/model-key.d.ts:32-53`; synonyms `{"deepseek-flash":"deepseek-v4-flash"}`, offset ~137753).
- Peak/off-peak: rule since `2026-08-17 00:00 Asia/Shanghai`; peak windows `[540,720]`=09:00–12:00 and `[840,1080]`=14:00–18:00, weekdays only; CN statutory holidays are all-day off-peak; `offPeakRatio = 0.5` multiplies all four prices. Tier is decided per event timestamp and stored on the row (`$REF/lib/types/pricing/tiers.d.ts:1-38`; `TIER_RULES` offset ~422711).
- Snapshot ledger: one `base` + append-only `delta`s (`reason: install|catalog-refresh|custom-price|manual-refresh`, `usdToCny`, `usdToCnySource:'live'|'default'`, `entries`, optional `removed`). Folding replays snapshots up to the event time (`resolveSnapshotAt(event.time)`), so the cost is locked at write time (`$REF/lib/types/pricing/snapshot.d.ts:1-46`).
- Sources: `models.dev/api.json`, FX `open.er-api.com` (default `7.1` offline), refresh default 6 h (`$REF/lib/types/pricing/fetch.d.ts:8-42`).

### C.3 Ledger / domain shapes

Five `per-record` tables plus global `DomainMeta` (`$REF/lib/types/domain.d.ts:36-51`):

| Table | Key | Record |
|---|---|---|
| `ledger_shards` | `sessionId__day` | `{v, sessionId, day, rows: LedgerRow[]}` |
| `folds` | encoded sessionId | `{sessionId, stamp?, foldedThroughSeq, lastTime, headerCreatedAt, lastSnapshotId}` |
| `snapshots` | snapshot id | `PriceSnapshot` |
| `aliases` | encoded `(provider, rawModel)` | `{id, provider, rawModel, canonicalModel}` |
| `diag` | `(sessionId, kind)` | `{id, at, lastAt, count, kind:'session-read'\|'pricing-fetch'\|'projection', detail}` |

`LedgerRow = {id:'<sessionId>__<seq>', sessionId, seq, time, provider, model, day:'YYYY-MM-DD'(local), cwd?, isSubagent, delegationDepth?, input, cacheRead, cacheWrite, output, reasoning, costCny, currency, priced, snapshotId, tier?:'peak'|'offPeak', backfilled}` (`$REF/lib/types/types.d.ts:28-56`). Row id is the idempotency key inside a shard; shards only cut file count (`$REF/lib/types/ledger-store.d.ts:1-42`).

### C.4 Aggregation dimensions

Dimensions: provider, model (aliases display-only; raw ids stored), local day, session, workspace (`cwd`, unknown labelled), subagent on/off, delegation depth. Ranges `7d|30d|month|all` (`all` capped at 90 days, explicit range at 456) (`$REF/lib/types/time.d.ts:1-17`). Views: `Overview`, `DailyPoint`, `ModelRow` (cross-provider name merge, `mixedRate`), `WorkspaceRow`, `SessionRow`, heatmap (`$REF/lib/types/view.d.ts:1-87`).

### C.5 Budget notification rules

`BUDGET_TIERS=[0.5,0.8,1]`; `pct = spent/monthly`; `tier = count(t <= pct)` (0–3); `level = tier===3?'over':tier===2?'warn':'ok'`; `shouldNotify = tier > Number(notified[monthKey] ?? 0) && tier > 0 ? tier : null`; disabled or `monthly <= 0` → no notice. After notifying, the client persists `budgetNotified[monthKey] = String(tier)`, so each tier fires once per month (`$REF/lib/types/budget.d.ts:1-15`; client bundle offsets ~5576-5717). Progress bar: amber at ≥80%, red over budget.

### C.6 Backfill / estimate marking

`backfilled = event.time < installAt` (install snapshot time) (`$REF/lib/types/fold.d.ts:1-29`; offset ~426405); such rows are estimated from the install catalog and disclosed via the settings banner, estimate badges, and methodology note. Unpriced model/FX: `priced=false`, `costCny=0`, never a guessed 0; UI shows `—` and a warning (`$REF/lib/types/pricing/cost.d.ts:1-29`; `$REF/README.md:25-27`). Startup rebuild re-folds sessions whose change stamp moved; `repricing()` re-prices only unpriced rows at the current table.

### C.7 Built-in catalog (per 1M tokens; `$REF/lib/index.js` offset 438761)

| key | input | cacheRead | cacheWrite | output | currency |
|---|---|---|---|---|---|
| `deepseek/deepseek-flash` | 2 | 0.04 | 2 | 8 | CNY |
| `deepseek/deepseek-v4-pro` | 9 | 0.3 | 9 | 27 | CNY |
| `deepseek/deepseek-v4-flash` | 2 | 0.04 | 2 | 8 | CNY |
| `openai/gpt-4o-mini` | 0.15 | 0.075 | 0.15 | 0.6 | USD |
| `openai/gpt-4o` | 2.5 | 1.25 | 2.5 | 10 | USD |
| `anthropic/claude-sonnet-4` | 3 | 0.3 | 3.75 | 15 | USD |

### C.8 Remote surface (namespace `usageBilling`, all unary/direct)

`overview` / `daily` / `byModel` / `byWorkspace` `(rangeKind, includeSubagents)`, `pricing()`, `setCustomPrice(entry)`, `removeCustomPrice(key)`, `refreshPricing(force)`, `setAlias(input)`, `aliasList()`, `repricing()`, `status()` (`$REF/lib/types/remote-methods.d.ts:8-51`; host marks `$REF/lib/index.js:18340-18354`; client builder `$REF/lib/types/client/core/remote.d.ts:1-130`).

## Open points

- SQLite backend untested (row-store claims from `docs/subsystems/storage.md:47`); the strict-identity-codec mount is proven by source reading, not a live mount.
