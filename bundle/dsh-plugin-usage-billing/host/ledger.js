/**
 * Ledger views: pure aggregation over priced ledger rows.
 *
 * A row is the single durable fact. Everything the UI shows is computed from
 * rows on read, so a price-table edit can never rewrite an already-priced row.
 */

/** Filter out subagent rows when the user turns them off. */
export function filterRows(rows, includeSubagents) {
  if (includeSubagents) return rows;
  return rows.filter(row => !row.isSubagent);
}

/** Cache-hit ratio: cacheRead / (input + cacheRead), empty denominator = 0. */
export function cacheHitRate(rows) {
  let hit = 0;
  let total = 0;
  for (const row of rows) {
    hit += row.cacheRead;
    total += row.input + row.cacheRead;
  }
  return total === 0 ? 0 : hit / total;
}

/** Stable marker block shared by every range response. */
export function buildMarkers(rows) {
  const unpriced = new Set();
  let hasBackfilled = false;
  for (const row of rows) {
    if (!row.priced) unpriced.add(`${row.provider}/${row.model}`);
    if (row.backfilled) hasBackfilled = true;
  }
  return { hasBackfilled, unpricedModels: [...unpriced].sort() };
}

function sumTokens(rows) {
  let input = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let output = 0;
  let reasoning = 0;
  for (const row of rows) {
    input += row.input;
    cacheRead += row.cacheRead;
    cacheWrite += row.cacheWrite;
    output += row.output;
    if (row.reasoning !== undefined) reasoning += row.reasoning;
  }
  return { input, cacheRead, cacheWrite, output, reasoning };
}

/**
 * Overview for one range.
 * @param rows - rows inside the range.
 * @param opts - `{todayKey, weekDays}`.
 */
export function buildOverview(rows, opts) {
  let totalCny = 0;
  let todayCny = 0;
  let weekCny = 0;
  let pricedCalls = 0;
  let unpricedRows = 0;
  const weekSet = new Set(opts.weekDays);
  for (const row of rows) {
    totalCny += row.costCny;
    if (row.day === opts.todayKey) todayCny += row.costCny;
    if (weekSet.has(row.day)) weekCny += row.costCny;
    if (row.priced) pricedCalls += 1;
    else unpricedRows += 1;
  }
  const days = new Set(rows.map(row => row.day));
  const calls = rows.length;
  return {
    ...buildMarkers(rows),
    totalCny,
    todayCny,
    weekCny,
    avgDailyCny: days.size === 0 ? 0 : totalCny / days.size,
    cacheHitRate: cacheHitRate(rows),
    calls,
    unpricedRows,
    pricedCalls,
    dayCount: days.size,
    tokens: sumTokens(rows),
  };
}

/** Per-day series; days without rows are filled with zeros. */
export function buildDaily(rows, days) {
  const byDay = new Map();
  for (const day of days) byDay.set(day, { day, costCny: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, calls: 0 });
  for (const row of rows) {
    const point = byDay.get(row.day);
    if (point === undefined) continue;
    point.costCny += row.costCny;
    point.input += row.input;
    point.cacheRead += row.cacheRead;
    point.cacheWrite += row.cacheWrite;
    point.output += row.output;
    point.calls += 1;
  }
  return [...byDay.values()];
}

/** Merge rows by display model name (cross-provider), honoring manual aliases. */
export function mergeByModel(rows, aliases) {
  const aliasOf = (provider, model) => {
    const p = String(provider).trim().toLowerCase();
    const raw = String(model).trim();
    return aliases.find(a => a.provider === p && a.rawModel === raw);
  };
  const groups = new Map();
  for (const row of rows) {
    const alias = aliasOf(row.provider, row.model);
    const key = alias === undefined ? displayModelName(row.model) : alias.canonicalModel;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        providers: new Set(),
        rawModels: new Set(),
        input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0,
        costCny: 0, calls: 0, priced: true, mixedRate: false,
      };
      groups.set(key, group);
    }
    group.providers.add(String(row.provider).trim().toLowerCase());
    group.rawModels.add(String(row.model).trim());
    group.input += row.input;
    group.cacheRead += row.cacheRead;
    group.cacheWrite += row.cacheWrite;
    group.output += row.output;
    if (row.reasoning !== undefined) group.reasoning += row.reasoning;
    group.costCny += row.costCny;
    group.calls += 1;
    if (!row.priced) group.priced = false;
    if (group.tokensPerCost === undefined) group.tokensPerCost = new Set();
    group.tokensPerCost.add(rateSignature(row));
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    providers: [...group.providers].sort(),
    provider: [...group.providers].sort()[0] ?? '',
    model: group.key,
    rawModels: [...group.rawModels].sort(),
    input: group.input,
    cacheRead: group.cacheRead,
    cacheWrite: group.cacheWrite,
    output: group.output,
    reasoning: group.reasoning,
    costCny: group.costCny,
    priced: group.priced,
    mixedRate: (group.tokensPerCost?.size ?? 0) > 1,
    calls: group.calls,
  })).sort((a, b) => b.costCny - a.costCny || a.model.localeCompare(b.model));
}

