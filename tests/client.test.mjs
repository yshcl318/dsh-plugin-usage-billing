/**
 * Client-half wiring tests: load the real `client.js` factory in a Node VM-ish
 * shell with a minimal React stub and a mock slot/remote context.
 *
 * Checks:
 * - the bundle loads through `window.__ModuleLoader__.load` and returns `{inject, apply}`.
 * - apply registers every promised slot even when the Remote channel never mounts.
 * - the Remote contribution's method/parameter list matches the Host half exactly.
 * - after a successful mount, the namespace inject fires and preferences load.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageBillingService, REMOTE_METHODS } from '../bundle/dsh-plugin-usage-billing/host/service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'bundle', 'dsh-plugin-usage-billing', 'client.js'), 'utf8');

let captured = null;
const windowLike = {
  __ModuleLoader__: {
    load(config) {
      captured = config;
    },
  },
};
// eslint-disable-next-line no-new-func
new Function('window', source)(windowLike);

assert.ok(captured !== null, 'ModuleLoader.load was not called');
const loaderConfig = /** @type {any} */ (captured);
assert.equal(loaderConfig.id, '@yshcl318/dsh-plugin-usage-billing');

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
  useState: value => [value, () => {}],
  useEffect: () => {},
  useMemo: fn => fn(),
  useRef: value => ({ current: value }),
  useCallback: fn => fn,
  useSyncExternalStore: () => undefined,
};

const requireStub = (id) => {
  if (id === 'react') return ReactStub;
  throw new Error(`unexpected require(${id})`);
};

const plugin = loaderConfig.factory(requireStub);
assert.equal(typeof plugin.apply, 'function');
assert.ok(plugin.__internals !== undefined, 'view-model internals should be exposed for tests');
const internals = plugin.__internals;

// Regression: the Today card must use today's calls, not the range's call count.
assert.equal(internals.todayCallsOf({ overview: { calls: 903 }, todaySplit: { totalCalls: 784 } }), 784);
assert.equal(internals.todayCallsOf({}), 0);
// Range label is not hardcoded to "this month".
const monthLabel = internals.rangeLabelText('month');
assert.equal(typeof monthLabel, 'string');
assert.notEqual(internals.rangeLabelText('7d'), monthLabel);
assert.notEqual(internals.rangeLabelText('all'), monthLabel);
// A sparse heatmap narrows its window instead of rendering 90 mostly-empty days.
const heat = Array.from({ length: 90 }, (_, index) => ({ day: String(index), level: 0, value: 0 }));
heat[88] = { day: '88', level: 2, value: 1 };
heat[89] = { day: '89', level: 3, value: 2 };
assert.equal(internals.sparseHeatmap(heat).length, 14);
const dense = heat.map(cell => ({ ...cell, level: 1, value: 1 }));
assert.equal(internals.sparseHeatmap(dense).length, 90);
// Budget view carries the subagent scope and the notice month.
const view = internals.budgetView({ month: { spentCny: 5, monthlyCny: 100, notice: 50, monthKey: '2026-11' } });
assert.equal(view.includeSubagents, true);
assert.equal(view.notice, 50);
assert.equal(view.monthKey, '2026-11');
// Wallet presentation helpers.
assert.equal(internals.signedMoney(-0.2), '−¥0.20');
assert.equal(internals.signedMoney(0), '¥0.00');
assert.equal(internals.balanceIsLive({ status: 'ready', totalCny: 11.78 }), true);
assert.equal(internals.balanceIsLive({ status: 'signedOut', totalCny: null }), false);
assert.equal(typeof internals.balanceHintView({ status: 'signedOut' }).text, 'string');
assert.deepEqual(plugin.inject, ['slots']);

const registrations = [];
const serviceCalls = [];
const effectDisposers = [];
const slotInjectKeys = [];

function makeCtx() {
  const ctx = {
    get(name) {
      if (name === 'locale') {
        return { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} };
      }
      if (name === 'layout') return { selectPanel: () => {} };
      return undefined;
    },
    slots: {
      inject(key, callback) {
        slotInjectKeys.push(key);
        const dispose = callback();
        return typeof dispose === 'function' ? dispose : () => {};
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
    inject(keys, callback) {
      serviceCalls.push({ keys, callback });
      return { dispose() {} };
    },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') effectDisposers.push(dispose);
      return () => {};
    },
  };
  return ctx;
}

const ctx = makeCtx();
plugin.apply(ctx);

