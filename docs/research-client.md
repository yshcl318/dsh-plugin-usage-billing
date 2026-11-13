# Client slots & UI integration — DSH 0.2.2-rc.2

Prefixes used below:
- `AI` = `C:\Users\Hp\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai`
- `REF` = `D:\deepseek-harness\ref\usage-billing-1.3.1\package\lib\client.js` (minified, byte offsets)

## 0. Two loading routes

| Route | Artifact | Can `require()`? | Registration API |
|---|---|---|---|
| Installed bundle (`dsh.client`) | package `./client` export, served as `/plugins/<pkg>/client.js` | Yes — `factory(require)` | full cordis `ctx` |
| Dynamic Cordis package (`cordis_run`) | plain async-function source | **No**; `require/fetch/setTimeout` are teaching traps (`AI/dsh-cordis-client-runner/src/client/evaluator.ts:43-52`) | guard façade: only declared services + `ctx.effect/on/provide/timer` (`.../guard.ts:22-25,194-239`) |

A hand-written `client.js` loaded through `window.__ModuleLoader__.load` is route 1. Route 2 halves receive only the symbols `React`, `console`, `styles`, `host` (`AI/dsh-cordis-client-runner/README.md:32`).

## 1. Installed-bundle module contract

`package.json.dsh.client` fields (`AI/dsh-package-manifest/src/types.ts:86-100`): `platform` (required, `'web'` selected), `inject` (informational package-name deps, *not* cordis services), `immediately`, `external` (module-table requests beyond baseline, may name subpaths). `exports["./client"]` must exist or boot fails: `client-modules: <pkg> declares dsh.client but exports no "./client" bundle` (`AI/dsh-client-modules/src/index.ts:905-908`; path resolution `:203-213`; served path `${id}/client.js` `:273,461-493`).

The bundle body must call once:

```js
window.__ModuleLoader__.load({ id: '<package name>', factory: (require) => { /* ... */ return moduleExports } })
```

`id` is the registration key and must equal the graph row (`AI/dsh-client-modules/src/client/manifest.ts:362-374`, `:409-414`). The factory runs once at materialization; every body side effect (including CSS injection) belongs inside it (`manifest.ts:9-24`). Returned exports are the Cordis plugin object: `{ name, inject: string[], apply(ctx) }` — the same shape the shipped packages compile to (e.g. `AI/dsh-client-ui-sidebar/src/client/index.ts:48,53`; REF offset 1161390-1161874).

**What `require(spec)` resolves** (`manifest.ts:18-24`): seed word → shell instance; memoized module; graph row (materializes recursively); registered factory; else loud `client-modules: require("…") missed the module table …` (`AI/dsh-client-modules/src/client/system.ts:336`). Exact platform seed words (`AI/dsh-web-frontend/dist/assets/index-ghOpC9uV.js`, minified, offset ≈1060256):

`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `zod`, `@tanstack/react-virtual`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`.

