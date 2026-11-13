# Session usage data and host event APIs - verified research

Scope: DSH `0.2.2-rc.2`, installed app.asar checkout, real logs under `C:\Users\Hp\.dsh\sessions`.
Method: the `read` tool reads paths inside app.asar (shipped `src/*.ts` is present); `grep` cannot search asar, so claims below were verified by reading exact files. Real session logs are **Zstandard concatenated-frame** files (see Section 1.1); they were decoded with Python 3.14 `compression.zstd` frame-by-frame (81 frames / 131 lines in one file), matching `zstd.ts:2-3` ("owns a concatenated-frame container").

Shorthand used in citations:

- `$INSTALL` = `D:\Users\Hp\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh`
- `$PKG/<pkg>/src/<file>:<line>` = `$INSTALL\node_modules\@deepseek-ai\<pkg>\src\<file>`

## 0. TL;DR

- **Durable usage lives on the `assistant/message` session event**, in `data.usage` (`TokenUsage`): `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, optional `reasoningTokens`. There is no separate usage event (`$PKG/dsh-session/src/types.ts:339-357`, `$PKG/dsh-llm/src/types.ts:174-196`).
- **Cache-hit tokens are present** as `data.usage.cacheReadTokens`; counts are disjoint (billed input = input + cacheRead + cacheWrite), and `totalTokens` = sum of all four. Verified on 368 real events.
- **Live hook**: `ctx.on('session/event', (session, event) => ...)` - post-commit, fire-and-forget, and it fires for subagent sessions for host-level listeners (`$PKG/dsh-session/src/index.ts:66-79`). Replayed/seed events do **not** fire it, so a startup backfill is mandatory (`$PKG/dsh-session/src/index.ts:584-596`).
- **Backfill**: `ctx.sessionQuery.listSessions()` then `ctx.sessionQuery.readSession(id)` (`$PKG/dsh-session-query/src/index.ts:181-210`). `ctx.sessionPersistence.list()/open()/handle.read(offset)` is the lower-level alternative (`$PKG/dsh-session-persistence/src/index.ts:205-210`, `$PKG/dsh-session-persistence/src/handle.ts:73-83`). Mount it asynchronously via `ctx.inject([...], cb)` plus a fire-and-forget task; never `await` it inside plugin apply (Section 4).
- **Timestamps are Unix epoch milliseconds** (`event.time`, `header.createdAt`); no Beijing-specific helper exists - use IANA `Asia/Shanghai` via `Intl`/Temporal (Section 5).

## 1. Real durable data

### 1.1 Directory / file layout (verified on disk)

```
C:\Users\Hp\.dsh\sessions\
  --D-deepseek-harness--\                              <- one dir per project cwd
    session-2c5c7922-<uuid>\session.v4.jsonl.zstd      <- top-level session
    12d59631-b0a2-472c-a0a0-93ec1daaafcb\session.v4.jsonl.zstd   <- subagent session
  --C-Users-Hp-Documents-deepseek-harness-default-workspace--\
    session-cfe48c2e-<uuid>\session.v4.jsonl.zstd
