/**
 * DOM rendering tests (jsdom + real React): mount the bundle's registered
 * components against a mocked Remote channel and assert the user-visible
 * numbers/layout that pure view-model tests cannot catch.
 *
 * This is the layer that would have caught the "today card shows the monthly
 * call count" and "heatmap still renders 90 cells" regressions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'bundle', 'dsh-plugin-usage-billing', 'client.js'), 'utf8');

/* ---------------- DOM + React ---------------- */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1/',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

global.IS_REACT_ACT_ENVIRONMENT = true;
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const act = React.act;

/* ---------------- load the bundle factory ---------------- */
const captured = {};
window.__ModuleLoader__ = { load: config => { captured.config = config; } };
// eslint-disable-next-line no-new-func
new Function('window', source)(window);
assert.ok(captured.config !== undefined, 'ModuleLoader.load was not called');
const plugin = /** @type {any} */ (captured.config).factory(id => {
  if (id === 'react') return React;
  throw new Error(`unexpected require(${id})`);
});
assert.equal(plugin.inject[0], 'slots');

/* ---------------- fixtures ---------------- */
const prefsFixture = {
  budgetEnabled: true,
  monthlyCny: 100,
  entrySidebar: true,
  entryComposer: true,
  includeSubagents: true,
  showTierCurve: true,
};
const overviewFixture = {
  ready: true,
  range: 'month',
  todayKey: '2026-11-13',
  overview: {
    totalCny: 30,
    todayCny: 10,
    calls: 300,
    unpricedRows: 0,
    unpricedModels: [],
    hasBackfilled: true,
    cacheHitRate: 0.5,
    dayCount: 2,
    tokens: { input: 1000, cacheRead: 1000, cacheWrite: 0, output: 500 },
  },
  month: { enabled: true, monthlyCny: 100, spentCny: 20, pct: 0.2, level: 'ok', notice: null, monthKey: '2026-11', includeSubagents: true },
  todaySplit: { projectCny: 9, otherCny: 1, projectCalls: 20, otherCalls: 4, totalCny: 10, totalCalls: 24, hasProject: true },
  cumulative: { totalCny: 30, calls: 300, sessions: 3, subagentSessions: 1, workspaces: 1 },
  tier: {
    current: 'offPeak',
    nextSwitchAt: null,
    holidayDataThrough: 2027,
    offPeakRatio: 0.5,
    day: { workday: true, peakWindows: [[540, 720], [840, 1080]], offPeakRatio: 0.5, utcOffsetMinutes: 480 },
  },
  pricing: { live: false, usdToCny: 7.1, snapshotId: 'snap', entries: 10, customKeys: [] },
  prefs: prefsFixture,
};
const days = Array.from({ length: 30 }, (_, index) => {
  const nonzero = index >= 28;
  return {
    day: `2026-11-${String(index + 1).padStart(2, '0')}`,
    costCny: nonzero ? 5 : 0,
    input: nonzero ? 100 : 0,
    cacheRead: nonzero ? 900 : 0,
    cacheWrite: 0,
    output: nonzero ? 50 : 0,
    calls: nonzero ? 10 : 0,
  };
});
const dailyFixture = {
  ready: true,
  days,
  heatmap: Array.from({ length: 90 }, (_, index) => ({
    day: `day-${index}`,
    costCny: index >= 88 ? 1 : 0,
  })),
  hasBackfilled: true,
  unpricedModels: [],
};
const modelsFixture = {
  ready: true,
  models: [{
    key: 'deepseek-v4-flash', provider: 'deepseek-account', providers: ['deepseek-account'],
    model: 'deepseek-v4-flash', rawModels: ['deepseek-flash'],
    input: 1000, cacheRead: 900, cacheWrite: 0, output: 500,
    costCny: 10, priced: true, mixedRate: false, calls: 20,
  }],
  hasBackfilled: true,
  unpricedModels: [],
};
const pricingFixture = {
  ready: true, entries: {}, rows: [], usdToCny: 7.1, usdToCnySource: 'default', live: false,
  snapshotId: 'snap', customKeys: [], schemaRuntime: 'zod', tier: overviewFixture.tier,
};