Any other installed client entry (package name) is reachable as a graph row; non-baseline requests must be declared in `dsh.client.external` and must name a package row, never yourself (`client-modules/src/index.ts:543-572`). The old 1.3.1 bundle only required `react`, `react-dom`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives` (REF offsets 883-985); its package manifest declared `dsh.client.inject: ['@deepseek-ai/dsh-client-ui-renderer']` (`ref/usage-billing-1.3.1/package/package.json`).

## 2. Slot registry API (`ctx.slots`)

Service `SlotRegistry` (`AI/dsh-client-ui-renderer/src/client/registry.ts:120`).

- `inject(key, callback)` (`registry.ts:194-271`): runs `callback` when the slot *declaration* exists (immediately if already declared, else inside the declaring `register()`), re-runs after HMR re-declaration, and disposes on collapse/plugin unload. Callback returns a disposer or an iterable of disposers (`SlotInjectionEffect`, `registry.ts:116-117`). Always use this for contribution registration, never bare `register`.
- `register(options, component)` (`registry.ts:84-100` erases the option set): universal `name`; list kinds require `id`; keyed kinds require `key`; optional `order`, `label: string | (() => string)` (thunk re-read on every projection, so locale changes need no re-register), `locale` (declared dictionary namespace → renderer synthesizes the `t` prop), `inject` (prop factory, see below), `store` (exclusive store factory → `useStore`/`actions` props), `children` (only when *declaring* sub-slots). The disposer is fiber-owned; the registration is validated at load time.
- Read/inspect: `entries(key)`, `entriesOfSlot(key)` (shadowing winners), `spec(key)`, `subscribe(key, fn)`, `getVersion(key)`, `onEntryError(fn)` (`registry.ts:403-464`).
- Never register into `root` — a second single-slot entry shadows AppFrame and removes every seat (`registry.ts:28-45`).

**Component props** for every entry, in precedence order (`AI/dsh-client-ui-renderer/src/client/scoped-slots.tsx:644-672,689`): standard kit → registration `inject()` result → slot-level inject → owner props (owner wins). Details:
- `inject` is called with positional args `[sessionId?]` (`scoped-slots.tsx:172-185`); keys `hooks: {name: HostObservable}` become `use<Name>` props (`:188-207`).
- `t` exists only if `locale` was declared (`scoped-slots.tsx:604-613`); missing locale plugin throws `SlotAssemblyError`.
- `useStore`/`actions` only with `store` (`:614-623`); `renderSlot` only when the entry declared `children` (`:624-625`), `renderSlotChain` only for a declared chain child (`:626-630`).
- Standard props (root-scoped slots, from the generated catalog `AI/dsh-cordis-client-runner/src/client/slot-catalog.ts`, e.g. `:4349-4360`): `useRemoteAccess(action)`, `useResource`, `useContextMenu`, `useWorkspaces`, `usePanelInfo`, `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess`, `useWorkspaceAccess`. Session-scoped slots add `sessionId`, `useSession`, `useInput`, `inputActions`, `useConversation`, `useChat`, `useProjection`, `useAccess`, `useTrajectory` (`slot-catalog.ts:958-978`).
- `renderSlot(key, ownerProps, opts)` opts: `{ only }` (list/keyed id cell), `{ entryKey }` (keyed cell), `{ fallback }`, `{ hookContext }`; see `AI/dsh-client-ui-sidebar/src/client/PanelIcon.tsx:11`, `AppFrame.tsx:49`, `settings-general/client/SettingsRoot.tsx:92-94`.

**Errors**: each entry is wrapped in a boundary; a render/inject crash logs `console.error("slot entry crashed in '<slot>':", error)` and renders `<div data-slot-error="<slot>">` (`scoped-slots.tsx:432-469`), a factory occurrence logs `slot factory occurrence crashed in '<factory>'` (`:471-489`). For every non-chain kind the crash **abdicates (retires) the entry**, so it disappears until re-registered (`:1391`); a keyed cell with all entries crashed keeps the crash face (`:1433-1449`). Assembly errors (missing provider) rethrow instead of degrading (`:432-436`). A chain selector throw is logged and treated as declined (`:1463-1472`).

## 3. `sidebar.panellist` → `main` click flow (exact)

1. Declared by factory `sidebar.panel.icon` with child list `sidebar.panellist` (`AI/dsh-client-ui-sidebar/src/client/index.ts:88-92`; contract `.../client/contract/slots.ts:20-28,47`). A decorator's `sidebar.panel.icon` component just re-renders the list filtered by id: `renderSlot('sidebar.panellist', { size, active }, { only: id })` (`PanelIcon.tsx:10-12`).
2. Plugin registers a list entry with `id` (+ `order`, `label`). Sidebar projects registrations into panel metadata: `resolveSlotLabel(options.label) ?? id`, sorted by `order`, resynced on slot change and `ctx.locale.subscribe` (`sidebar/src/client/index.ts:56-71`).
3. Sidebar renders its **own** row per panel: `<button aria-label={label} aria-current={active?'page':undefined} onClick={() => selectPanel(id)}>`, whose only plugin-owned content is the glyph span — `renderFactorySlot('sidebar.panel.icon', { id, size: wide ? 16 : 18, active })` (`SidebarRoot.tsx:58-114`, glyph at `:91-93`; title text at `:94-98` is sidebar-owned).
4. `selectPanel` is `ctx.layout.selectPanel(id)` (`sidebar/src/client/index.ts:78-87,83`). `LayoutController.selectPanel` throws if the main key is not registered, then writes the root store: `layout.selectPanel: main panel "<id>" is not registered` (`AI/dsh-client-ui-layout/src/client/service.ts:28-54,71-78`).
5. `AppFrame`'s `MainPanel` subscribes to selection and renders the keyed cell: `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })` (`AI/dsh-client-ui-layout/src/client/AppFrame.tsx:45-51,278-280`). `main` is `kind: 'keyed'`, reserved key `conversation` (`layout/src/client/index.ts:71-75`; catalog `:2667-2705`).
6. Programmatic open: `ctx.layout.selectPanel('my-panel')`; back to Conversation `selectPanel(null)`.

**Answers**: an entry can render **only an icon node** (16 px wide / 18 px rail) — no card, no sizes other than `{ size, active }` owner props (`contract/slots.ts:92-97`). Row label is `options.label`; clicking is owned by the sidebar. A rich entry needs `main` (full panel), `conversation.composer.dock`, or `shell.overlay`. The `id` *is* the main panel key, so register both with the same string or the click throws (step 4). Entries can be unpinned into the “More” menu when `sidebar.panellist.actions` has registrations (`SidebarRoot.tsx:410-444`).

## 4. Target slot matrix

All registration options are documented (per slot) in the generated catalog `AI/dsh-cordis-client-runner/src/client/slot-catalog.ts`; only per-slot additions listed here.

| Slot | Kind/scope | Options | Component gets | Notes |
|---|---|---|---|---|
| `sidebar.panellist` | list, root (`:4320-4371`) | `id` req; `order`, `label` | `{size, active}` + standard + `t` if `locale` | icon only; id = main key; `replaceRisk: none` |
| `main` | keyed, root (`:2667-2705`) | `key` req | standard + `t` | reserved `conversation`; replaces same-key occupant (`shadows-shipped-ui`) |
| `conversation.composer.dock` | list, session (`:931-989`) | `id` req; `order`, `label` | session standard set (incl. `sessionId`) + `t` | rendered under composer card only when composer variant + input + session exist (`conversation/client/skeleton/InputBar.tsx:596-601`); fixed overlays **must** portal to `document.body` |
| `settings.section` | list, root (`:3803-3857`) | `id` req; `order`, `label` | `{ close: () => void }` + standard + `t` | one page per entry; only the active section is mounted (`SettingsRoot.tsx:108-110`) |
| `settings.section.icon` | list, root (`:3860-3908`) | `id` must equal target section id | `{size, active}` + standard | optional nav glyph; shell keeps default glyph otherwise (`SettingsRoot.tsx:91-95`) |
| `settings.general.item` | list, root (`:3405-3467`) | `id`, `order` | no owner props | single preference row inside General; nothing projects `label` |
| `shell.overlay` | list, root (`:4009-4076`) | `id`, `order`, `label` | standard + `t` | frame-wide layer, `z-index: 20`, `pointer-events: none` on the layer and `auto` on each direct child (`AI/dsh-client-ui-layout/src/client/AppFrame.module.css:363-371`); additive |
| `sidebar.footer.action` | list, root (`:4267-4317`) | `id`, `order`, `label` | `{ wide: boolean }` + standard | sits above Settings (`SidebarRoot.tsx:461-468`) |
| `sidebar.settings`, `sidebar`, `root`, `rightbar`, `shell.bottom`, `shell.leading` | single | — | owner props | replacing shipped columns is destructive; avoid |

Registration snippet (installed bundle, works as plain JS):

```js
apply(ctx) {
  const t = ctx.locale.bind('myNs')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: 'my-panel', order: 100, label: () => t('nav') },
    function PanelIcon({ size, active }) {                    // props: size, active
      return React.createElement('svg', { width: size, height: size, viewBox: '0 0 16 16',
        fill: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' })
    }))
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'my-panel', locale: 'myNs' },        // same string as the sidebar id
    function Page(props) { return React.createElement('div', null, props.t('title')) }))
}
```

For a session slot the props include `sessionId`; register with `{ name: 'conversation.composer.dock', id: 'my-dock', order: 10 }` and use `props.sessionId`:

```js
ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
  { name: 'conversation.composer.dock', id: 'my-dock', order: 10, locale: 'myNs' },
  function Dock({ sessionId, t }) { /* ... */ }))