function rateSignature(row) {
  const tokens = row.input + row.cacheRead + row.cacheWrite + row.output;
  return tokens === 0 ? '0' : String(Math.round((row.costCny / tokens) * 1e12));
}

/** Display model name: lowercase, org prefix stripped, synonym folded. */
export function displayModelName(raw) {
  const id = String(raw ?? '').trim().toLowerCase().replace(/^[a-z0-9][a-z0-9._-]*\//, '');
  return id === 'deepseek-flash' ? 'deepseek-v4-flash' : id;
}

/** Today's distribution: this project vs other projects. */
export function buildTodaySplit(rows, opts) {
  let project = 0;
  let other = 0;
  let projectCalls = 0;
  let otherCalls = 0;
  for (const row of rows) {
    if (row.day !== opts.todayKey) continue;
    if (opts.cwd !== undefined && row.cwd === opts.cwd) {
      project += row.costCny;
      projectCalls += 1;
    } else {
      other += row.costCny;
      otherCalls += 1;
    }
  }
  return { projectCny: project, otherCny: other, projectCalls, otherCalls, totalCny: project + other };
}

/** Session/workspace rows for the popover and the detail table. */
export function buildByWorkspace(rows, todayKey) {
  const workspaces = new Map();
  for (const row of rows) {
    const cwd = typeof row.cwd === 'string' && row.cwd !== '' ? row.cwd : '';
    let workspace = workspaces.get(cwd);
    if (workspace === undefined) {
      workspace = { cwd, calls: 0, costCny: 0, todayCny: 0, sessions: new Map() };
      workspaces.set(cwd, workspace);
    }
    workspace.calls += 1;
    workspace.costCny += row.costCny;
    if (row.day === todayKey) workspace.todayCny += row.costCny;
    let session = workspace.sessions.get(row.sessionId);
    if (session === undefined) {
      session = {
        sessionId: row.sessionId,
        cwd: cwd === '' ? undefined : cwd,
        calls: 0,
        costCny: 0,
        todayCny: 0,
        lastTime: 0,
        isSubagent: row.isSubagent,
      };
      workspace.sessions.set(row.sessionId, session);
    }
    session.calls += 1;
    session.costCny += row.costCny;
    if (row.day === todayKey) session.todayCny += row.costCny;
    if (row.time > session.lastTime) session.lastTime = row.time;
  }
  return [...workspaces.values()]
    .map(workspace => ({
      cwd: workspace.cwd,
      calls: workspace.calls,
      costCny: workspace.costCny,
      todayCny: workspace.todayCny,
      sessions: [...workspace.sessions.values()].sort((a, b) => b.costCny - a.costCny),
    }))
    .sort((a, b) => b.costCny - a.costCny);
}

/** One session's totals (used by the composer capsule). */
export function buildSessionCost(rows, sessionId, todayKey) {
  let costCny = 0;
  let todayCny = 0;
  let calls = 0;
  let input = 0;
  let cacheRead = 0;
  let output = 0;
  let unpriced = 0;
  for (const row of rows) {
    if (row.sessionId !== sessionId) continue;
    costCny += row.costCny;
    if (row.day === todayKey) todayCny += row.costCny;
    calls += 1;
    input += row.input;
    cacheRead += row.cacheRead;
    output += row.output;
    if (!row.priced) unpriced += 1;
  }
  return { sessionId, costCny, todayCny, calls, input, cacheRead, output, unpriced };
}

/** Consecutive-day calendar grid for the activity heatmap, oldest first. */
export function buildHeatmap(rows, days) {
  const byDay = new Map(days.map(day => [day, 0]));
  for (const row of rows) {
    if (byDay.has(row.day)) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.costCny);
  }
  return days.map(day => ({ day, costCny: byDay.get(day) ?? 0 }));
}
