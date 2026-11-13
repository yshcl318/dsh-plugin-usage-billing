/**
 * Session-log collection: turn durable `assistant/message` events into the
 * usage facts the ledger needs.
 *
 * The session log is the only source of truth. Live turns arrive through the
 * `session/event` feed; history arrives through the platform's session
 * persistence / query services, read asynchronously after `apply` returned.
 */

/** Canonical provider/model for one turn, tracked across request events. */
function contextModel(event) {
  if (event.type === 'request/context') {
    const data = event.data;
    if (typeof data?.provider === 'string' && typeof data.model === 'string') {
      return { provider: data.provider, model: data.model };
    }
  }
  if (event.type === 'request/header') {
    const config = event.data?.header?.config;
    if (typeof config?.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model };
    }
  }
  return undefined;
}

/** Model identity of an assistant message: its own source wins. */
function assistantModel(event) {
  const source = event.data?.message?.source;
  if (source !== undefined && typeof source.provider === 'string' && typeof source.model === 'string') {
    return { provider: source.provider, model: source.model };
  }
  return undefined;
}

/**
 * Extract every priced usage record from one session's events.
 *
 * Events below `inheritedEventCount` are a forked session's inherited prefix:
 * they were already billed in the source session, so they are skipped here to
 * keep one model call counted once.
 * @param events - complete session log in ascending seq order.
 * @param inheritedEventCount - first seq this session owns (0 for normal logs).
 * @returns {{items: Array<object>, lastSeq: number, lastTime: number}}
 */
export function extractUsageItems(events, inheritedEventCount = 0) {
  let fromContext;
  let lastSeq = -1;
  let lastTime = 0;
  const items = [];
  for (const event of events) {
    if (typeof event?.seq === 'number' && event.seq > lastSeq) lastSeq = event.seq;
    if (typeof event?.time === 'number' && event.time > lastTime) lastTime = event.time;
    if (typeof event?.seq === 'number' && event.seq < inheritedEventCount) continue;
    const model = contextModel(event);
    if (model !== undefined) {
      fromContext = model;
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (usage === undefined || usage === null) continue;
    const who = assistantModel(event) ?? fromContext ?? { provider: 'unknown', model: 'unknown' };
    items.push({
      seq: event.seq,
      time: event.time,
      provider: who.provider,
      model: who.model,
      usage,
      interrupted: event.data?.interrupted === true,
    });
  }
  return { items, lastSeq, lastTime };
}

/** Durable session facts derived from the immutable header. */
export function sessionMetaOf(header) {
  return {
    sessionId: String(header.id),
    cwd: typeof header.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined,
    isSubagent: header.origin === 'subagent' || header.parentSession !== undefined,
    delegationDepth: typeof header.delegationDepth === 'number' ? header.delegationDepth : undefined,
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
  };
}

/**
 * List stored sessions through the cheapest available platform service.
 * Never throws: a missing service is an empty corpus.
 */
export async function listStoredSessions(ctx, signal) {
  const persistence = ctx.get('sessionPersistence');
  if (persistence !== undefined) {
    try {
      const snapshots = await persistence.list(signal === undefined ? undefined : { signal });
      return snapshots
        .filter(snapshot => snapshot?.header !== undefined)
        .map(snapshot => ({
          header: snapshot.header,
          revision: snapshot.revision === undefined ? null : String(snapshot.revision),
        }));
    } catch (error) {
      warn(ctx, '列出本地会话失败（回退 sessionQuery）', error);
    }
  }
  const query = ctx.get('sessionQuery');
  if (query !== undefined) {
    try {
      const records = await query.listSessions(signal);
      return records
        .filter(record => record?.header !== undefined)
        .map(record => ({ header: record.header, revision: null }));
    } catch (error) {
      warn(ctx, '列出本地会话失败', error);
    }
  }
  return [];
}

/**
 * Read one session's complete event log.
 * @throws when no reader is available or the read fails.
 */
export async function readSessionEvents(ctx, sessionId) {
  // sessionQuery replay-validates and merges live-preferred state, and reports
  // the inherited prefix a forked session must not bill twice.
  const query = ctx.get('sessionQuery');
  if (query !== undefined) {
    const snapshot = await query.readSession(sessionId);
    return { events: [...snapshot.events], inheritedEventCount: Number(snapshot.inheritedEventCount ?? 0) };
  }
  const persistence = ctx.get('sessionPersistence');
  if (persistence !== undefined) {
    const handle = await persistence.open(sessionId, 'read');
    try {
      const result = await handle.read();
      return { events: [...result.events], inheritedEventCount: Number(handle.inheritedEventCount ?? 0) };
    } finally {
      await handle.close().catch(() => {});
    }
  }
  throw new Error('no session query or persistence service');
}

/** Logger helper with the plugin's console prefix. */
export function warn(ctx, message, error) {
  try {
    ctx.logger.warn(`[usage-billing] ${message}`, error);
  } catch {
    /* a detached logger must never break collection */
  }
}
