# Build

There is no transpile step: `index.js`, `host/*.js` and `client.js` are the shipped
artifacts.

- Host half: plain Node ESM. `index.js` imports only its own `host/*.js` modules and
  the platform-shipped `@deepseek-ai/dsh-typert-protocol` (declared as a peer).
- Client half: plain browser script. It registers exactly one module with
  `window.__ModuleLoader__.load({ id, factory })` and inside the factory only
  `require('react')`; no client package imports, no JSX transform, no CDN.
- `cordis.patch.yml` inserts the Host row; `dsh.bundle.patch` and `dsh.client` in
  `package.json` are the bundle manifest.

Packing (`pnpm pack`) yields `client.js`, `host/`, `index.js`, `cordis.patch.yml`,
`locale/*.json`, `icon.svg`, `docs/` and `README.md`; the test harness at the
workspace root is not packed (`files`).
