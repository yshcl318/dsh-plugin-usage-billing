# Tests

Both suites run against the real bundle files in `../bundle/dsh-plugin-usage-billing`.

```
node tests/host.test.mjs      # host service: pricing, ledger, budget, persistence
node tests/client.test.mjs    # client factory: slots, remote contract parity
```

`node_modules/@deepseek-ai/dsh-typert-protocol` is a **test-only stub** (a Cordis-like
`Service` base) so the Host service module can be imported outside the running
Harness. It is not part of the bundle and is never installed; the running Host
resolves the real protocol package from the DSH installation/profile.

`node_modules/@deepseek-ai/dsh-storage-domain` is not needed by the tests because the
domain spec duck-types its schema contract (the facility only calls `.parse()` and
`.safeParse()`).