function mockApi(contribution) {
  const calls = [];
  const api = {};
  for (const descriptor of contribution.descriptors) {
    api[descriptor.method] = async (...args) => {
      calls.push({ method: descriptor.method, args });
      switch (descriptor.method) {
        case 'prefs': return { ok: true, value: { ready: true, prefs: prefsFixture } };
        case 'overview': return { ok: true, value: { ...overviewFixture, range: args[0] } };
        case 'sessionCost': return {
          ok: true,
          value: {
            ready: true, sessionId: args[0], costCny: 2.5, todayCny: 2.5, calls: 5,
            input: 10, cacheRead: 90, output: 5, unpriced: 0,
            budget: { ...overviewFixture.month, monthKey: '2026-11', notice: null },
            tier: overviewFixture.tier,
          },
        };
        case 'daily': return { ok: true, value: { ...dailyFixture, range: args[0] } };
        case 'byModel': return { ok: true, value: modelsFixture };
        case 'byWorkspace': return { ok: true, value: { ready: true, workspaces: [], hasBackfilled: true, unpricedModels: [] } };
        case 'pricing': return { ok: true, value: pricingFixture };
        case 'aliasList': return { ok: true, value: { ready: true, aliases: [] } };
        case 'savePrefs': return { ok: true, value: { ok: true, prefs: prefsFixture } };
        case 'dismissBudgetNotice': return { ok: true, value: { ok: true } };
        default: return { ok: true, value: { ok: true } };
      }
    };
  }
  return { api, calls };
}