```

Settings page:

```js
ctx.slots.inject('settings.section', () => ctx.slots.register(
  { name: 'settings.section', id: 'my-settings', order: 40, label: () => t('nav'), locale: 'myNs',
    inject: () => ({ prefs: ctx.configForms.get('my-plugin-entry') }) },
  function Section({ close, prefs, t }) { /* prefs.getSnapshot()/subscribe/set */ }))
```

Shell overlay (toast/dialog container; the layer is click-through, each direct child re-enables pointer events):

```js
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'my-toast', locale: 'myNs' }, function Toast({ t }) { /* return null when idle */ }))
```

## 5. Settings persistence, locale, theme

- **Host-backed settings** (durable): `ctx.configForms.get<T>(entryId)` returns a `ConfigForm` with `getSnapshot()`, `subscribe(fn)`, `set(field, value): Promise<boolean>`, `unset(field)`, `mutate(ops, expectedRevision?)` (`AI/dsh-client-ui-settings/src/client/config-form.ts:280-293`; types `config-form-types.ts:8-74`). Snapshot = `{ status: 'loading'|'ready'|'unavailable', value, base, user, revision, writable }` (`:8-31`). `entryId` is the Host plugin *entry/settings namespace*; values are validated against the Host-side namespace schema and written over `remote.settings` (fenced by `revision`). The client plugin must declare `'configForms'` in its cordis `inject` (e.g. `AI/dsh-client-ui-theme/src/client/index.ts:595`) and a Host half must own the namespace.
- **UI-local prefs**: `localStorage` is used for ephemeral view state (e.g. `AI/dsh-client-ui-conversation/src/client/stores.ts:45-47`, `AI/dsh-client-ui-schedule/src/client/recent-time-zones.ts:17-40`) — not for user-facing settings that must survive other browsers/profiles.
- **Locale**: `ctx.locale.register(ns, dicts | (ns, locale, dict))`, `bind(ns) => t`, `getLocale()`, `subscribe(fn)`, `setLocale`, `addLanguage` (`AI/dsh-cordis-client-runner/src/client/api-catalog.ts:119-178`; impl `AI/dsh-client-locale/src/client/index.ts:75-125,403-460`). Typed registration requires both baseline locales `zh` and `en` (`locale/src/client/index.ts:118-125`); snapshot `{ active, locales, revision }` (`:74-82`); `locale/change` event (`:84-98`). Passing `locale: '<ns>'` in a register call gives the component `t`; the shipped sidebar re-reads labels on locale change via `ctx.locale.subscribe` (`AI/dsh-client-ui-sidebar/src/client/index.ts:70-71`).
- **Theme**: `ctx.theme.getTheme()`, `setTheme(id)`, `setFontSize(role, px)`, `register(definition)`, `overrideTokens(source, tokens)` (`api-catalog.ts:262-294`; impl `AI/dsh-client-ui-theme/src/client/index.ts`). Snapshot `ThemeSnapshot { preference, fontSizes, fontFamilies, active, themes, revision }` (`theme/src/client/index.ts:100-117`).

## 6. Services available to a dynamic Client half

`SERVICE_API` in `api-catalog.ts`: `layout` (`:85-117`), `locale` (`:119-179`), `sessions` (`:181+`), `slots` (`:237-260`), `theme` (`:262-294`), `timer` (`:297-331`), `uiWorkspace` (`:334-397`), `workspaces` (`:398+`). `layout`: `selectPanel(id|null)` (throws if unregistered), `beginNavigation()`, `toggleSidebar()`, `openRightbar(track, fullscreen)`, `closeRightbar()`. `uiWorkspace`: `openSession`, `openWorkspace`, `forkSession`, `connectWorkspace`, `startSession`. Access is only via services the returned plugin declared in `inject` (`guard.ts:194-239`); undeclared → teaching error; `slots.register` gets automatic page-local shadowing priority and is ledgered (`guard.ts:92-143`); `theme.overrideTokens` source is forced to the package id (`guard.ts:154-184`). `host.call(method, args)` reaches the host half with JSON only (`dsh-cordis-client-runner/README.md:76`).

## 7. Theme tokens (exact names) and styling

Curated inspectable tokens (`AI/dsh-client-ui-theme/src/client/index.ts:153-168`), all `{ light, dark }` pairs:

| Purpose | Variable |
|---|---|
| App background | `--dsw-alias-bg-base` |
| Raised card / nested card | `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2` |
| Overlay/popover background | `--dsw-alias-bg-overlay` |
| Subtle / stronger border | `--dsw-alias-border-l1`, `--dsw-alias-border-l2` |
| Primary / secondary text | `--dsw-alias-label-primary`, `--dsw-alias-label-secondary` |
| Accent | `--dsw-alias-brand-primary` |
| Success / warning / danger | `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`, `--dsw-alias-state-error-primary` |
| Idle / sidebar fill | `--dsw-alias-state-idle-primary`, `--dsw-specific-sidebar-fill` |

The fuller alias palette (264 tokens, definitions begin at `AI/dsh-client-ui-theme/src/styles/design-platform.css:177`, dark overrides later in the file) adds `--dsw-alias-bg-layer-3`, `--dsw-alias-border-l3/l4`, `--dsw-alias-label-tertiary/dimmed`, `--dsw-alias-card-fill(+hover)`, `--dsw-alias-interactive-bg-hover`, `--dsw-alias-button-primary-fill/hover`, `--dsw-alias-link`, `--dsw-alias-state-business-primary`, `--dsw-alias-state-*-secondary/tertiary`, `--dsw-alias-bg-mask-1/2/3`, `--dsw-alias-toast-bg/label/action`, `--dsw-alias-scrollbar-*`. Radii `--dsw-radius-*`; `--dsw-elevation-panel/prominent`; `--dsw-focus-ring-width/color` (`.../styles/base.css`, `focus.css`). Use `var(--dsw-*)` only — alias layers are what themes override.

Styles: installed bundles inject their own `<style>` inside the factory; the module system tags untagged style elements created during materialization with `data-plugin`, and HMR removes them (`AI/dsh-client-modules/src/client/system.ts:66-86`). Use a unique class prefix. Dynamic halves get `styles.insert(css)` which returns a disposer and is auto-removed on unload (`AI/dsh-cordis-client-runner/src/client/evaluator.ts:77-112`).

## 8. Popover / Esc recipe

There is no generic popover slot primitive exported from a shipped package; the shipped pattern (copy it) is: state in the component, panel rendered with `createPortal(..., document.body)` so composer/sidebar overflow cannot crop it, `useDismissOnOutsidePointer(rootRef, open, onClose, panelRef)` plus a document `keydown` Escape listener and a capture-phase outside-click listener (`AI/dsh-client-ui-chat/src/client/chat/stat-dialog.ts:17-55`; portal shell `AI/dsh-client-ui-schedule/src/client/PickerPopover.tsx:36-57`). Give the trigger `aria-haspopup`, the panel `role="dialog"`/`aria-label`, and close on Escape yourself. Modal-style layers use `useModalLayer(elementRef, active, onClose)` (Escape + focus containment; used by Settings `SettingsRoot.tsx:64` and the sidebar drawer `SidebarRoot.tsx:219`). Settings sections need no Escape handling — the shell owns the panel and `close` prop. Note `useModalLayer`/`useDismissOnOutsidePointer` come from `@deepseek-ai/dsh-client-ui-primitives` (seed word, source not shipped — contract verified only by shipped call sites).

## 9. Crash modes — do / don't

- **Do** register through `ctx.slots.inject`; **don't** call `register` in the factory body (effect lifetime belongs to `apply`).
- **Do** register both `main.key` and `sidebar.panellist.id` with one string; **don't** register only the list entry — clicking then throws uncaught from the click handler (`layout/service.ts:72-75`).
- **Don't** reuse shipped ids/keys unless replacing intentionally: list cells reuse = replace that cell (`slot-catalog.ts:4330`), `main` key reuse replaces the occupant (`:2677`), `conversation` is reserved.
- **Don't** register `root`, `sidebar`, `rightbar`, `shell.bottom`, `shell.leading`, or `settings.*` seats you don't own — single slots shadow shipped UI.
- **Do** keep state outside components for panels/docks: your `main` panel unmounts when another panel is selected (dispatch at `AppFrame.tsx:49`); use a registration `store` (`defineStore` from `@deepseek-ai/dsh-client-store`, read via `props.useStore`) or a plugin-level store.
- **Do** portal fixed positioned overlays to `document.body` inside `conversation.composer.dock` (inherited from a docked, contained composer; `AI/dsh-client-ui-conversation/src/client/contract/slots.ts:301-315`).
- **Don't** throw during render/inject: the entry is abdicated (retired) and only a fresh `register` shows it again; crash text is `slot entry crashed in '<slot>':` in console (`scoped-slots.tsx:458-460,1391`).
- **Don't** declare `children` unless you really declare new slots; it is the only way to receive a `renderSlot` prop (fine to add your own child slot inside your `main` panel).
- A page refresh reloads installed bundles but not dynamic packages (`dsh-cordis-client-runner/README.md:40`).

## 10. Reference 1.3.1 bundle behaviour (old API surface)

`REF` exported `name='@zzerx/dsh-plugin-usage-billing/client'`, `inject=['slots','remote','configForms']` (offset ≈1161390). It registered: `sidebar.footer.action` (id `zzerx-usage-billing`, order 10), `conversation.composer.dock` (id `…-composer`, order 10, inject receives `sessionId`), `settings.section` (id `zzerx-usage-billing`, order 40), each wrapped in `ctx.slots.inject(name, () => ctx.slots.register(...))` (offsets ≈1161460-1161970). It did **not** use `sidebar.panellist`, `main`, `shell.overlay`, or `selectPanel`; its entry point was the sidebar footer action + composer pill. Data came from `ctx.remote.$mount(...)`/`ctx.remote.usageBilling` and `ctx.configForms.get('usage-billing-zzerx').getSnapshot().value`; styles were injected `<style data-plugin data-plugin-css>` tags with `--dsw-alias-*` variables (25+ distinct). For 0.2.2-rc.2 the panellist→main pattern above is the supported navigation route; footer action and composer dock still exist with the same props documented in §4.

## 11. Unverified / limitations

- `cordis_inspect_query` Client providers (`Slots.listSubTree`, `Builtin.listBuiltins`, `Theme.listTokens`, `Service.listService`) timed out in this session (no live page answered) — slot facts were therefore taken from the generated catalog and shipped sources, which agree, but live-registry confirmation on the running page is pending.
- `@deepseek-ai/dsh-client-ui-slots` and `@deepseek-ai/dsh-client-ui-primitives` have **no shipped package sources** in this installation (renderer imports them as external; primitives is a web-shell seed). Their APIs are cited through shipped call sites and the generated catalogs, not their own source.
- Source citations for minified artifacts (`AI/dsh-web-frontend/dist/assets/index-ghOpC9uV.js`, `REF`) are byte offsets, not line numbers (single-line minified files).
- `dsh.client.inject` is documented as informational package dependencies (`package-manifest/src/types.ts:90-91`); whether the loader uses it for arrival ordering is only evidenced by `BootModuleRow.inject` doc (`client-modules/src/client/manifest.ts:119-123`) — no shipped composition test was executed.