```

- Root is configured by plugin `session-persistence-jsonl` as `root: !!js dshHomePath('sessions')` (`$INSTALL/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:138-141`); the config schema requires `root` (`$PKG/dsh-session-persistence-jsonl/src/index.ts:1810-1812`).
- Project dir = `--${slug}--`, built by `projectKey(cwd)` (separators and `:` become `-`, unsafe code units `~XXXX`, 251-char cap; `$PKG/dsh-session-persistence-jsonl/src/format.ts:216-245`).
- Session dir = `projectDir(root, cwd)` + `encodeSegment(id)` (`format.ts:247-269`); a session with no `cwd` goes under `_no-cwd` (`format.ts:247-257`).
- File name = generation filename + compression suffix: `session.v4.jsonl.zstd` (`$PKG/dsh-session-format/src/filename.ts:7-17`; `format.ts:37-60`). Default compression is `zstd` (`$PKG/dsh-session-persistence-jsonl/src/index.ts:69`).
- Each file is a **concatenated-frame** container, not one frame; the backend scans frame ranges explicitly (`$PKG/dsh-session-persistence-jsonl/src/zstd.ts:2-3,25-48`). A naive single `zstd.decompress` returned only the first frame in our test; implementations must loop frames.
- Writing is append-only; torn tails are truncated before the next append (`$PKG/dsh-session-persistence/src/index.ts:124-143`).

Observed inventory (2026-11-13): 8 session files, 8 headers, 369 `assistant/message` events, newest file 1.3 MB compressed / 1 595 events.

### 1.2 Header (first JSONL line) - real sample

```json
{"type":"session","version":4,"id":"12d59631-b0a2-472c-a0a0-93ec1daaafcb","createdAt":1794547393575,"cwd":"D:\\deepseek-harness","parentSession":"session-2c5c7922-ca0c-4de3-abac-797a81602902","isSeeded":false,"origin":"subagent","delegationDepth":1,"agentPreset":"cordis"}
```

Field semantics (`$PKG/dsh-session/src/types.ts:95-136`; physical shape `format.ts:83-98`):

| field | meaning |
|---|---|
| `version` | always `4` for current files (`SESSION_FORMAT_VERSION`, `types.ts:62-90`) |
| `id` | session id, mirrors the directory name |
| `createdAt` | **epoch milliseconds** (`types.ts:103-104`) |
| `cwd` | absolute working directory, optional (`types.ts:105-106`) |
| `parentSession` | direct creator of a subagent session; historical ordinary forks may also retain it (`types.ts:107-112`) |
| `isSeeded` | contains a fork-inherited event prefix (`types.ts:113-118`) |
| `origin` | `'subagent'` marker (`types.ts:119-122`) |
| `delegationDepth` | absent/0 top-level, parent + 1 for children (`types.ts:123-128`) |
| `agentPreset` | agent preset id (`types.ts:129-135`) |

The top-level id observed is `session-<uuid>` and the subagent id is a bare `<uuid>`. The store only mints `session-<n>` when an id is omitted (`$PKG/dsh-session/src/index.ts:1199-1200,1240-1241`); the `session-<uuid>` spelling is passed in by the composition layer. Do not infer top-level/subagent from the id string - use `origin`/`parentSession`.

### 1.3 Event envelope

Every following line is one `SessionEvent`: `{ type, seq, time, data }` plus optional `ignorable` and (message events only) `surfaceOp`/`sourceEventSeqs` (`$PKG/dsh-session/src/types.ts:493-529`). `seq` is monotonic per session; `time` is "Unix epoch milliseconds" (`types.ts:509-512`).

`assistant/message` payload (`types.ts:339-357`):

```ts
'assistant/message': {
  turn: number
  step: number
  message: AssistantMessage          // role/content/source/id
  stream: AssistantStreamRecord[]    // exact compacted model stream (can be large)
  usage?: TokenUsage                 // absent when the adapter reported none
  interrupted?: true
}
```

`TokenUsage` (`$PKG/dsh-llm/src/types.ts:174-196`) - canonical, disjoint counts:

```ts
export interface TokenUsage {
  inputTokens: number        // uncached input only
  outputTokens: number
  totalTokens?: number       // aggregate total, may be omitted
  cacheReadTokens?: number   // cache-hit input
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

The adapter stream also carries `{ type: 'usage', usage: TokenUsage }` before the terminal `finish` chunk (`$PKG/dsh-llm/src/types.ts:488-508`); the agent loop stores the settled usage on the event: `...live.usage === undefined ? {} : { usage: live.usage }` (`$PKG/dsh-agent-loop/src/agent.ts:580-589`; interrupted path `505-531`).

### 1.4 Real `assistant/message` sample (user text redacted, stream elided)

```json
{"type":"assistant/message","seq":20,"time":1794547395565,"data":{"turn":1,"step":1,
 "message":{"role":"assistant","content":[
   {"type":"reasoning","text":"<redacted>"},
   {"type":"tool-call","id":"call_00_nWc2ydM5DKBH2O0YeNpN8780","name":"team_task_get","arguments":"{\"task_id\": \"task-3\"}"}],
  "source":{"kind":"model","provider":"deepseek-account","model":"deepseek-flash",
   "replayState":{"response":{"kind":"deepseek-messages","version":1,"model":"deepseek-flash"},
                  "blocks":[{"type":"reasoning","signature":"<uuid>"},{"type":"tool-call"}]}},
  "id":"dc1f662e-f114-473a-bb5d-9318e9e82757"},
 "usage":{"inputTokens":1896,"outputTokens":51,"cacheReadTokens":18816,
          "cacheWriteTokens":0,"totalTokens":20763}
 }}
```

`stream` (the exact timed delta chunks) is a real, usually non-empty array (8 records in this event, hundreds of bytes to tens of KB). Do not deep-clone events while scanning; read only the fields you need.

### 1.5 Empirical usage coverage and edge cases

Across all 8 real logs (scan taken while sessions were live; counts grow):

- 369 `assistant/message`; **368 carry `usage`**, one does not.
- All 5 fields were present on all 368 usage objects: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`. `reasoningTokens` was **never** present (optional in the type; this DeepSeek adapter did not report it).
- Aggregates: input 921 797, output 257 792, cacheRead 44 789 504, cacheWrite 0, total 45 969 093; input+output+cacheRead+cacheWrite == totalTokens exactly.
- The single usage-less event is a cancelled mid-stream message: `{"turn":7,"step":1,...,"interrupted":true,"stream":[...]}` with only a `block-start` chunk. `usage` is genuinely optional and must be tolerated (`$PKG/dsh-session/src/types.ts:340-347`).
- `assistant/attempt` events (failed/rejected attempts) store only `stream`, no `usage` field (`types.ts:358-363`; append sites `$PKG/dsh-agent-loop/src/agent.ts:527-536,550-553`). The embedded stream may contain a usage chunk, but recovering it is unverified (0 attempts exist in the real logs).

### 1.6 Provider / model / effort

- Per-message exact route: `data.message.source = { kind:'model', provider, model, replayState? }` (`$PKG/dsh-llm/src/message.ts:9-26`; real sample above).
- Per-request config snapshot: `request/header` event `{ header: { config: { provider, model, reasoningEffort, maxTokens }, adapterDefaults?, tools? }, reason }` (`$PKG/dsh-session/src/types.ts:246-257,394-403`). Real trimmed config: `{"provider":"deepseek-account","model":"deepseek-flash","reasoningEffort":"max","maxTokens":256000}`.
- Route metadata: `request/context` = `{ provider, model, contextWindow?, systemPromptUpdate? }` (`types.ts:259-269`); real: `{"provider":"deepseek-account","model":"deepseek-flash","contextWindow":1048576,"systemPromptUpdate":"in-history"}`.
- Profile config confirms the default route: `agent-default-model` -> provider `deepseek-account`, model `deepseek-flash`, reasoningEffort `max` (`C:\Users\Hp\.dsh\profiles\desktop\cordis.patch.yml:23-28`).

## 2. Identifying subagent sessions (`includeSubagents`)

Use the header, not the id string: `origin === 'subagent'`, plus `parentSession` and numeric `delegationDepth` (`types.ts:107-128`). Real subagent headers carry all three (`origin:"subagent"`, `parentSession:"session-2c5c7922-..."`, `delegationDepth:1`); top-level headers omit them and have `delegationDepth:0`.

Real evidence that host-level listeners see subagent sessions: the host-mounted title plugin writes `session/title` into subagent logs at seq 15 (e.g. `--D-deepseek-harness--\12d59631-...\session.v4.jsonl.zstd`):

```json
{"type":"session/title","seq":15,"time":1794547393897,"data":{"title":"<redacted>","messageSeqs":[9],"source":{"kind":"fallback"}}}
```

That plugin subscribes with `ctx.on('session/event', (session, event) => ...)` (`$PKG/dsh-session-title/src/index.ts:348-349`) and is mounted at the base/profile level, so a top-level plugin listener receives every session, including subagents.

Additional subagent metadata events appear in child logs (`subagent/descriptor` with `{version, mode, provider, label, agentProvider, agentModel, agentReasoningEffort}`, plus `subagent/catalog`). These are plugin-merged event types; the owning package was not conclusively traced (flagged in Section 8), so prefer the header fields.

## 3. Live hooks: which one to use

| hook | declaration / shape | for subagents? | verdict |
|---|---|---|---|
| `session/event` | `(this: Scoped<Session>, session: Session, event: SessionEvent): void`, mode `emit`, post-commit, contained observer failures (`$PKG/dsh-session/src/index.ts:66-79`); consumers `$PKG/dsh-session-title/src/index.ts:349`, `$PKG/dsh-api-session-controller/src/index.ts:243-246` | yes for non-agent-scoped listeners (evidence in Section 2; JSDoc says "agent-scoped listeners receive only sessions entered through that agent's context") | **Recommended live source** |
| `llm/stream` waterfall | `(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>` (`$PKG/dsh-llm/src/index.ts:63-76`) | fires for all streaming calls | not primary: no header/cwd, fires for title/translator/one-shot calls, retries re-run the stream |
| `agent/assistant-stream` | live UI frames `{ frame }` (`$PKG/dsh-agent-loop/src/agent.ts:486-493`) | live only | UI only, not durable |
| `session/flush` | `parallel`-mode durability checkpoint (`$PKG/dsh-session/src/index.ts:80-88`) | n/a | not for accounting |

Critical caveat: **seed/replayed events never publish on `session/event`** (`$PKG/dsh-session/src/index.ts:584-596`). A resumed session replays its stored log without emitting, so a live subscriber sees only new appends - exactly why a backfill is required. The event is append-time; for an array append, `session.seq`/`session.surface` already include the whole batch when members publish in order (`index.ts:66-78`). It is a plain `emit` (no waterfall), so listeners cannot veto writes.

## 4. Backfill: services and exact signatures

### 4.1 `ctx.sessionQuery` (preferred; mounted in this deployment)

- Abstract service `SessionQueryEngine`, `super(ctx, 'sessionQuery')`, `static inject = ['sessions']` (`$PKG/dsh-session-query/src/index.ts:85-132`).
- `listSessions(signal?: AbortSignal): Promise<SessionRecord[]>` - complete logical corpus, newest-first, live-preferred (`index.ts:181-188`; records built at `$PKG/dsh-session-query/src/corpus.ts:57-87`). `SessionRecord = { header: SessionHeader, live: boolean, persisted: boolean, formatStatus? }` (`$PKG/dsh-session-query/src/types.ts:26-36`).
- `readSession(sessionId): Promise<SessionLogSnapshot>` - "Read and replay-validate one complete logical session log without making it live"; returns `{ session: SessionHeader, inheritedEventCount, events: SessionEvent[] }` (`index.ts:190-210`; `types.ts:50-58`). It appends synthetic interrupted-turn closers for stale logs (`$PKG/dsh-session-query/src/cold-read.ts:20-56`) - harmless for usage rows.
- Also useful: `filterSessions(filters, signal?)` with `{kind:'cwd'|'parent'|'id'|'availability'|'created-at'}` (`index.ts:212-224`; `types.ts:201-210`), `traceSession(id)` (`index.ts:332-343`), `observeSession`/`inspectSession` (`index.ts:134-157`).
- Backend in this install: `session-query-sqlite` is mounted at base with `path: ':memory:', openAt: never` (`$INSTALL/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:149-161`); exact reads/titles/lineage stay available, only full-text search is disabled (comment lines 149-156). `SqliteSessionQueryEngine extends SessionQueryEngine` (`$PKG/dsh-session-query-sqlite/src/index.ts:203`).
- Without a mounted persistence service, `listSessions` degrades to live sessions only (`corpus.ts:62-66`); handle `SESSION_QUERY_PERSISTENCE_FAILED` / `SESSION_QUERY_CORRUPT_SESSION` per session.

### 4.2 `ctx.sessionPersistence` (lower level, incremental reads)

- Service declared as `sessionPersistence` (`$PKG/dsh-session-persistence/src/index.ts:118-122,144-150`).
- `list(options?: {signal?}): Promise<readonly SessionPersistenceSnapshot[]>` - every stored session visible to this process; snapshot has `header`, `formatStatus?`, `revision`, optional `eventCount`, `sizeBytes`, `location` (`index.ts:47-68,205-210`).
- `open(id, access: 'read'|'write', options?): Promise<SessionHandle>` (`index.ts:161-174`); the handle exposes `header`, `inheritedEventCount`, `access`, and `read(offset?, length?, options?)` where **offset is the first logical event seq** (`$PKG/dsh-session-persistence/src/handle.ts:59-83`). `close()` is idempotent (`handle.ts:111-116`).
- The JSONL backend is registered as `ctx.sessionPersistence` by plugin `session-persistence-jsonl` (`$PKG/dsh-session-persistence-jsonl/src/index.ts:285-338,1807`); its config accepts `root`/`compression` (`index.ts:1810-1812`).

### 4.3 Non-blocking startup pattern (Cordis)

Do not `await` the scan in plugin apply. Precedents in shipped code:

- Optional-service idiom: `ctx.inject(['sessionPersistence'], (childCtx) => { ... })` with a finalizer clearing the binding (`$PKG/dsh-session-query/src/corpus.ts:35-55`); same idiom in `$PKG/dsh-agent-loop/src/index.ts:358`.
- Fire-and-forget background task with `.catch` and `finally` cleanup: `$PKG/dsh-api-session-controller/src/index.ts:253-264` (`void task.finally(...)`).
- Cooperative yielding at a work-slice deadline: `$PKG/dsh-api-session-controller/src/list.ts:145-178`.
- `sessionQuery` already bounds cold-read concurrency (`SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY`, `$PKG/dsh-session-query/src/index.ts:41,114-120`), so a paged `Promise.all` is acceptable; add your own small limit anyway.

Recommended backfill shape:

```ts
ctx.inject(['sessionQuery'], (q) => {           // sync callback; runs when service is ready
  const task = (async () => {
    const records = await q.sessionQuery.listSessions()
    for (const record of records) {
      const snap = await q.sessionQuery.readSession(record.header.id)
      for (const ev of snap.events) {
        if (ev.type !== 'assistant/message' || ev.data.usage === undefined) continue
        if (ev.seq < snap.inheritedEventCount) continue   // fork-owned prefix: count once, in the source session
        await upsert({ sessionId: record.header.id, ...rowOf(snap.session, ev) }) // idempotent by (sessionId, seq)
      }
    }
  })()
  void task.catch((err) => ctx.logger.warn(`usage backfill failed: ${String(err)}`))
})
```

For incremental backfill after the first run, persist a per-session watermark: `handle.read(watermark + 1)` returns from that seq inclusive (`handle.ts:73-83`). Prefer `sessionQuery` for correctness (validation, live-preferred merge); use persistence handles when logs are large, because full `readSession` materializes the whole log including embedded `stream` arrays.

**Fork/seed duplication warning:** a seeded session's log contains the parent's inherited prefix, so summing over all sessions double-counts. Skip events with `seq < inheritedEventCount` (from `readSession` / `SessionHandle.inheritedEventCount`) or stop at the `session/end-seed` marker (`$PKG/dsh-session/src/types.ts:404-435`). No `isSeeded:true` session exists in the observed logs, so this is source-verified but not locally demonstrated.

## 5. Timestamps and time zones

- `SessionEvent.time` and `SessionHeader.createdAt` are **Unix epoch milliseconds**, integers (`$PKG/dsh-session/src/types.ts:103-104,509-512`).
- Verification: `createdAt: 1794547393575` = `2026-11-13T05:23:13.575Z` = 13:23:13.575 +08:00, matching the file mtime 13:23:13 and the observed session start.
- Helpers in `@deepseek-ai/dsh-util-time`: `canonicalClientTimeZone(value)` validates/canonicalizes an IANA zone at a wire boundary (`$PKG/dsh-util-time/src/index.ts:33-45`); `formatFourDigitYearInstant(epoch: number): string | undefined` (`$PKG/dsh-util-time/src/instant.ts:255-258`); `resolveLocalInstant(...)` maps a wall-clock in a zone to epoch ms (`instant.ts:300-303`); `fourDigitYearEpoch`/`isFourDigitYearInstant` (`instant.ts:227-246`). It depends on `@js-temporal/polyfill` (`$PKG/dsh-util-time/package.json:33-36`).
- There is no Beijing/`Asia/Shanghai`-specific helper. For Beijing-time buckets, format with `Intl.DateTimeFormat('...', { timeZone: 'Asia/Shanghai' })` or reuse the client's validated zone (`canonicalClientTimeZone`) with the Temporal-backed helpers. Bucketing must decide host-local vs client-local vs fixed +08:00; the durable data is zone-less epoch ms.

## 6. What the Client already sees

The host remote namespace is `session` (`SessionController extends TypertRemoteService`, `super(ctx,'sessionController',{ namespace:'session' })`, `$PKG/dsh-api-session-controller/src/index.ts:135,179`). `@Remote('list')` (`index.ts:281-285`) returns `{ items: SessionSummary[] }`, filtered by `remoteAccess`; `@Remote('search')` is similar (`index.ts:287-299`).

`SessionSummary` (`$PKG/dsh-api-session-controller/src/types.ts:153-167`) already carries the identity needed for per-session/per-project display:

```ts
export interface SessionSummary {
  agentAvailable: boolean; formatStatus?: 'current'|'migration-required'
  sessionId: SessionId; updatedAt: number; running: boolean; blank: boolean
  parentSessionId?: SessionId; origin?: 'subagent'; cwd?: string
  projections?: SessionProjectionHints
}
```

So session id, `cwd` (project grouping), `parentSessionId` and `origin` (subagent filtering) are client-visible; token usage is **not** exposed by that contract, so a usage plugin needs its own host-to-client channel. Live list updates use host events `api-session/added|removed|status|activity` (`index.ts:224-246`). A "project" for usage should key on `header.cwd` (the persisted value), not on Workspace ids; the workspace entity separately records `Workspace.path`/`sessionIds` (`$PKG/dsh-workspace/src/types.ts:62-100`).

## 7. Recommended data-collection design

1. **Live accumulation (Host, plugin-level, no agent scope):**
   `ctx.on('session/event', (session, event) => { if (event.type !== 'assistant/message') return; const u = event.data.usage; if (!u) return; ... })`
   Row fields: `sessionId = session.id`, `seq = event.seq`, `time = event.time`, `turn/step = data.turn/step`, `messageId = data.message.id`, `provider/model = data.message.source.provider/model`, usage numbers (`cacheWriteTokens: u.cacheWriteTokens ?? 0`, `totalTokens: u.totalTokens ?? input+output+cacheRead+cacheWrite`), plus session metadata from `session.header` (`cwd`, `parentSession`, `origin`, `delegationDepth`, `agentPreset`). Idempotency key `(sessionId, seq)`; tag subagent rows via `header.origin === 'subagent'` so `includeSubagents` only filters.
2. **Startup backfill (async, non-blocking):** `ctx.inject(['sessionQuery'], ...)` -> `listSessions()` -> `readSession()` per session; extract the same rows; skip `seq < inheritedEventCount`. Fallback when the query service is absent: `ctx.inject(['sessionPersistence'], ...)` -> `list()` -> `open(id,'read')` -> `read(watermark + 1)`.
3. **Merge/dedupe:** upsert by `(sessionId, seq)`; the same event can arrive live and via backfill (startup race), so make writes idempotent and keep a per-session `max(seq)` watermark.
4. **Persist aggregates in the plugin's own durable store** (host-research's storage-domain task); never mutate the session log (append-only; plugin records would pollute history).
5. **Price** from `provider` + `model` (optionally `reasoningEffort` from the latest preceding `request/header`); treat `cacheReadTokens` as cache hits; verify `totalTokens` consistency instead of trusting it blindly.

## 8. Unverified / risks

- `subagent/descriptor`, `subagent/catalog`, `session/title` **event owners** were not conclusively traced to a package (plugin-merged `SessionEventMap`). Header fields (`origin`, `parentSession`) are safer than event heuristics.
- `reasoningTokens` is declared optional but never observed; whether other adapters emit it is unverified in this install.
- Recovering `assistant/attempt` usage from its embedded `stream` is plausible but unverified (0 real attempts).
- Fork/seed double-count avoidance is source-verified only (no `isSeeded:true` log locally).
- **Scope-filtered dispatch** for a plugin mounted at profile root is inferred from the JSDoc ("agent-scoped listeners receive only sessions entered through that agent's context", `$PKG/dsh-session/src/index.ts:66-79`) plus the title-plugin/subagent-log evidence. A listener created inside an agent fiber would see only that agent's sessions.
- `session/event` is post-commit but fire-and-forget; if the plugin's own ledger must be crash-consistent with session events, do not rely on `session/event` alone - use `session/flush` (parallel, awaited) as a durability barrier for ledger writes.
- **Performance:** `readSession` returns full events including large embedded `stream` arrays, so a cold full-corpus backfill scales with total log bytes. Measure before enabling on large stores; prefer incremental `handle.read(watermark)` after the first pass.