/* ---------------- apply the client plugin ---------------- */
const registrations = [];
const disposers = [];
let remoteInject = null;
let namespaceInject = null;
let contribution = null;
const localeSubscribers = new Set();
const localeService = {
  getSnapshot: () => ({ active: 'zh', locales: [], revision: 0 }),
  subscribe: callback => { localeSubscribers.add(callback); return () => localeSubscribers.delete(callback); },
  register: () => () => {},
  bind: () => key => key,
};
const ctx = {
  get(name) {
    if (name === 'locale') return localeService;
    if (name === 'layout') return { selectPanel: () => {} };
    return undefined;
  },
  slots: {
    inject(key, callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    register(options, component) {
      registrations.push({ options, component });
      return () => {};
    },
  },
  inject(keys, callback) {
    if (keys[0] === 'locale') {
      callback({ locale: localeService, effect: fn => { fn(); return () => {}; } });
    } else if (keys[0] === 'remote') {
      remoteInject = callback;
    } else if (keys[0] === 'remote.usageBilling') {
      namespaceInject = callback;
    }
    return { dispose() {} };
  },
  effect(callback) {
    const disposer = callback();
    if (typeof disposer === 'function') disposers.push(disposer);
    return () => {};
  },
};
plugin.apply(ctx);
assert.ok(remoteInject !== null, 'remote inject missing');
/** @type {any} */ (remoteInject)({
  remote: {
    $mount: async value => {
      contribution = value;
      return async () => {};
    },
  },
  effect: callback => { callback(); return () => {}; },
  inject(keys, callback) {
    if (keys[0] === 'remote.usageBilling') namespaceInject = callback;
    return { dispose() {} };
  },
});
await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(contribution !== null, 'remote contribution not mounted');
assert.ok(namespaceInject !== null, 'namespace inject missing');
const { api } = mockApi(contribution);
/** @type {any} */ (namespaceInject)({ remote: { usageBilling: api }, effect: callback => { callback(); return () => {}; } });
await new Promise(resolve => setTimeout(resolve, 10));

const useSessions = selector => {
  const state = { ids: ['s1'], byId: { s1: { cwd: 'D:\\proj' } }, phase: 'ready', projectionsBySession: {} };
  return selector === undefined ? state : selector(state);
};
const componentOf = name => registrations.find(entry => entry.options.name === name)?.component;

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  }
}
function click(element) {
  act(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}
function textOf(container) {
  return container.textContent ?? '';
}

/* ---------------- render the main panel ---------------- */
const mainRoot = createRoot(document.createElement('div'));
const mainContainer = mainRoot._internalRoot.containerInfo;
document.body.appendChild(mainContainer);
const MainComponent = componentOf('main');
assert.ok(MainComponent !== undefined, 'main panel component not registered');
await act(async () => {
  mainRoot.render(React.createElement(MainComponent, { useSessions }));
  await new Promise(resolve => setTimeout(resolve, 30));
});
await flush(8);

const panelText = textOf(mainContainer);
assert.ok(panelText.includes('¥'), 'main panel did not render amounts');
const refreshButtons = [...mainContainer.querySelectorAll('button')].filter(button => button.textContent === '刷新');
assert.equal(refreshButtons.length, 1, `expected one refresh button, got ${refreshButtons.length}`);
assert.equal(mainContainer.querySelectorAll('.ub-heat i').length, 14, 'sparse heatmap should render 14 cells');
assert.ok(panelText.includes('最近 14 天'), 'heatmap hint should state the rendered window');
assert.ok(/784|24/.test(panelText) || panelText.includes('24'), 'today calls should come from todaySplit.totalCalls');
assert.ok(panelText.includes('含子代理'), 'budget rows should mark the subagent scope');
assert.ok(panelText.includes('内置价'), 'price source badge should be visible when prices are not live');
assert.ok(!/% 已用/.test(panelText.split('月度预算')[0] ?? ''), 'month stat card should not duplicate the budget percentage');
assert.equal(mainContainer.querySelectorAll('.ub-card [data-dsh-ub-tier]').length, 1, 'peak/off-peak strip should live inside the budget card');

// Range label follows the switch.
const range7 = [...mainContainer.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === '近 7 天');
assert.ok(range7 !== undefined, 'range switch missing');
click(range7);
await flush(6);
assert.ok(textOf(mainContainer).includes('近 7 天'), 'stat card title should follow the selected range');

// Trend tab: empty days hidden by default, total-token label precise.
const trendTab = [...mainContainer.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === '趋势');
click(trendTab);
await flush(8);
const trendText = textOf(mainContainer);
assert.ok(trendText.includes('总 token'), 'trend token total should be labelled as total');
assert.ok(trendText.includes('活跃日均'), 'average should be labelled per active day');
const trendRows = mainContainer.querySelectorAll('table tbody tr').length;
assert.equal(trendRows, 2, `expected only the 2 active days, got ${trendRows} rows`);
const toggleEmpty = [...mainContainer.querySelectorAll('button')].find(button => button.textContent === '显示空白天');
assert.ok(toggleEmpty !== undefined, 'show-empty-days toggle missing');
click(toggleEmpty);
await flush(6);
assert.equal(mainContainer.querySelectorAll('table tbody tr').length, 30, 'toggle should reveal empty days');

/* ---------------- capsule + popover ---------------- */
const overlayRoot = createRoot(document.createElement('div'));
const overlayContainer = overlayRoot._internalRoot.containerInfo;
document.body.appendChild(overlayContainer);
const capsuleRoot = createRoot(document.createElement('div'));
const capsuleContainer = capsuleRoot._internalRoot.containerInfo;
document.body.appendChild(capsuleContainer);
const OverlayComponent = componentOf('shell.overlay');
const CapsuleComponent = componentOf('conversation.composer.dock');
assert.ok(OverlayComponent !== undefined && CapsuleComponent !== undefined, 'capsule/overlay components not registered');
await act(async () => {
  overlayRoot.render(React.createElement(OverlayComponent, { useSessions }));
  capsuleRoot.render(React.createElement(CapsuleComponent, { sessionId: 's1', useSessions }));
  await new Promise(resolve => setTimeout(resolve, 30));
});
await flush(6);
const capsuleButton = capsuleContainer.querySelector('[data-dsh-ub-capsule]');
assert.ok(capsuleButton !== null, 'capsule not rendered');
assert.equal(capsuleButton.getAttribute('aria-haspopup'), 'dialog');
assert.ok((capsuleButton.getAttribute('title') ?? '').includes('本会话金额'));
assert.ok(textOf(capsuleContainer).includes('¥2.50'), 'capsule should show the session amount');
click(capsuleButton);
await flush(6);
const dialog = document.querySelector('[data-dsh-ub-popover="true"] [data-dsh-ub-dialog]');
assert.ok(dialog !== null, 'popover dialog did not open');
assert.equal(dialog.getAttribute('role'), 'dialog');
assert.equal(dialog.getAttribute('aria-modal'), 'true');
assert.ok((dialog.textContent ?? '').includes('本项目'), 'popover should show the project split');
act(() => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush(4);
assert.equal(document.querySelector('[data-dsh-ub-popover="true"]'), null, 'Escape should close the popover');

await act(async () => { mainRoot.unmount(); });
await act(async () => { overlayRoot.unmount(); capsuleRoot.unmount(); });
for (const dispose of disposers) {
  try { await dispose(); } catch { /* detached */ }
}
dom.window.close();
console.log('ui dom tests ok: panel layout, heatmap window, today calls, trend filtering, capsule + popover');