// 1. All four registered surfaces exist (panel, overlay, settings, plus the two
//    preference-gated entries). Defaults have both entries on.
const registeredSlots = slotInjectKeys.sort();
for (const expected of ['main', 'shell.overlay', 'settings.section', 'sidebar.panellist', 'conversation.composer.dock']) {
  assert.ok(registeredSlots.includes(expected), `missing slot injection: ${expected}`);
}
const byName = new Map(registrations.map(entry => [entry.options.name, entry.options]));
assert.equal(byName.get('main').key, 'usage-billing');
assert.equal(byName.get('sidebar.panellist').id, 'usage-billing');
assert.equal(byName.get('conversation.composer.dock').id, 'usage-billing');
assert.equal(byName.get('shell.overlay').id, 'usage-billing');
assert.equal(byName.get('settings.section').id, 'usage-billing');

// 2. The Remote contribution matches the Host marker exactly.
const remoteMountCall = serviceCalls.find(call => call.keys[0] === 'remote');
assert.ok(remoteMountCall !== undefined, 'no remote inject call');
const mountTargets = [];
function makeRemoteCtx() {
  const nested = [];
  return {
    remote: {
      $mount: async (contribution) => {
        mountTargets.push(contribution);
        return async () => {};
      },
    },
    effect: (callback) => {
      const disposer = callback();
      return () => {};
    },
    inject: (keys, callback) => {
      nested.push({ keys, callback });
      return { dispose() {} };
    },
    nested,
  };
}
const remoteCtx = makeRemoteCtx();
remoteMountCall.callback(remoteCtx);
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(mountTargets.length, 1, 'remote $mount was not called');
const contribution = mountTargets[0];
assert.equal(contribution.package, '@yshcl318/dsh-plugin-usage-billing');

const descriptor = Object.getOwnPropertyDescriptor(UsageBillingService.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods');
const hostMethods = descriptor.value.methods.map(entry => entry.method);
assert.deepEqual(contribution.descriptors.map(entry => entry.method), hostMethods, 'client/host method lists diverge');
for (const entry of contribution.descriptors) {
  const fn = UsageBillingService.prototype[entry.method];
  const params = fn.toString().slice(fn.toString().indexOf('(') + 1, fn.toString().indexOf(')')).trim();
  const names = params === '' ? [] : params.split(',').map(part => part.trim());
  assert.deepEqual(entry.parameters.map(parameter => parameter.name), names, `parameter mismatch for ${entry.method}`);
  assert.equal(entry.invocation.kind, 'direct');
  for (const parameter of entry.parameters) {
    assert.equal(parameter.codec.mode, 'strict');
    assert.equal(parameter.source, 'json');
  }
  assert.equal(entry.result.mode, 'src-json');
}
assert.deepEqual([...hostMethods].sort(), [...REMOTE_METHODS].sort());
assert.deepEqual(remoteCtx.nested.map(entry => entry.keys[0]), ['remote.usageBilling']);

// 3. Mounting the namespace runs loadPrefs through the namespace.
const hostCalls = [];
const api = {};
for (const entry of contribution.descriptors) {
  api[entry.method] = async (...args) => {
    hostCalls.push({ method: entry.method, args });
    if (entry.method === 'prefs') {
      return { ok: true, value: { ready: true, prefs: { monthlyCny: 42, includeSubagents: false, entrySidebar: true, entryComposer: true, showTierCurve: true } } };
    }
    return { ok: true, value: { ready: true } };
  };
}
const namespaceCtx = {
  remote: { usageBilling: api },
  effect: callback => { callback(); return () => {}; },
};
remoteCtx.nested[0].callback(namespaceCtx);
await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(hostCalls.some(call => call.method === 'prefs'), 'prefs were not loaded after the namespace mounted');
const prefsCall = hostCalls.find(call => call.method === 'prefs');
assert.deepEqual(prefsCall.args, []);

// 4. Cleanup runs without throwing.
for (const dispose of effectDisposers) {
  assert.doesNotThrow(() => dispose());
}

// 5. A context whose remote service never appears still registers all surfaces.
const quietRegistrations = [];
const quietCtx = {
  get: () => undefined,
  slots: {
    inject(key, callback) {
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    register(options) {
      quietRegistrations.push(options);
      return () => {};
    },
  },
  inject: () => ({ dispose() {} }),
  effect(callback) {
    const dispose = callback();
    quietDisposers.push(dispose);
    return () => {};
  },
};
const quietDisposers = [];
assert.doesNotThrow(() => plugin.apply(quietCtx));
assert.ok(quietRegistrations.some(options => options.name === 'sidebar.panellist'));
assert.ok(quietRegistrations.some(options => options.name === 'shell.overlay'));
for (const dispose of quietDisposers) if (typeof dispose === 'function') assert.doesNotThrow(() => dispose());

console.log(`client wiring ok: ${registrations.length} remote-mounted surfaces, ${quietRegistrations.length} degraded surfaces, ${contribution.descriptors.length} remote methods`);
