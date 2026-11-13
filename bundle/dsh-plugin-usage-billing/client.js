// @ts-check
/**
 * Client half of the usage-billing bundle.
 *
 * Registers, through the slot system:
 * - `sidebar.panellist`     entry icon (budget ring) whose id addresses the panel below
 * - `main` (key `usage-billing`)  the full billing page
 * - `conversation.composer.dock`  the session capsule with its budget donut
 * - `shell.overlay`         the detail popover (backdrop, Esc / outside click)
 * - `settings.section`      Settings → 计费 (概览 / 趋势 / 明细)
 *
 * Every Surface is additive and reads one shared store. The store is fed by a
 * lazily mounted Typert Remote channel; if that channel never mounts, surfaces
 * keep rendering an explicit empty state and the console carries one
 * `[usage-billing]` warning.
 */
window.__ModuleLoader__.load({
  id: '@yshcl318/dsh-plugin-usage-billing',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const Fragment = React.Fragment;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;
    const useCallback = React.useCallback;
    const useSyncExternalStore = React.useSyncExternalStore;

    const PKG = '@yshcl318/dsh-plugin-usage-billing';
    const NS = 'usageBilling';
    const PANEL_ID = 'usage-billing';
    const LOG = '[usage-billing]';

    /* ---------------------------------------------------------------- */
    /* Copy                                                             */
    /* ---------------------------------------------------------------- */

    const DICTS = {
      en: {
        nav: 'Billing',
        panelTitle: 'Usage billing',
        subtitle: 'Real token usage from local session logs · write-time locked prices',
        today: 'Today',
        thisMonth: 'This month',
        cumulative: 'All time',
        cacheRate: 'Cache hit rate',
        budget: 'Monthly budget',
        budgetDisabled: 'Budget disabled (amount is 0)',
        methodNote: 'Billed in Beijing time (UTC+8); holiday data covers 2025–{0}.',
        subagentSuffix: ' (incl. {0} subagent)',
        includeSubagentsTag: 'incl. subagents',
        heatmapHintDays: 'Last {0} days · darker means more spent',
        tabsBalance: 'Wallet',
        balanceTitle: 'Actual balance',
        balanceShort: 'Balance',
        balanceLive: 'Live',
        balanceBonus: 'Bonus wallet',
        balanceUpdated: 'Updated {0}',
        balanceDelta: 'vs previous sample',
        balanceTodayCharged: 'Balance drop today*',
        balanceTodayEstimate: 'Usage estimate today',
        balanceEstimateDiff: 'Estimate - drop',
        balanceLoading: 'Loading account balance…',
        balanceSignedOut: 'Sign in to DeepSeek to show the actual balance.',
        balanceUnavailable: 'Account balance service is unavailable in this build.',
        balanceFailed: 'Balance query failed',
        balanceDisabled: 'Actual balance display is off.',
        balanceRefresh: 'Refresh balance',
        balanceRefreshInterval: 'Auto refresh',
        balanceRefreshHint: 'Manual refresh is always immediate; the wallet check respects this interval.',
        balanceHistory: 'Observed balance changes',
        balanceHistoryEmpty: 'No changes observed yet.',
        balanceTopUp: 'Top up',
        balanceTopUpDay: 'Top-up today',
        balanceTopUpHint: 'A top-up was observed today; daily spend is the sum of balance drops.',
        balanceUsage: 'Usage',
        balanceNote: 'Read from your DeepSeek account; no usage data is uploaded.',
        balanceObservedHint: '* anchored at the first observation of the day.',
        balanceNoChange: 'no change',
        balanceHintLive: 'auto-refreshing {0}s',
        balanceCny: 'Recharge balance',
        balanceTotal: 'Total balance',
        balanceLow: 'Low balance',
        balanceSampleTime: 'Sample time',
        builtinPrice: 'built-in price',
        defaultFx: 'default FX ×{0}',
        sessionCount: 'Sessions',
        thisSessionCost: 'This session',
        capsuleHint: 'This session amount · click to open the billing popover',
        heatEmpty: 'No active days yet',
        spent: 'spent',
        remaining: 'left',
        overBudget: 'Over budget',
        peak: 'Peak',
        offPeak: 'Off-peak',
        peakHint: 'Beijing time: weekdays 09:00–12:00 and 14:00–18:00 are peak; weekends and statutory holidays are off-peak at 50%.',
        tabsOverview: 'Overview',
        tabsTrend: 'Trend',
        tabsDetail: 'Detail',
        range7d: '7 days',
        range30d: '30 days',
        rangeMonth: 'This month',
        rangeAll: 'All',
        heatmap: 'Active days',
        heatmapHint: 'Last 90 days, darker means more spent',
        topModels: 'By model',
        daily: 'By day',
        model: 'Model',
        provider: 'Provider',
        calls: 'Calls',
        tokens: 'Tokens',
        cost: 'Cost',
        share: 'Share',
        input: 'Input',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        output: 'Output',
        pricing: 'Price table',
        custom: 'Custom',
        builtin: 'Built-in',
        addPrice: 'Add custom price',
        addAlias: 'Add model alias',
        aliases: 'Model aliases',
        aliasRaw: 'Raw model',
        aliasCanonical: 'Map to',
        aliasRemove: 'Remove',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Remove',
        currency: 'Currency',
        noData: 'No usage yet',
        noDataHint: 'Send a message and token usage will appear here automatically.',
        estimated: 'Estimated',
        estimatedHint: 'History from before this plugin was installed is estimated with the price table recorded at install time and never repriced later.',
        unpriced: 'Unpriced models',
        unpricedHint: 'These models are not in the price table yet; their rows show — instead of guessing a price.',
        notLive: 'Prices are not live',
        notLiveHint: 'Network pricing is unavailable; the built-in price table and default exchange rate are in use.',
        noRemote: 'Billing data channel unavailable',
        noRemoteHint: 'The plugin UI is still usable, but amounts show an empty state until the Host channel mounts. Check the browser console for the [usage-billing] warning.',
        refresh: 'Refresh',
        settings: 'Preferences',
        entrySidebar: 'Show the sidebar entry',
        entryComposer: 'Show the composer capsule',
        includeSubagents: 'Include subagent sessions',
        includeSubagentsHint: 'Subagent sessions run on the same account and consume the same tokens.',
        showTierCurve: 'Show peak/off-peak chart',
        autoRefreshPricing: 'Refresh online prices automatically',
        budgetAmount: 'Budget amount (CNY)',
        budgetEnabled: 'Enable the monthly budget',
        prefsSaved: 'Saved',
        prefsFailed: 'Save failed',
        close: 'Close',
        viewFull: 'Open full billing page',
        todayDist: 'Today',
        thisProject: 'This project',
        otherProjects: 'Other projects',
        notice: 'Budget notice',
        notice50: 'You have used 50% of this month’s budget.',
        notice80: 'You have used 80% of this month’s budget.',
        notice100: 'You have used the whole month’s budget.',
        activeDays: 'active days',
        avgDaily: 'Avg per active day',
        inputSide: 'input side',
        totalTokens: 'Total tokens',
        showEmptyDays: 'Show empty days',
        hideEmptyDays: 'Hide empty days',
        monthBudget: 'Monthly budget',
        subagent: 'Subagent',
        workspace: 'Project',
        session: 'Session',
        loading: 'Loading…',
        ledgerLoading: 'Loading the ledger…',
        ledgerNotReady: 'The usage ledger is not ready yet',
        ledgerNotReadyHint: 'The storage domain is opening or retrying. Amounts stay at zero until it reports ready; refresh to retry now.',
        filterModel: 'Filter by model',
        sort: 'Sort',
        page: 'Page',
        prev: 'Previous',
        next: 'Next',
        estimateBadge: 'Estimated',
        detailDaily: 'By day',
        detailModel: 'By model',
        detailPricing: 'Price table',
        pricesNotLive: 'non-live price',
        livePrice: 'live price',
        schemaRuntime: 'validation',
        fx: 'USD→CNY',
      },
      zh: {
        nav: '计费',
        panelTitle: '用量计费',
        subtitle: '来自本机会话日志的真实 token 用量 · 价格写时锁定',
        today: '今日',
        thisMonth: '本月',
        cumulative: '累计',
        cacheRate: '缓存命中率',
        budget: '月度预算',
        budgetDisabled: '预算未启用（金额为 0）',
        methodNote: '按北京时间（UTC+8）归天与判档；节假日数据覆盖 2025–{0} 年。',
        subagentSuffix: '（含 {0} 子代理）',
        includeSubagentsTag: '含子代理',
        heatmapHintDays: '最近 {0} 天 · 颜色越深花费越多',
        tabsBalance: '钱包',
        balanceTitle: '实际余额',
        balanceShort: '余额',
        balanceLive: '实时',
        balanceBonus: '赠送余额',
        balanceUpdated: '更新于 {0}',
        balanceDelta: '较上次',
        balanceTodayCharged: '今日余额减少*',
        balanceTodayEstimate: '今日用量估算',
        balanceEstimateDiff: '估算 − 余额减少',
        balanceLoading: '正在读取账号余额…',
        balanceSignedOut: '登录 DeepSeek 账号后显示实际余额。',
        balanceUnavailable: '当前构建中账号余额服务不可用。',
        balanceFailed: '余额查询失败',
        balanceDisabled: '实际余额显示已关闭。',
        balanceRefresh: '刷新余额',
        balanceRefreshInterval: '自动刷新',
        balanceRefreshHint: '手动刷新始终立即执行；自动查询按此间隔进行。',
        balanceHistory: '余额变动记录',
        balanceHistoryEmpty: '还没有观察到余额变动。',
        balanceTopUp: '充值',
        balanceTopUpDay: '今日有充值',
        balanceTopUpHint: '今日观察到充值；实扣按余额下降累计。',
        balanceUsage: '查询用量',
        balanceNote: '余额来自 DeepSeek 账号接口；不会上传任何用量数据。',
        balanceObservedHint: '* 以当天第一次观测为锚点。',
        balanceNoChange: '无变化',
        balanceHintLive: '每 {0} 秒自动刷新',
        balanceCny: '充值余额',
        balanceTotal: '余额合计',
        balanceLow: '余额偏低',
        balanceSampleTime: '采样时间',
        builtinPrice: '内置价',
        defaultFx: '默认汇率 ×{0}',
        sessionCount: '会话数',
        thisSessionCost: '本会话金额',
        capsuleHint: '本会话金额 · 点开查看计费弹层',
        heatEmpty: '暂无活跃日期',
        spent: '已用',
        remaining: '剩余',
        overBudget: '已超支',
        peak: '高峰',
        offPeak: '空闲',
        peakHint: '北京时间工作日 09:00–12:00、14:00–18:00 为高峰价；其余时段（含周末与法定节假日）为空闲价 = 高峰价 × 50%。',
        tabsOverview: '概览',
        tabsTrend: '趋势',
        tabsDetail: '明细',
        range7d: '近 7 天',
        range30d: '近 30 天',
        rangeMonth: '本月',
        rangeAll: '全部',
        heatmap: '活跃度',
        heatmapHint: '最近 90 天，颜色越深花费越多',
        topModels: '分模型',
        daily: '逐日',
        model: '模型',
        provider: '提供方',
        calls: '调用',
        tokens: 'Token',
        cost: '金额',
        share: '占比',
        input: '输入',
        cacheRead: '缓存读',
        cacheWrite: '缓存写',
        output: '输出',
        pricing: '价目表',
        custom: '自定义',
        builtin: '内置',
        addPrice: '添加自定义单价',
        addAlias: '添加模型别名',
        aliases: '模型别名',
        aliasRaw: '原始模型',
        aliasCanonical: '映射到',
        aliasRemove: '移除',
        save: '保存',
        cancel: '取消',
        delete: '删除',
        currency: '币种',
        noData: '暂无用量',
        noDataHint: '发出消息后，这里会自动显示 token 用量。',
        estimated: '估算',
        estimatedHint: '插件安装前的历史记录按安装时的价目表估算，之后改价不会重算这些行。',
        unpriced: '未收录模型',
        unpricedHint: '价目表里还没有这些模型；对应行显示「—」，不会猜一个 0 记进账本。',
        notLive: '当前非实时价',
        notLiveHint: '联网取价不可用，正在使用内置价目与默认汇率。',
        noRemote: '数据通道不可用',
        noRemoteHint: '界面仍可使用，但在 Host 数据通道挂载前金额显示为空状态。请在浏览器 Console 查看带 [usage-billing] 前缀的告警。',
        refresh: '刷新',
        settings: '偏好设置',
        entrySidebar: '显示侧栏入口',
        entryComposer: '显示输入框下方胶囊',
        includeSubagents: '计入子代理会话',
        includeSubagentsHint: '子代理会话同样走当前账号、消耗同样的 token。',
        showTierCurve: '显示峰谷时段图',
        autoRefreshPricing: '自动联网刷新价目',
        budgetAmount: '预算金额（元）',
        budgetEnabled: '启用月度预算',
        prefsSaved: '已保存',
        prefsFailed: '保存失败',
        close: '关闭',
        viewFull: '打开完整计费页',
        todayDist: '今日分布',
        thisProject: '本项目',
        otherProjects: '其他项目',
        notice: '预算提醒',
        notice50: '本月预算已使用 50%。',
        notice80: '本月预算已使用 80%。',
        notice100: '本月预算已用完。',
        activeDays: '活跃天数',
        avgDaily: '活跃日均',
        inputSide: '输入侧',
        totalTokens: '总 token',
        showEmptyDays: '显示空白天',
        hideEmptyDays: '隐藏空白天',
        monthBudget: '月度预算',
        subagent: '子代理',
        workspace: '项目',
        session: '会话',
        loading: '加载中…',
        ledgerLoading: '正在载入账本…',
        ledgerNotReady: '账本尚未就绪',
        ledgerNotReadyHint: '存储域正在打开或重试中；就绪前金额显示为 0。点刷新可立即重试。',
        filterModel: '筛选模型',
        sort: '排序',
        page: '页',
        prev: '上一页',
        next: '下一页',
        estimateBadge: '估算',
        detailDaily: '逐日',
        detailModel: '按模型',
        detailPricing: '价目表',
        pricesNotLive: '非实时价',
        livePrice: '实时价',
        schemaRuntime: '校验引擎',
        fx: '美元兑人民币',
      },
    };

    let localeId = 'en';
    function t(key, ...args) {
      const dict = DICTS[localeId] ?? DICTS.en;
      let text = dict[key] ?? DICTS.en[key] ?? key;
      if (args.length > 0) {
        text = text.replace(/\{(\d+)\}/g, (match, index) => String(args[index] ?? ''));
      }
      return text;
    }

    /* ---------------------------------------------------------------- */
    /* Formatting                                                       */
    /* ---------------------------------------------------------------- */

    function isFiniteNumber(value) {
      return typeof value === 'number' && Number.isFinite(value);
    }

    function money(value) {
      if (!isFiniteNumber(value)) return '¥0.00';
      const abs = Math.abs(value);
      if (abs > 0 && abs < 0.01) return `¥${value.toFixed(4)}`;
      return `¥${value.toFixed(2)}`;
    }

    function moneyOrDash(value, priced) {
      return priced === false ? '—' : money(value);
    }

    function pct(value) {
      if (!isFiniteNumber(value)) return 0;
      return Math.max(0, Math.min(999, value));
    }

    function tokensShort(value) {
      if (!isFiniteNumber(value)) return '0';
      if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
      return String(Math.round(value));
    }

    function percentText(value) {
      return `${Math.round(pct(value) * 100)}%`;
    }

    function dayShort(day) {
      return typeof day === 'string' && day.length === 10 ? day.slice(5) : String(day ?? '');
    }

    function timeText(ms) {
      if (!isFiniteNumber(ms) || ms <= 0) return '';
      try {
        const date = new Date(ms);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hour}:${minute}`;
      } catch {
        return '';
      }
    }

    function budgetLevel(spent, monthly) {
      if (!isFiniteNumber(monthly) || monthly <= 0) return 'ok';
      const ratio = spent / monthly;
      return ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
    }

    function levelColor(level) {
      if (level === 'over') return 'var(--dsw-alias-state-error-primary)';
      if (level === 'warn') return 'var(--dsw-alias-state-warn-primary)';
      return 'var(--dsw-alias-brand-primary)';
    }

    /* ---------------------------------------------------------------- */
    /* Store                                                            */
    /* ---------------------------------------------------------------- */

    const DEFAULT_PREFS = {
      budgetEnabled: true,
      monthlyCny: 100,
      entrySidebar: true,
      entryComposer: true,
      includeSubagents: true,
      showTierCurve: true,
      autoRefreshPricing: true,
      balanceEnabled: true,
      balanceRefreshSeconds: 30,
    };

    const initialState = {
      connection: 'connecting',
      connectionError: null,
      queries: {},
      prefs: { ...DEFAULT_PREFS },
      prefsReady: false,
      sessionId: null,
      tick: 0,
      refreshNonce: 0,
      popoverOpen: false,
      noticeDismissed: null,
      balance: null,
      balanceAt: 0,
      balanceError: null,
      savedAt: 0,
      saveError: null,
    };

    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      const get = () => state;
      const set = (patch) => {
        const next = typeof patch === 'function' ? patch(state) : patch;
        if (next === state) return;
        state = { ...state, ...next };
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (error) {
            console.warn(`${LOG} store listener failed`, error);
          }
        }
      };
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      return { get, set, subscribe };
    }

    const store = createStore(initialState);

    function useStore(selector) {
      return useSyncExternalStore(
        store.subscribe,
        () => (selector === undefined ? store.get() : selector(store.get())),
        () => (selector === undefined ? store.get() : selector(store.get())),
      );
    }

    /* ---------------------------------------------------------------- */
    /* Remote channel                                                   */
    /* ---------------------------------------------------------------- */

    /** @type {Array<[string, string[]]>} */
    const METHOD_SPECS = [
      ['overview', ['rangeKind', 'includeSubagents', 'cwd']],
      ['sessionCost', ['sessionId', 'includeSubagents']],
      ['daily', ['rangeKind', 'includeSubagents']],
      ['byModel', ['rangeKind', 'includeSubagents']],
      ['byWorkspace', ['rangeKind', 'includeSubagents']],
      ['pricing', []],
      ['prefs', []],
      ['savePrefs', ['patch']],
      ['setCustomPrice', ['entry']],
      ['removeCustomPrice', ['key']],
      ['refreshPricing', ['force']],
      ['setAlias', ['input']],
      ['aliasList', []],
      ['repricing', []],
      ['status', []],
      ['dismissBackfill', []],
      ['dismissBudgetNotice', ['month']],
      ['balance', []],
      ['refreshBalance', ['force']],
    ];

    const JSON_CODEC = {
      mode: 'strict',
      typeSymbol: 'json',
      create: () => ({ parse: value => value }),
      schema: { parse: value => value },
    };
    const RESULT_CODEC = { mode: 'src-json' };

    let api = null;
    let remoteMounted = false;

    function mountContribution() {
      return {
        package: PKG,
        descriptors: METHOD_SPECS.map(([method, params]) => ({
          id: `${NS}.${method}`,
          service: NS,
          namespace: NS,
          method,
          invocation: { kind: 'direct' },
          parameters: params.map(name => ({ name, wire: name, source: 'json', codec: JSON_CODEC })),
          result: RESULT_CODEC,
        })),
      };
    }

    function warn(message, error) {
      if (error === undefined) console.warn(`${LOG} ${message}`);
      else console.warn(`${LOG} ${message}`, error);
    }

    async function rpc(method, ...args) {
      if (api === null) throw new Error('remote channel is not mounted');
      const fn = api[method];
      if (typeof fn !== 'function') throw new Error(`remote method ${method} is missing`);
      // Typert Remote answers with a result envelope:
      //   { ok: true, value } | { ok: false, error: { code, message } }
      const result = await fn(...args);
      if (result !== null && typeof result === 'object' && result.ok === false) {
        const error = result.error ?? {};
        throw new Error(`${error.code ?? 'remote/error'}${error.message === undefined ? '' : `: ${error.message}`}`);
      }
      if (result !== null && typeof result === 'object' && result.ok === true && 'value' in result) {
        return result.value;
      }
      return result;
    }

    const QUERY_TTL_MS = 12000;

    function queryState(key) {
      return store.get().queries[key];
    }

    async function refreshQuery(key, loader, ttlMs = QUERY_TTL_MS, force = false) {
      const existing = queryState(key);
      if (!force && existing !== undefined && existing.loading !== true && Date.now() - existing.at < ttlMs) {
        return existing.data;
      }
      if (existing !== undefined && existing.loading === true) return existing.data;
      store.set(state => ({
        queries: { ...state.queries, [key]: { ...(state.queries[key] ?? { data: null, at: 0 }), loading: true } },
      }));
      try {
        const data = await loader();
        store.set(state => ({ queries: { ...state.queries, [key]: { data, at: Date.now(), loading: false, error: null } } }));
        return data;
      } catch (error) {
        store.set(state => ({
          queries: { ...state.queries, [key]: { data: state.queries[key]?.data ?? null, at: Date.now(), loading: false, error: String(error?.message ?? error) } },
        }));
        throw error;
      }
    }

    function useQuery(key, loader, deps, ttlMs = QUERY_TTL_MS) {
      const state = useStore(s => s.queries[key]);
      const tick = useStore(s => s.tick);
      const ready = useStore(s => s.connection === 'ready');
      const nonce = useStore(s => s.refreshNonce ?? 0);
      const seenNonce = useRef(nonce);
      useEffect(() => {
        if (!ready) return;
        const force = seenNonce.current !== nonce;
        seenNonce.current = nonce;
        void refreshQuery(key, loader, ttlMs, force).catch(error => warn(`读取 ${key} 失败`, error));
      }, [key, ready, tick, nonce, ...deps]);
      return state ?? { data: null, loading: ready, error: null, at: 0 };
    }

    /* ---------------------------------------------------------------- */
    /* Data loaders (shared by every surface)                           */
    /* ---------------------------------------------------------------- */

    function prefsOf() {
      return store.get().prefs ?? DEFAULT_PREFS;
    }

    function loadPrefs() {
      return rpc('prefs').then((result) => {
        const prefs = result?.prefs ?? {};
        store.set(state => ({
          prefs: { ...DEFAULT_PREFS, ...prefs },
          prefsReady: result?.ready === true,
        }));
        return prefs;
      });
    }

    async function fetchOverviewRemote(rangeKind, includeSubagents, cwd) {
      const projectCwd = typeof cwd === 'string' && cwd !== '' ? cwd : null;
      const result = await rpc('overview', rangeKind, includeSubagents === false ? false : true, projectCwd);
      if (result?.prefs !== undefined) {
        store.set(state => ({ prefs: { ...DEFAULT_PREFS, ...result.prefs }, prefsReady: true }));
      }
      return result;
    }

    async function fetchSessionCostRemote(sessionId, includeSubagents) {
      return rpc('sessionCost', sessionId, includeSubagents === false ? false : true);
    }

    async function fetchDailyRemote(rangeKind, includeSubagents) {
      return rpc('daily', rangeKind, includeSubagents === false ? false : true);
    }

    async function fetchModelsRemote(rangeKind, includeSubagents) {
      return rpc('byModel', rangeKind, includeSubagents === false ? false : true);
    }

    async function fetchPricingRemote() {
      return rpc('pricing');
    }

    async function fetchAliasesRemote() {
      return rpc('aliasList');
    }

    async function fetchBalanceRemote() {
      return rpc('balance');
    }

    async function fetchRefreshBalanceRemote(force) {
      return rpc('refreshBalance', force === true);
    }

    async function dismissBudgetNotice(monthKey) {
      try {
        await rpc('dismissBudgetNotice', monthKey);
      } catch (error) {
        warn('dismiss budget notice failed', error);
      }
      // Hide optimistically in every cached snapshot that carries the notice;
      // the next refresh confirms it from the Host.
      store.set((state) => {
        const queries = { ...state.queries };
        for (const [key, value] of Object.entries(queries)) {
          if (value === undefined || value.data === null || value.data === undefined) continue;
          if (key.startsWith('overview:month:') && value.data.month !== undefined) {
            queries[key] = { ...value, data: { ...value.data, month: { ...value.data.month, notice: null } } };
          }
          if (key.startsWith('session:') && value.data.budget !== undefined) {
            queries[key] = { ...value, data: { ...value.data, budget: { ...value.data.budget, notice: null } } };
          }
        }
        return { queries, tick: state.tick + 1 };
      });
    }

    function refreshOverview(rangeKind, includeSubagents, cwd, force) {
      const key = `overview:${rangeKind}:${includeSubagents === false ? 0 : 1}:${typeof cwd === 'string' ? cwd : ''}`;
      return refreshQuery(key, () => fetchOverviewRemote(rangeKind, includeSubagents, cwd), QUERY_TTL_MS, force);
    }

    function refreshSessionCost(sessionId, includeSubagents) {
      const key = `session:${sessionId}:${includeSubagents === false ? 0 : 1}`;
      return refreshQuery(key, () => fetchSessionCostRemote(sessionId, includeSubagents), QUERY_TTL_MS);
    }

    function refreshDaily(rangeKind, includeSubagents) {
      const key = `daily:${rangeKind}:${includeSubagents === false ? 0 : 1}`;
      return refreshQuery(key, () => fetchDailyRemote(rangeKind, includeSubagents), QUERY_TTL_MS);
    }

    function refreshModels(rangeKind, includeSubagents) {
      const key = `models:${rangeKind}:${includeSubagents === false ? 0 : 1}`;
      return refreshQuery(key, () => fetchModelsRemote(rangeKind, includeSubagents), QUERY_TTL_MS);
    }

    function refreshPricing(force) {
      return refreshQuery('pricing', fetchPricingRemote, 30000, force);
    }

    function refreshAliases(force) {
      return refreshQuery('aliases', fetchAliasesRemote, 30000, force);
    }

    let balanceRequest = null;

    /** Load the actual wallet balance; coalesces concurrent callers. */
    function loadBalance(force) {
      if (api === null) return Promise.resolve(null);
      if (balanceRequest !== null) return balanceRequest;
      balanceRequest = (async () => {
        try {
          const data = force === true ? await fetchRefreshBalanceRemote(true) : await fetchBalanceRemote();
          store.set({ balance: data, balanceAt: Date.now(), balanceError: null });
          return data;
        } catch (error) {
          store.set({ balanceError: String(error?.message ?? error) });
          warn('读取实际余额失败', error);
          return null;
        } finally {
          balanceRequest = null;
        }
      })();
      return balanceRequest;
    }

    function refreshBalanceNow() {
      return loadBalance(true);
    }

    async function savePrefs(patch) {
      try {
        const result = await rpc('savePrefs', patch);
        if (result?.ok === true) {
          store.set(state => ({
            prefs: { ...state.prefs, ...(result.prefs ?? patch) },
            prefsReady: true,
            savedAt: Date.now(),
            saveError: null,
          }));
          store.set(state => ({ tick: state.tick + 1 }));
          return true;
        }
        throw new Error(result?.reason ?? 'save rejected');
      } catch (error) {
        warn('保存设置失败', error);
        store.set({ saveError: String(error?.message ?? error) });
        return false;
      }
    }

    function openPopover() {
      store.set({ popoverOpen: true });
    }

    function closePopover() {
      store.set({ popoverOpen: false });
    }

    /* ---------------------------------------------------------------- */
    /* Styles (theme tokens only; rendered as a React element)          */
    /* ---------------------------------------------------------------- */

    const CSS = `
      .ub-root { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
      .ub-page { height: 100%; overflow: auto; padding: 20px 24px 48px; background: var(--dsw-alias-bg-base); box-sizing: border-box; }
      .ub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
      .ub-title { margin: 0; font-size: 18px; font-weight: 600; }
      .ub-sub { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .ub-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .ub-grid-2 { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; }
      @media (max-width: 720px) { .ub-grid-2 { grid-template-columns: 1fr; } }
      .ub-row-2 { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
      .ub-row-2 > .ub-budget-card { flex: 1 1 340px; min-width: 0; }
      .ub-row-2 > .ub-heat-card { flex: 0 1 auto; min-width: 190px; }
      .ub-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 14px; min-width: 0; }
      .ub-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .ub-card-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
      .ub-stat-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .ub-stat-value { font-size: 22px; font-weight: 600; margin-top: 4px; letter-spacing: -0.01em; }
      .ub-stat-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
      .ub-muted { color: var(--dsw-alias-label-secondary); }
      .ub-small { font-size: 11px; }
      .ub-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1); margin: 14px 0 12px; }
      .ub-tab { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 7px 12px; font-size: 13px; cursor: pointer; border-radius: 8px 8px 0 0; }
      .ub-tab[data-active="true"] { color: var(--dsw-alias-label-primary); box-shadow: inset 0 -2px 0 var(--dsw-alias-brand-primary); font-weight: 600; }
      .ub-tab:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
      .ub-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
      .ub-seg button { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
      .ub-seg button[data-active="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 0 0 1px var(--dsw-alias-border-l1); font-weight: 600; }
      .ub-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; padding: 5px 10px; border-radius: 8px; cursor: pointer; }
      .ub-btn:hover { background: var(--dsw-alias-bg-layer-2); }
      .ub-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
      .ub-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); }
      .ub-btn-primary:hover { filter: brightness(1.08); }
      .ub-btn-danger { color: var(--dsw-alias-state-error-primary); }
      .ub-input, .ub-select { box-sizing: border-box; appearance: none; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; padding: 5px 8px; font-size: 12px; min-width: 0; }
      .ub-input:focus, .ub-select:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      .ub-progress { height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); overflow: hidden; }
      .ub-progress > i { display: block; height: 100%; border-radius: 999px; transition: width 160ms ease; }
      .ub-pill { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 4px 12px 4px 8px; font-size: 12px; cursor: pointer; line-height: 1.4; }
      .ub-pill:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .ub-pill strong { color: var(--dsw-alias-label-primary); font-weight: 600; }
      .ub-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; border-radius: 999px; padding: 1px 7px; border: 1px solid currentColor; }
      .ub-badge-est { color: var(--dsw-alias-state-warn-primary); }
      .ub-badge-live { color: var(--dsw-alias-state-success-primary); }
      .ub-balance-card { margin-top: 12px; }
      .ub-balance-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px; }
      .ub-balance-main { flex: 1 1 220px; min-width: 0; }
      .ub-balance-amount { font-size: 26px; font-weight: 650; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
      .ub-balance-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 3px; }
      .ub-balance-metric { min-width: 96px; }
      .ub-balance-metric b { font-size: 14px; }
      .ub-balance-metric span { display: block; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .ub-balance-links { display: flex; gap: 10px; font-size: 12px; }
      .ub-balance-links a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
      .ub-balance-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .ub-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent); animation: ub-pulse 2.4s ease-in-out infinite; }
      @keyframes ub-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      .ub-badge-muted { color: var(--dsw-alias-label-secondary); }
      .ub-badge-danger { color: var(--dsw-alias-state-error-primary); }
      .ub-banner { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 9px 12px; margin-bottom: 12px; font-size: 12px; background: var(--dsw-alias-bg-layer-2); }
      .ub-banner-warn { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent); }
      .ub-banner-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
      .ub-banner > b { flex: none; }
      .ub-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .ub-table th, .ub-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
      .ub-table th { color: var(--dsw-alias-label-secondary); font-weight: 600; cursor: pointer; user-select: none; }
      .ub-table th[data-sortable="false"] { cursor: default; }
      .ub-table tbody tr:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); }
      .ub-table td.ub-num, .ub-table th.ub-num { text-align: right; font-variant-numeric: tabular-nums; }
      .ub-empty { padding: 28px 8px; text-align: center; color: var(--dsw-alias-label-secondary); }
      .ub-empty b { display: block; color: var(--dsw-alias-label-primary); font-size: 14px; margin-bottom: 4px; }
      .ub-heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 10px); gap: 3px; }
      .ub-heat i { width: 10px; height: 10px; border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
      .ub-heat i[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent); }
      .ub-heat i[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }
      .ub-heat i[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 78%, transparent); }
      .ub-heat i[data-level="4"] { background: var(--dsw-alias-brand-primary); }
      .ub-bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
      .ub-bars > span { flex: 1; min-width: 2px; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
      .ub-bars i { display: block; border-radius: 3px 3px 0 0; background: var(--dsw-alias-brand-primary); min-height: 1px; }
      .ub-bars span[data-peak="true"] i { background: var(--dsw-alias-state-warn-primary); }
      .ub-legend { display: flex; gap: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .ub-modal-layer { position: fixed; inset: 0; pointer-events: auto; display: flex; align-items: flex-start; justify-content: center; padding: 8vh 16px 16px; background: color-mix(in srgb, #000 32%, transparent); z-index: 5; }
      .ub-modal { width: 100%; max-width: 460px; max-height: 80vh; overflow: auto; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: 0 18px 60px rgba(0,0,0,.28); padding: 16px; box-sizing: border-box; }
      .ub-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .ub-modal-title { font-size: 14px; font-weight: 600; }
      .ub-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 4px 0; }
      .ub-kv ul { list-style: none; margin: 0; padding: 0; }
      .ub-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
      .ub-field > label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .ub-switch { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .ub-switch:last-child { border-bottom: 0; }
      .ub-switch b { display: block; font-size: 12px; font-weight: 500; }
      .ub-switch span { display: block; font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 1px; }
      .ub-toggle { position: relative; flex: none; width: 34px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; }
      .ub-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: transform 120ms ease; }
      .ub-toggle[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: transparent; }
      .ub-toggle[data-on="true"]::after { transform: translateX(14px); background: var(--dsw-alias-bg-base); }
      .ub-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
      .ub-pager { display: flex; align-items: center; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      .ub-entry-icon { display: inline-flex; align-items: center; justify-content: center; }
      .ub-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; align-items: end; }
      .ub-divider { height: 1px; background: var(--dsw-alias-border-l1); margin: 12px 0; }
      .ub-notice-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-warn-primary); display: inline-block; }
      .ub-scroll-x { overflow-x: auto; }
      .ub-settings { padding: 4px 2px 24px; }
    `;

    function Styles() {
      return h('style', { key: 'ub-styles' }, CSS);
    }

    function clsx(...names) {
      return names.filter(Boolean).join(' ');
    }

    /* ---------------------------------------------------------------- */
    /* Primitives                                                       */
    /* ---------------------------------------------------------------- */

    function Card({ title, extra, children, className, ...rest }) {
      return h('div', { className: clsx('ub-card', className), ...rest },
        (title !== undefined || extra !== undefined)
          ? h('div', { className: 'ub-card-head' },
            h('span', { className: 'ub-card-title' }, title),
            extra ?? null)
          : null,
        children);
    }

    function Stat({ label, value, sub, tone }) {
      return h('div', { className: 'ub-card' },
        h('div', { className: 'ub-stat-label' }, label),
        h('div', { className: 'ub-stat-value', style: tone === undefined ? undefined : { color: tone } }, value),
        sub === undefined ? null : h('div', { className: 'ub-stat-sub' }, sub));
    }

    function Progress({ value, level, height }) {
      const color = levelColor(level ?? 'ok');
      const width = `${Math.min(100, Math.max(0, pct(value) * 100))}%`;
      return h('div', {
        className: 'ub-progress',
        style: height === undefined ? undefined : { height },
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(pct(value) * 100),
      }, h('i', { style: { width, background: color } }));
    }

    function Ring({ ratio, size = 18, level, stroke = 2.5 }) {
      const radius = (size - stroke) / 2;
      const circumference = 2 * Math.PI * radius;
      const filled = Math.min(1, Math.max(0, pct(ratio)));
      const color = levelColor(level ?? 'ok');
      return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': true },
        h('circle', {
          cx: size / 2, cy: size / 2, r: radius, fill: 'none',
          stroke: 'currentColor', strokeOpacity: 0.18, strokeWidth: stroke,
        }),
        h('circle', {
          cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: color,
          strokeWidth: stroke, strokeLinecap: 'round',
          strokeDasharray: `${circumference * filled} ${circumference}`,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
        }));
    }

    function Donut({ ratio, size = 16, level }) {
      const radius = size / 2 - 1.5;
      const circumference = 2 * Math.PI * radius;
      const filled = Math.min(1, Math.max(0, pct(ratio)));
      const color = levelColor(level ?? 'ok');
      return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': true },
        h('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 3 }),
        h('circle', {
          cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: color, strokeWidth: 3,
          strokeDasharray: `${circumference * filled} ${circumference}`,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
        }));
    }

    function Segmented({ value, options, onChange }) {
      return h('div', { className: 'ub-seg', role: 'tablist' }, options.map(option => h('button', {
        key: option.value,
        type: 'button',
        role: 'tab',
        'data-active': String(option.value === value),
        onClick: () => onChange(option.value),
      }, option.label)));
    }

    function Tabs({ value, tabs, onChange }) {
      return h('div', { className: 'ub-tabs', role: 'tablist' }, tabs.map(tab => h('button', {
        key: tab.value,
        type: 'button',
        role: 'tab',
        'data-active': String(tab.value === value),
        className: 'ub-tab',
        onClick: () => onChange(tab.value),
      }, tab.label)));
    }

    function Field({ label, hint, children }) {
      return h('div', { className: 'ub-field' },
        h('label', null, label),
        children,
        hint === undefined ? null : h('span', { className: 'ub-small ub-muted' }, hint));
    }

    function SwitchRow({ label, hint, checked, onChange }) {
      return h('div', { className: 'ub-switch' },
        h('div', null,
          h('b', null, label),
          hint === undefined ? null : h('span', null, hint)),
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked === true,
          'aria-label': label,
          'data-on': String(checked === true),
          className: 'ub-toggle',
          onClick: () => onChange(checked !== true),
        }));
    }

    function Button({ children, onClick, kind, disabled, title, type }) {
      return h('button', {
        type: type ?? 'button',
        className: clsx('ub-btn', kind === 'primary' && 'ub-btn-primary', kind === 'danger' && 'ub-btn-danger'),
        onClick,
        disabled: disabled === true,
        title,
      }, children);
    }

    function TextInput({ value, onChange, placeholder, type, width, min, step, ariaLabel }) {
      return h('input', {
        className: 'ub-input',
        value: value ?? '',
        type: type ?? 'text',
        placeholder,
        min,
        step,
        'aria-label': ariaLabel ?? placeholder,
        style: width === undefined ? undefined : { width },
        onChange: event => onChange(event.target.value),
      });
    }

    function Empty({ title, hint }) {
      return h('div', { className: 'ub-empty' },
        h('b', null, title ?? t('noData')),
        h('span', null, hint ?? t('noDataHint')));
    }

    function Banner({ tone, title, children, onDismiss }) {
      return h('div', { className: clsx('ub-banner', tone === 'warn' && 'ub-banner-warn', tone === 'danger' && 'ub-banner-danger') },
        h('b', null, title),
        h('span', { style: { flex: 1 } }, children),
        onDismiss === undefined ? null : h('button', {
          type: 'button', className: 'ub-btn', onClick: onDismiss, style: { padding: '1px 8px' },
        }, '×'));
    }

    function Kv({ items }) {
      return h('div', null, items.map((item, index) => h('div', { className: 'ub-kv', key: index },
        h('span', { className: 'ub-muted' }, item.label),
        h('b', null, item.value))));
    }

    function sortRows(rows, sortKey, sortDir, numeric) {
      if (sortKey === null || sortKey === undefined) return rows;
      const factor = sortDir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (numeric === true || (typeof av === 'number' && typeof bv === 'number')) {
          return ((av ?? 0) - (bv ?? 0)) * factor;
        }
        return String(av ?? '').localeCompare(String(bv ?? '')) * factor;
      });
    }

    function DataTable({ columns, rows, sortKey, sortDir, onSort, empty }) {
      if (rows.length === 0) return h(Empty, { title: empty?.title, hint: empty?.hint });
      return h('div', { className: 'ub-scroll-x' },
        h('table', { className: 'ub-table' },
          h('thead', null, h('tr', null, columns.map(column => h('th', {
            key: column.key,
            className: column.numeric === true ? 'ub-num' : undefined,
            'data-sortable': String(column.sortable !== false),
            onClick: column.sortable === false || onSort === undefined ? undefined : () => onSort(column.key, sortKey === column.key && sortDir === 'desc' ? 'asc' : 'desc'),
          }, column.label, sortKey === column.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')))),
          h('tbody', null, rows.map((row, index) => h('tr', { key: row.id ?? index },
            columns.map(column => h('td', {
              key: column.key,
              className: column.numeric === true ? 'ub-num' : undefined,
            }, column.render === undefined ? row[column.key] : column.render(row))))))));
    }

    function Pager({ page, pageCount, onChange }) {
      if (pageCount <= 1) return null;
      return h('div', { className: 'ub-pager' },
        h(Button, { onClick: () => onChange(Math.max(0, page - 1)), disabled: page <= 0 }, t('prev')),
        h('span', { className: 'ub-muted ub-small' }, `${t('page')} ${page + 1} / ${pageCount}`),
        h(Button, { onClick: () => onChange(Math.min(pageCount - 1, page + 1)), disabled: page >= pageCount - 1 }, t('next')));
    }

    /* ---------------------------------------------------------------- */
    /* Charts                                                           */
    /* ---------------------------------------------------------------- */

    function buildHeatmap(rows, days) {
      const levels = [0, 0, 0, 0, 0];
      const cells = days.map(day => ({ day, value: 0 }));
      const index = new Map(cells.map((cell, i) => [cell.day, i]));
      for (const row of rows) {
        const i = index.get(row.day);
        if (i !== undefined) cells[i].value += row.costCny;
      }
      const max = cells.reduce((best, cell) => Math.max(best, cell.value), 0);
      return cells.map((cell) => {
        if (max <= 0 || cell.value <= 0) return { ...cell, level: 0 };
        const ratio = cell.value / max;
        const level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
        return { ...cell, level };
      });
    }

    /**
     * A 90-day grid with one active week reads as "empty"; trim the window when
     * the ledger is younger so the visible cells are meaningful.
     */
    function sparseHeatmap(cells) {
      if (cells.length === 0) return cells;
      const active = cells.filter(cell => cell.level > 0).length;
      const width = active <= 2 ? 14 : active <= 7 ? 30 : 90;
      return cells.slice(Math.max(0, cells.length - width));
    }

    function Heatmap({ cells }) {
      if (cells.length === 0) return h(Empty, { title: t('heatEmpty') });
      return h('div', null,
        h('div', { className: 'ub-heat' }, cells.map(cell => h('i', {
          key: cell.day,
          'data-level': String(cell.level),
          title: `${cell.day} · ${money(cell.value)}`,
        }))),
        h('div', { className: 'ub-small ub-muted', style: { marginTop: 8 } }, t('heatmapHintDays', String(cells.length))));
    }

    function Bars({ days }) {
      if (days.length === 0) return h(Empty, { title: t('noData') });
      const max = days.reduce((best, day) => Math.max(best, day.costCny ?? 0), 0);
      return h('div', null,
        h('div', { className: 'ub-bars' }, days.map(day => h('span', {
          key: day.day,
          'data-peak': String(day.peak === true),
          title: `${day.day} · ${money(day.costCny)}`,
        }, h('i', { style: { height: max <= 0 ? '1px' : `${Math.max(2, (day.costCny / max) * 100)}%` } })))),
        h('div', { className: 'ub-row ub-small ub-muted', style: { justifyContent: 'space-between', marginTop: 6 } },
          h('span', null, days[0]?.day ?? ''),
          h('span', null, days[days.length - 1]?.day ?? '')));
    }

    function TierCurve({ tier, width = 320 }) {
      const day = tier?.day;
      if (day === undefined || day === null) {
        return h('div', { className: 'ub-small ub-muted' }, '—');
      }
      const height = 46;
      const padding = 6;
      const usable = width - padding * 2;
      const windows = Array.isArray(day.peakWindows) ? day.peakWindows : [];
      const ratio = Number(day.offPeakRatio ?? 0.5);
      return h('div', { style: { maxWidth: 520 } },
        h('svg', { width: '100%', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': t('peakHint') },
          h('rect', { x: padding, y: 8, width: usable, height: 20, rx: 5, fill: 'var(--dsw-alias-bg-layer-2)' }),
          windows.map((window, index) => {
            const from = Number(window[0]) / 1440;
            const to = Number(window[1]) / 1440;
            return h('rect', {
              key: index,
              x: padding + usable * from,
              y: 8,
              width: Math.max(1, usable * (to - from)),
              height: 20,
              rx: 3,
              fill: 'var(--dsw-alias-state-warn-primary)',
              fillOpacity: 0.85,
            });
          }),
          [0, 600, 1200, 1440].map((minute, index) => h('text', {
            key: `tick-${minute}`,
            x: padding + usable * (minute / 1440),
            y: 40,
            fontSize: 9,
            fill: 'var(--dsw-alias-label-secondary)',
            textAnchor: index === 0 ? 'start' : index === 3 ? 'end' : 'middle',
          }, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${minute % 60 === 0 ? '00' : String(minute % 60).padStart(2, '0')}`))),
        h('div', { className: 'ub-row ub-small ub-muted', style: { marginTop: 4 } },
          h('span', { className: 'ub-badge ub-badge-muted' }, `${t('peak')} ×1`),
          h('span', { className: 'ub-badge ub-badge-muted' }, `${t('offPeak')} ×${ratio}`),
          h('span', { style: { flex: 1 } }),
          h('span', { 'data-dsh-ub-tier': tier?.current ?? '' },
            tier?.current === 'offPeak' ? t('offPeak') : t('peak'),
            tier?.nextSwitchAt === null || tier?.nextSwitchAt === undefined ? '' : ` · ${timeText(tier.nextSwitchAt)}`)));
    }

    /* ---------------------------------------------------------------- */
    /* Shared data views                                                */
    /* ---------------------------------------------------------------- */

    function useOverview(rangeKind, ready, cwd) {
      const includeSubagents = useStore(s => s.prefs.includeSubagents !== false);
      const query = useQuery(
        `overview:${rangeKind}:${includeSubagents ? 1 : 0}:${typeof cwd === 'string' ? cwd : ''}`,
        () => fetchOverviewRemote(rangeKind, includeSubagents, cwd),
        [includeSubagents, cwd],
      );
      return { query, includeSubagents, overview: query.data };
    }

    /**
     * Project context for a root-scoped surface. Prefers the last conversation
     * the capsule remembered, then the newest listed session's cwd; null means
     * "unknown" and the UI hides the project/other split instead of showing a
     * misleading ¥0.00 for the project.
     */
    function useProjectCwd(props, preferredSessionId) {
      const remembered = useStore(state => state.sessionId);
      const list = props !== undefined && typeof props.useSessions === 'function'
        ? props.useSessions(state => state)
        : null;
      if (list === null || list.byId === undefined) return null;
      const byId = list.byId;
      const sessionId = preferredSessionId ?? remembered;
      const cwdOf = (id) => {
        const summary = byId[id];
        return typeof summary?.cwd === 'string' && summary.cwd !== '' ? summary.cwd : null;
      };
      if (sessionId !== null && sessionId !== undefined) {
        const cwd = cwdOf(sessionId);
        if (cwd !== null) return cwd;
      }
      if (Array.isArray(list.ids)) {
        for (const id of list.ids) {
          const cwd = cwdOf(id);
          if (cwd !== null) return cwd;
        }
      }
      return null;
    }

    function budgetView(overview) {
      const prefs = prefsOf();
      const spent = overview?.month?.spentCny ?? 0;
      const monthly = prefs.monthlyCny ?? overview?.month?.monthlyCny ?? 100;
      const enabled = prefs.budgetEnabled !== false && overview?.month?.enabled !== false && (prefs.monthlyCny ?? 0) > 0;
      const ratio = enabled && monthly > 0 ? spent / monthly : 0;
      return {
        enabled,
        monthly,
        spent,
        ratio,
        level: enabled ? budgetLevel(spent, monthly) : 'ok',
        remaining: Math.max(0, monthly - spent),
        notice: overview?.month?.notice ?? null,
        monthKey: overview?.month?.monthKey ?? '',
        includeSubagents: prefs.includeSubagents !== false,
      };
    }

    function BudgetBlock({ overview, compact }) {
      const budget = budgetView(overview);
      return h('div', null,
        h('div', { className: 'ub-row', style: { justifyContent: 'space-between', marginBottom: 6 } },
          h('span', { className: 'ub-stat-label' },
            t('budget'),
            budget.includeSubagents ? h('span', { className: 'ub-badge ub-badge-muted', style: { marginLeft: 6 } }, t('includeSubagentsTag')) : null),
          h('span', { className: 'ub-small' },
            h('b', null, money(budget.spent)),
            h('span', { className: 'ub-muted' }, ` / ${money(budget.monthly)}`))),
        h(Progress, { value: budget.ratio, level: budget.level, height: compact === true ? 6 : 8 }),
        h('div', { className: 'ub-row ub-small ub-muted', style: { justifyContent: 'space-between', marginTop: 5 } },
          h('span', null, budget.enabled
            ? (budget.ratio >= 1 ? t('overBudget') : `${percentText(budget.ratio)} ${t('spent')}`)
            : t('budgetDisabled')),
          h('span', null, budget.enabled ? `${t('remaining')} ${money(budget.remaining)}` : '')));
    }

    /** Today's call count: today's split, never the selected range's total. */
    function todayCallsOf(overview) {
      return overview?.todaySplit?.totalCalls ?? 0;
    }

    /** Card title follows the selected range instead of always saying "this month". */
    function rangeLabelText(range) {
      if (range === '7d') return t('range7d');
      if (range === '30d') return t('range30d');
      if (range === 'all') return t('rangeAll');
      return t('thisMonth');
    }

    function priceSourceBadge(overview) {
      const pricing = overview?.pricing;
      if (pricing === undefined || pricing === null) return null;
      if (pricing.live === true) {
        return h('span', { className: 'ub-badge ub-badge-live' }, t('livePrice'));
      }
      return h('span', { className: 'ub-badge ub-badge-muted', title: t('notLiveHint') },
        `${t('builtinPrice')} · ${t('defaultFx', String(pricing.usdToCny ?? 7.1))}`);
    }

    function StatGrid({ overview, range }) {
      const budget = budgetView(overview);
      const stats = overview?.overview ?? {};
      return h('div', { className: 'ub-grid' },
        h(Stat, {
          label: rangeLabelText(range),
          value: money(stats.totalCny),
          tone: budget.enabled && range === 'month' && budget.level !== 'ok' ? levelColor(budget.level) : undefined,
          sub: budget.enabled ? `${t('budget')} ${money(budget.monthly)}` : t('budgetDisabled'),
        }),
        h(Stat, { label: t('today'), value: money(stats.todayCny), sub: `${todayCallsOf(overview)} ${t('calls')}` }),
        h(Stat, {
          label: t('cumulative'),
          value: money(overview?.cumulative?.totalCny ?? 0),
          sub: `${overview?.cumulative?.sessions ?? 0} ${t('session')}${(overview?.cumulative?.subagentSessions ?? 0) > 0 ? t('subagentSuffix', overview.cumulative.subagentSessions) : ''} · ${overview?.cumulative?.workspaces ?? 0} ${t('workspace')}${overview?.overview?.hasBackfilled === true ? ` · ${t('estimateBadge')}` : ''}`,
        }),
        h(Stat, {
          label: t('cacheRate'),
          value: percentText(stats.cacheHitRate ?? 0),
          sub: `${t('cacheRead')} ${tokensShort(stats.tokens?.cacheRead ?? 0)} · ${t('inputSide')} ${tokensShort((stats.tokens?.input ?? 0) + (stats.tokens?.cacheRead ?? 0))}`,
        }));
    }

    function signedMoney(value) {
      if (!isFiniteNumber(value) || Math.abs(value) < 0.00005) return '¥0.00';
      return (value > 0 ? '+' : '−') + money(Math.abs(value));
    }

    function balanceHintView(balance) {
      if (balance === undefined || balance === null) return { tone: 'muted', text: t('balanceLoading') };
      if (balance.status === 'ready') return { tone: 'live', text: t('balanceLive') };
      if (balance.status === 'signedOut') return { tone: 'muted', text: t('balanceSignedOut') };
      if (balance.status === 'unavailable') return { tone: 'muted', text: t('balanceUnavailable') };
      if (balance.status === 'disabled') return { tone: 'muted', text: t('balanceDisabled') };
      if (balance.status === 'failed') return { tone: 'danger', text: t('balanceFailed') + (balance.error === null || balance.error === undefined ? '' : ': ' + balance.error) };
      return { tone: 'muted', text: t('balanceLoading') };
    }

    function balanceIsLive(balance) {
      return balance !== null && balance !== undefined && balance.status === 'ready' && isFiniteNumber(balance.totalCny);
    }

    function BalanceLinks({ links, compact }) {
      if (links === null || links === undefined) return null;
      const items = [];
      if (typeof links.topUpUrl === 'string' && links.topUpUrl !== '') {
        items.push(h('a', { key: 'topup', href: links.topUpUrl, target: '_blank', rel: 'noreferrer' }, t('balanceTopUp')));
      }
      if (typeof links.usageUrl === 'string' && links.usageUrl !== '') {
        items.push(h('a', { key: 'usage', href: links.usageUrl, target: '_blank', rel: 'noreferrer' }, t('balanceUsage')));
      }
      if (items.length === 0) return null;
      return h('div', { className: 'ub-balance-links', style: compact === true ? { marginTop: 6 } : undefined }, items);
    }

    function BalanceStrip() {
      const balance = useStore(s => s.balance);
      const prefs = useStore(s => s.prefs);
      const balanceError = useStore(s => s.balanceError);
      useEffect(() => { void loadBalance(false); }, []);
      if (prefs.balanceEnabled === false) return null;
      const hint = balanceHintView(balance);
      const live = balanceIsLive(balance);
      const bonus = isFiniteNumber(balance?.bonusCny) ? balance.bonusCny : 0;
      const seconds = balance?.refreshSeconds ?? prefs.balanceRefreshSeconds ?? 30;
      const delta = balance?.deltaCny;
      const sub = live
        ? t('balanceUpdated', timeText(balance.fetchedAt) || '—') + (delta === null || delta === undefined || Math.abs(delta) < 0.00005 ? '' : ' · ' + signedMoney(delta) + ' ' + t('balanceDelta'))
        : hint.text;
      return h(Card, {
        title: t('balanceTitle'),
        className: 'ub-balance-card',
        extra: h('span', { className: 'ub-balance-chip' },
          live ? h('i', { className: 'ub-live-dot', 'aria-hidden': true }) : null,
          live ? t('balanceHintLive', String(seconds)) : null,
          h(Button, { onClick: () => { void refreshBalanceNow(); }, title: t('balanceRefresh'), 'aria-label': t('balanceRefresh') }, t('balanceRefresh'))),
      },
      h('div', { className: 'ub-balance-row' },
        h('div', { className: 'ub-balance-main' },
          h('div', { className: 'ub-balance-amount' }, live ? money(balance.totalCny) : '—',
            live ? h('span', { className: 'ub-badge ub-badge-live' }, t('balanceLive')) : null,
            live && balance.totalCny < 5 ? h('span', { className: 'ub-badge ub-badge-danger' }, t('balanceLow')) : null),
          h('div', { className: 'ub-balance-sub' }, sub),
          bonus > 0 ? h('div', { className: 'ub-balance-sub' }, t('balanceBonus') + ' ' + money(bonus)) : null,
          h(BalanceLinks, { links: balance?.links, compact: true })),
        h('div', { className: 'ub-balance-metric' },
          h('b', null, isFiniteNumber(balance?.todaySpentCny) ? money(balance.todaySpentCny) : '—'),
          h('span', null, t('balanceTodayCharged'))),
        h('div', { className: 'ub-balance-metric' },
          h('b', null, isFiniteNumber(balance?.todayEstimatedCny) ? money(balance.todayEstimatedCny) : '—'),
          h('span', null, t('balanceTodayEstimate'))),
        h('div', { className: 'ub-balance-metric' },
          h('b', null, isFiniteNumber(balance?.estimateDiffCny) ? signedMoney(balance.estimateDiffCny) : '—'),
          h('span', null, t('balanceEstimateDiff')))),
      h('div', { className: 'ub-small ub-muted', style: { marginTop: 8 } },
        t('balanceNote') + (balance?.todayTopUp === true ? ' ' + t('balanceTopUpHint') : '') + (balance?.todayBaseline === 'today' ? ' ' + t('balanceObservedHint') : '') +
        (balanceError === null || balanceError === undefined ? '' : ' · ' + balanceError)));
    }

    function RangeSwitch({ value, onChange }) {
      return h(Segmented, {
        value,
        options: [
          { value: '7d', label: t('range7d') },
          { value: '30d', label: t('range30d') },
          { value: 'month', label: t('rangeMonth') },
          { value: 'all', label: t('rangeAll') },
        ],
        onChange,
      });
    }

    function OverviewTab({ ready, cwd, settingsMode }) {
      const [range, setRange] = useState('month');
      const { overview } = useOverview(range, ready, cwd);
      const daily = useQuery(`daily:${range}:${useStore(s => s.prefs.includeSubagents !== false) ? 1 : 0}`,
        () => fetchDailyRemote(range, prefsOf().includeSubagents !== false), [range]);
      const models = useQuery(`models:${range}:${useStore(s => s.prefs.includeSubagents !== false) ? 1 : 0}`,
        () => fetchModelsRemote(range, prefsOf().includeSubagents !== false), [range]);
      const showTierCurve = useStore(s => s.prefs.showTierCurve !== false);
      const budget = budgetView(overview);

      return h('div', null,
        h('div', { className: 'ub-row', style: { justifyContent: 'space-between', marginBottom: 10 } },
          h(RangeSwitch, { value: range, onChange: setRange }),
          priceSourceBadge(overview)),
        h(Markers, { overview, models: models.data, daily: daily.data }),
        h(StatGrid, { overview, range }),
        h(BalanceStrip),
        h('div', { className: 'ub-row-2', style: { marginTop: 12 } },
          h(Card, { title: t('budget'), className: 'ub-budget-card' },
            h(BudgetBlock, { overview }),
            showTierCurve
              ? h(Fragment, null,
                h('div', { className: 'ub-divider' }),
                h(TierCurve, { tier: overview?.tier }))
              : null,
            budget.notice !== null && budget.notice !== undefined && settingsMode !== true
              ? h(Banner, {
                tone: budget.notice >= 100 ? 'danger' : 'warn',
                title: t('notice'),
                onDismiss: () => { void dismissBudgetNotice(overview?.month?.monthKey ?? ''); },
              }, t(`notice${budget.notice}`))
              : null,
            settingsMode === true ? h(PreferencesBlock) : null),
          h(Card, { title: t('heatmap'), className: 'ub-heat-card' },
            h(Heatmap, { cells: sparseHeatmap(buildHeatmap(daily.data?.heatmap ?? [], daily.data?.heatmap?.map(cell => cell.day) ?? [])) }))),
        h(Card, {
          title: t('topModels'),
          extra: h('span', { className: 'ub-small ub-muted' }, `${models.data?.models?.length ?? 0}`),
          style: { marginTop: 12 },
        },
        h(DataTable, {
          columns: [
            { key: 'model', label: t('model'), render: row => h('span', null, row.model) },
            { key: 'calls', label: t('calls'), numeric: true },
            { key: 'tokens', label: t('totalTokens'), numeric: true, sortable: false, render: row => tokensShort(row.input + row.cacheRead + row.cacheWrite + row.output) },
            { key: 'costCny', label: t('cost'), numeric: true, render: row => moneyOrDash(row.costCny, row.priced) },
          ],
          rows: (models.data?.models ?? []).slice(0, 8),
          empty: { title: t('noData'), hint: t('noDataHint') },
        })),
        h('div', { className: 'ub-small ub-muted', style: { marginTop: 6 } },
          t('methodNote', String(overview?.tier?.holidayDataThrough ?? ''))));
    }

    function Markers({ overview, models, daily }) {
      const banners = [];
      if (overview?.overview?.hasBackfilled === true) {
        banners.push({ key: 'est', tone: 'warn', title: t('estimated'), text: t('estimatedHint') });
      }
      const unpriced = overview?.overview?.unpricedModels ?? [];
      if (unpriced.length > 0) {
        banners.push({ key: 'unpriced', tone: 'danger', title: t('unpriced'), text: `${t('unpricedHint')} ${unpriced.join(', ')}` });
      }
      if (overview?.pricing?.live === false && overview?.pricing !== undefined) {
        banners.push({ key: 'live', tone: 'warn', title: t('notLive'), text: t('notLiveHint') });
      }
      if (banners.length === 0) return null;
      return h('div', { style: { marginTop: 12 } }, banners.map(banner => h(Banner, {
        key: banner.key, tone: banner.tone, title: banner.title,
      }, banner.text)));
    }

    function TrendTab({ ready, cwd }) {
      const [range, setRange] = useState('30d');
      const [showEmptyDays, setShowEmptyDays] = useState(false);
      const includeSubagents = useStore(s => s.prefs.includeSubagents !== false);
      const { overview } = useOverview(range, ready, cwd);
      const daily = useQuery(`daily:${range}:${includeSubagents ? 1 : 0}`,
        () => fetchDailyRemote(range, includeSubagents), [range, includeSubagents]);
      const days = useMemo(() => {
        const points = daily.data?.days ?? [];
        const tier = overview?.tier;
        const peakWindows = Array.isArray(tier?.day?.peakWindows) ? tier.day.peakWindows : [];
        return points.map(point => {
          const parts = String(point.day).split('-').map(Number);
          const weekday = new Date(Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1)).getUTCDay();
          const holiday = false;
          const workday = tier?.day?.workday !== false && weekday !== 0 && weekday !== 6 && !holiday;
          return { ...point, peak: peakWindows.length > 0 && workday };
        });
      }, [daily.data, overview]);
      const visibleDays = showEmptyDays
        ? days
        : days.filter(day => (day.calls ?? 0) > 0 || (day.costCny ?? 0) > 0);
      const totals = overview?.overview ?? {};
      return h('div', null,
        h('div', { className: 'ub-row', style: { justifyContent: 'space-between', marginBottom: 10 } },
          h(RangeSwitch, { value: range, onChange: setRange }),
          h('div', { className: 'ub-row' },
            h('span', { className: 'ub-small ub-muted' }, `${t('avgDaily')} ${money(totals.avgDailyCny ?? 0)}`),
            h(Button, { onClick: () => setShowEmptyDays(value => !value) }, showEmptyDays ? t('hideEmptyDays') : t('showEmptyDays')))),
        h('div', { className: 'ub-grid', style: { marginBottom: 12 } },
          h(Stat, { label: t('totalTokens'), value: tokensShort((totals.tokens?.input ?? 0) + (totals.tokens?.cacheRead ?? 0) + (totals.tokens?.cacheWrite ?? 0) + (totals.tokens?.output ?? 0)) }),
          h(Stat, { label: t('cacheRate'), value: percentText(totals.cacheHitRate ?? 0) }),
          h(Stat, { label: t('activeDays'), value: `${totals.dayCount ?? 0}` }),
          h(Stat, { label: t('cost'), value: money(totals.totalCny ?? 0) })),
        h(Card, { title: t('daily') }, h(Bars, { days })),
        h(Card, { title: t('daily'), style: { marginTop: 12 } },
          h(DataTable, {
            columns: [
              { key: 'day', label: t('daily'), render: row => row.day },
              { key: 'calls', label: t('calls'), numeric: true },
              { key: 'input', label: t('input'), numeric: true, render: row => tokensShort(row.input) },
              { key: 'cacheRead', label: t('cacheRead'), numeric: true, render: row => tokensShort(row.cacheRead) },
              { key: 'output', label: t('output'), numeric: true, render: row => tokensShort(row.output) },
              { key: 'costCny', label: t('cost'), numeric: true, render: row => money(row.costCny) },
            ],
            rows: visibleDays,
            empty: { title: t('noData'), hint: t('noDataHint') },
          })));
    }

    function DetailTab({ ready, settingsMode }) {
      const [kind, setKind] = useState('daily');
      const [range, setRange] = useState('month');
      const includeSubagents = useStore(s => s.prefs.includeSubagents !== false);
      const [sortKey, setSortKey] = useState(null);
      const [sortDir, setSortDir] = useState('desc');
      const [page, setPage] = useState(0);
      const [query, setQuery] = useState('');
      const daily = useQuery(kind === 'daily' ? `daily:${range}:${includeSubagents ? 1 : 0}` : 'skip:daily',
        () => (kind === 'daily' ? fetchDailyRemote(range, includeSubagents) : Promise.resolve(null)), [kind, range, includeSubagents]);
      const models = useQuery(kind === 'model' ? `models:${range}:${includeSubagents ? 1 : 0}` : 'skip:models',
        () => (kind === 'model' ? fetchModelsRemote(range, includeSubagents) : Promise.resolve(null)), [kind, range, includeSubagents]);
      const pricing = useQuery('pricing', fetchPricingRemote, []);
      const aliases = useQuery('aliases', fetchAliasesRemote, []);
      const rows = useMemo(() => {
        if (kind === 'daily') {
          const points = daily.data?.days ?? [];
          const filtered = query.trim() === ''
            ? points
            : points.filter(point => String(point.day).includes(query.trim()));
          return sortRows(filtered, sortKey ?? 'day', sortDir, false).map(point => ({ ...point, id: point.day }));
        }
        if (kind === 'model') {
          const list = models.data?.models ?? [];
          const filtered = query.trim() === ''
            ? list
            : list.filter(row => `${row.model} ${row.provider}`.toLowerCase().includes(query.trim().toLowerCase()));
          return sortRows(filtered, sortKey ?? 'costCny', sortDir, true).map(row => ({ ...row, id: row.key }));
        }
        const entries = pricing.data?.rows ?? [];
        const filtered = query.trim() === ''
          ? entries
          : entries.filter(row => row.key.toLowerCase().includes(query.trim().toLowerCase()));
        // The price table reads alphabetically unless the user picked a column.
        return sortRows(filtered, sortKey ?? 'key', sortKey === null ? 'asc' : sortDir, false).map(row => ({ ...row, id: row.key }));
      }, [kind, daily.data, models.data, pricing.data, query, sortKey, sortDir]);
      const pageSize = 12;
      const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
      const paged = rows.slice(page * pageSize, page * pageSize + pageSize);
      useEffect(() => { setPage(0); }, [kind, query, range]);
      const columns = kind === 'daily'
        ? [
          { key: 'day', label: t('daily') },
          { key: 'calls', label: t('calls'), numeric: true },
          { key: 'input', label: t('input'), numeric: true, render: row => tokensShort(row.input) },
          { key: 'cacheRead', label: t('cacheRead'), numeric: true, render: row => tokensShort(row.cacheRead) },
          { key: 'cacheWrite', label: t('cacheWrite'), numeric: true, render: row => tokensShort(row.cacheWrite) },
          { key: 'output', label: t('output'), numeric: true, render: row => tokensShort(row.output) },
          { key: 'costCny', label: t('cost'), numeric: true, render: row => money(row.costCny) },
        ]
        : kind === 'model'
          ? [
            { key: 'model', label: t('model') },
            { key: 'provider', label: t('provider') },
            { key: 'calls', label: t('calls'), numeric: true },
            { key: 'tokens', label: t('totalTokens'), numeric: true, sortable: false, render: row => tokensShort(row.input + row.cacheRead + row.cacheWrite + row.output) },
            { key: 'costCny', label: t('cost'), numeric: true, render: row => moneyOrDash(row.costCny, row.priced) },
          ]
          : [
            { key: 'key', label: `${t('model')} / ${t('provider')}` },
            { key: 'input', label: t('input'), numeric: true, render: row => `${row.input}` },
            { key: 'cacheRead', label: t('cacheRead'), numeric: true, render: row => `${row.cacheRead}` },
            { key: 'cacheWrite', label: t('cacheWrite'), numeric: true, render: row => `${row.cacheWrite}` },
            { key: 'output', label: t('output'), numeric: true, render: row => `${row.output}` },
            { key: 'currency', label: t('currency') },
            {
              key: 'custom', label: '', sortable: false,
              render: row => pricing.data?.customKeys?.includes(row.key) === true
                ? h(Button, { kind: 'danger', onClick: () => { void removeCustomPrice(row.key); } }, t('delete'))
                : h('span', { className: 'ub-badge ub-badge-muted' }, t('builtin')),
            },
          ];
      return h('div', null,
        h('div', { className: 'ub-toolbar' },
          h(Segmented, {
            value: kind,
            options: [
              { value: 'daily', label: t('detailDaily') },
              { value: 'model', label: t('detailModel') },
              { value: 'pricing', label: t('detailPricing') },
            ],
            onChange: setKind,
          }),
          kind === 'pricing' ? null : h(RangeSwitch, { value: range, onChange: setRange }),
          h('span', { style: { flex: 1 } }),
          h(TextInput, { value: query, onChange: setQuery, placeholder: t('filterModel'), width: 150, ariaLabel: t('filterModel') }),
          kind === 'pricing'
            ? h('span', {
              className: 'ub-badge',
              style: { color: pricing.data?.live === true ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary)' },
              title: pricing.data?.live === true ? undefined : t('notLiveHint'),
            }, pricing.data?.live === true ? t('livePrice') : t('pricesNotLive'))
            : null,
          kind === 'pricing' ? h(Button, { kind: 'primary', onClick: () => { void refreshPricing(true).catch(error => warn('刷新价目失败', error)); } }, t('refresh')) : null),
        h('div', { style: { marginTop: 8 } },
          h(DataTable, {
            columns,
            rows: paged,
            sortKey,
            sortDir,
            onSort: (key, dir) => { setSortKey(key); setSortDir(dir); },
            empty: { title: t('noData'), hint: t('noDataHint') },
          }),
          h(Pager, { page, pageCount, onChange: setPage })),
        kind === 'pricing'
          ? h('div', { className: 'ub-grid-2', style: { marginTop: 12 } },
            h(Card, { title: t('addPrice') }, h(CustomPriceForm)),
            h(Card, { title: t('aliases') }, h(AliasEditor, { aliases: aliases.data?.aliases ?? [], reload: () => { void refreshAliases(true); } })))
          : null,
        kind === 'pricing'
          ? h('div', { className: 'ub-small ub-muted', style: { marginTop: 8 } },
            pricing.data?.live === false
              ? `${t('notLive')}: ${t('pricesNotLive')} · ${t('fx')} ${pricing.data?.usdToCny ?? '—'} · ${t('schemaRuntime')} ${pricing.data?.schemaRuntime ?? '—'}`
              : `${t('fx')} ${pricing.data?.usdToCny ?? '—'} · ${t('schemaRuntime')} ${pricing.data?.schemaRuntime ?? '—'}`)
          : null,
        settingsMode === true && kind === 'model'
          ? h('div', { className: 'ub-small ub-muted', style: { marginTop: 8 } }, t('subagent'))
          : null);
    }

    function PreferencesBlock() {
      const prefs = useStore(s => s.prefs);
      const savedAt = useStore(s => s.savedAt);
      const saveError = useStore(s => s.saveError);
      const [budget, setBudget] = useState(String(prefs.monthlyCny ?? 100));
      useEffect(() => { setBudget(String(prefs.monthlyCny ?? 100)); }, [prefs.monthlyCny]);
      const ratio = (() => {
        const overview = store.get().queries;
        for (const [key, value] of Object.entries(overview)) {
          if (key.startsWith('overview:month:') && value?.data?.month !== undefined) return value.data.month.spentCny;
        }
        return 0;
      })();
      const level = budgetLevel(ratio, Number(budget) || 0);
      return h('div', { style: { marginTop: 10 } },
        h('div', { className: 'ub-divider' }),
        h('b', { className: 'ub-small' }, t('settings')),
        h('div', { style: { marginTop: 8 } },
          h(SwitchRow, {
            label: t('budgetEnabled'),
            checked: prefs.budgetEnabled !== false,
            onChange: value => { void savePrefs({ budgetEnabled: value }); },
          }),
          h('div', { className: 'ub-field', style: { marginTop: 8 } },
            h('label', null, t('budgetAmount')),
            h('div', { className: 'ub-row' },
              h(TextInput, {
                value: budget,
                onChange: setBudget,
                type: 'number',
                min: 0,
                width: 110,
                ariaLabel: t('budgetAmount'),
              }),
              h(Button, { kind: 'primary', onClick: () => { void savePrefs({ monthlyCny: Number(budget) || 0 }); } }, t('save')))),
          h(Progress, { value: level === 'over' ? 1 : ratio / (Number(budget) || 1), level }),
          h(SwitchRow, {
            label: t('entrySidebar'),
            checked: prefs.entrySidebar !== false,
            onChange: value => { void savePrefs({ entrySidebar: value }); },
          }),
          h(SwitchRow, {
            label: t('entryComposer'),
            checked: prefs.entryComposer !== false,
            onChange: value => { void savePrefs({ entryComposer: value }); },
          }),
          h(SwitchRow, {
            label: t('includeSubagents'),
            hint: t('includeSubagentsHint'),
            checked: prefs.includeSubagents !== false,
            onChange: value => { void savePrefs({ includeSubagents: value }); },
          }),
          h(SwitchRow, {
            label: t('showTierCurve'),
            checked: prefs.showTierCurve !== false,
            onChange: value => { void savePrefs({ showTierCurve: value }); },
          }),
          h(SwitchRow, {
            label: t('autoRefreshPricing'),
            checked: prefs.autoRefreshPricing !== false,
            onChange: value => { void savePrefs({ autoRefreshPricing: value }); },
          }),
          saveError !== null && saveError !== undefined
            ? h('div', { className: 'ub-small', style: { color: levelColor('over') } }, `${t('prefsFailed')}: ${saveError}`)
            : savedAt > 0 ? h('div', { className: 'ub-small ub-muted' }, t('prefsSaved')) : null));
    }

    function CustomPriceForm() {
      const [form, setForm] = useState({ provider: '', model: '', input: '0', cacheRead: '0', cacheWrite: '0', output: '0', currency: 'CNY' });
      const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
      const submit = () => {
        if (form.provider.trim() === '' || form.model.trim() === '') return;
        void rpc('setCustomPrice', {
          provider: form.provider.trim(),
          model: form.model.trim(),
          input: Number(form.input) || 0,
          cacheRead: Number(form.cacheRead) || 0,
          cacheWrite: Number(form.cacheWrite) || 0,
          output: Number(form.output) || 0,
          currency: form.currency,
        }).then(() => {
          setForm({ provider: '', model: '', input: '0', cacheRead: '0', cacheWrite: '0', output: '0', currency: 'CNY' });
          void refreshPricing(true);
          void refreshAliases(true);
          store.set(state => ({ tick: state.tick + 1 }));
        }).catch(error => warn('添加自定义单价失败', error));
      };
      return h('div', null,
        h('div', { className: 'ub-form-grid' },
          h(Field, { label: t('provider') }, h(TextInput, { value: form.provider, onChange: value => update('provider', value), placeholder: 'deepseek-account' })),
          h(Field, { label: t('model') }, h(TextInput, { value: form.model, onChange: value => update('model', value), placeholder: 'deepseek-flash' })),
          h(Field, { label: t('input') }, h(TextInput, { value: form.input, onChange: value => update('input', value), type: 'number', step: '0.01' })),
          h(Field, { label: t('cacheRead') }, h(TextInput, { value: form.cacheRead, onChange: value => update('cacheRead', value), type: 'number', step: '0.01' })),
          h(Field, { label: t('cacheWrite') }, h(TextInput, { value: form.cacheWrite, onChange: value => update('cacheWrite', value), type: 'number', step: '0.01' })),
          h(Field, { label: t('output') }, h(TextInput, { value: form.output, onChange: value => update('output', value), type: 'number', step: '0.01' })),
          h(Field, { label: t('currency') }, h('select', {
            className: 'ub-select',
            value: form.currency,
            onChange: event => update('currency', event.target.value),
          }, h('option', { value: 'CNY' }, 'CNY'), h('option', { value: 'USD' }, 'USD')))),
        h('div', { className: 'ub-row', style: { marginTop: 8 } },
          h(Button, { kind: 'primary', onClick: submit }, t('addPrice')),
          h('span', { className: 'ub-small ub-muted' }, t('input'))));
    }

    function AliasEditor({ aliases, reload }) {
      const [form, setForm] = useState({ provider: '', rawModel: '', canonicalModel: '' });
      const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
      const submit = () => {
        if (form.provider.trim() === '' || form.rawModel.trim() === '' || form.canonicalModel.trim() === '') return;
        void rpc('setAlias', {
          provider: form.provider.trim(),
          rawModel: form.rawModel.trim(),
          canonicalModel: form.canonicalModel.trim(),
        }).then(() => {
          setForm({ provider: '', rawModel: '', canonicalModel: '' });
          reload();
          store.set(state => ({ tick: state.tick + 1 }));
        }).catch(error => warn('添加模型别名失败', error));
      };
      return h('div', null,
        h('div', { className: 'ub-form-grid' },
          h(Field, { label: t('provider') }, h(TextInput, { value: form.provider, onChange: value => update('provider', value), placeholder: 'deepseek-account' })),
          h(Field, { label: t('aliasRaw') }, h(TextInput, { value: form.rawModel, onChange: value => update('rawModel', value), placeholder: 'deepseek-flash' })),
          h(Field, { label: t('aliasCanonical') }, h(TextInput, { value: form.canonicalModel, onChange: value => update('canonicalModel', value), placeholder: 'deepseek-v4-flash' }))),
        h('div', { className: 'ub-row', style: { marginTop: 8 } }, h(Button, { kind: 'primary', onClick: submit }, t('addAlias'))),
        aliases.length > 0
          ? h('div', { style: { marginTop: 10 } }, aliases.map(alias => h('div', { className: 'ub-kv', key: `${alias.provider}/${alias.rawModel}` },
            h('span', { className: 'ub-small' }, `${alias.provider}/${alias.rawModel} → ${alias.canonicalModel}`),
            h(Button, {
              kind: 'danger',
              onClick: () => {
                void rpc('setAlias', { provider: alias.provider, rawModel: alias.rawModel, canonicalModel: null })
                  .then(() => { reload(); store.set(state => ({ tick: state.tick + 1 })); })
                  .catch(error => warn('移除模型别名失败', error));
              },
            }, t('aliasRemove')))))
          : null);
    }

    async function removeCustomPrice(key) {
      try {
        await rpc('removeCustomPrice', key);
        await refreshPricing(true);
        store.set(state => ({ tick: state.tick + 1 }));
      } catch (error) {
        warn('移除自定义单价失败', error);
      }
    }

    /* ---------------------------------------------------------------- */
    /* Billing page (main panel + settings section share it)            */
    /* ---------------------------------------------------------------- */

    function WalletTab({ ready }) {
      const balance = useStore(s => s.balance);
      const prefs = useStore(s => s.prefs);
      const balanceError = useStore(s => s.balanceError);
      useEffect(() => { void loadBalance(false); }, []);
      if (!ready) return h(Empty, { title: t('loading') });
      const live = balanceIsLive(balance);
      const hint = balanceHintView(balance);
      const wallets = Array.isArray(balance?.wallets) ? balance.wallets : [];
      const walletCny = wallets.filter(wallet => wallet.currency === 'CNY').reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0);
      const bonus = isFiniteNumber(balance?.bonusCny) ? balance.bonusCny : 0;
      const seconds = prefs.balanceRefreshSeconds ?? 30;
      const history = Array.isArray(balance?.history) ? balance.history : [];
      const historyRows = history.map((point, index) => {
        const previous = index > 0 ? history[index - 1] : null;
        return {
          at: point.at,
          time: timeText(point.at),
          total: point.totalCny,
          delta: previous === null ? null : point.totalCny - previous.totalCny,
        };
      }).reverse();
      const items = [
        { label: t('balanceCny'), value: live ? money(walletCny) : '—' },
      ].filter(Boolean);
      if (bonus > 0) items.push({ label: t('balanceBonus'), value: money(bonus) });
      items.push(
        { label: t('balanceTotal'), value: live ? money(balance.totalCny) : '—' },
        { label: t('balanceDelta'), value: isFiniteNumber(balance?.deltaCny) ? signedMoney(balance.deltaCny) : '—' },
        { label: t('balanceTodayCharged'), value: isFiniteNumber(balance?.todaySpentCny) ? money(balance.todaySpentCny) : '—' },
        ...(balance?.todayTopUp === true ? [{ label: t('balanceTopUpDay'), value: '✓' }] : []),
        { label: t('balanceTodayEstimate'), value: isFiniteNumber(balance?.todayEstimatedCny) ? money(balance.todayEstimatedCny) : '—' },
        { label: t('balanceEstimateDiff'), value: isFiniteNumber(balance?.estimateDiffCny) ? signedMoney(balance.estimateDiffCny) : '—' },
        { label: t('balanceSampleTime'), value: timeText(balance?.fetchedAt) || '—' },
      );
      return h('div', null,
        h(Card, { title: t('balanceTitle'), extra: h(Button, { onClick: () => { void refreshBalanceNow(); } }, t('balanceRefresh')) },
          h('div', { className: 'ub-row', style: { justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' } },
            h('div', null,
              h('div', { className: 'ub-balance-amount' }, live ? money(balance.totalCny) : '—'),
              h('div', { className: 'ub-balance-sub' }, live ? t('balanceUpdated', timeText(balance.fetchedAt) || '—') : hint.text)),
            h(BalanceLinks, { links: balance?.links })),
          h('div', { style: { marginTop: 10 } }, h(Kv, { items }))),
        h(Card, { title: t('balanceRefreshInterval'), style: { marginTop: 12 } },
          h(SwitchRow, {
            label: t('balanceTitle'),
            checked: prefs.balanceEnabled !== false,
            onChange: value => { void savePrefs({ balanceEnabled: value }); },
          }),
          h(Segmented, {
            value: String(seconds),
            options: [15, 30, 60, 120].map(value => ({ value: String(value), label: String(value) + 's' })),
            onChange: value => { void savePrefs({ balanceRefreshSeconds: Number(value) }); },
          }),
          h('div', { className: 'ub-small ub-muted', style: { marginTop: 6 } }, t('balanceRefreshHint'))),
        h(Card, { title: t('balanceHistory'), style: { marginTop: 12 } },
          historyRows.length === 0
            ? h(Empty, { title: t('balanceHistoryEmpty') })
            : h(DataTable, {
              columns: [
                { key: 'time', label: t('balanceSampleTime'), render: row => row.time },
                { key: 'total', label: t('balanceTotal'), numeric: true, render: row => money(row.total) },
                { key: 'delta', label: t('balanceDelta'), numeric: true, render: row => row.delta === null ? '—' : signedMoney(row.delta) },
              ],
              rows: historyRows.slice(0, 40),
              empty: { title: t('balanceHistoryEmpty'), hint: t('balanceNote') },
            })),
        h('div', { className: 'ub-small ub-muted', style: { marginTop: 8 } },
          t('balanceNote') + (balanceError === null || balanceError === undefined ? '' : ' · ' + balanceError)));
    }

    function BillingPage({ mode, close, sessionCwd }) {
      const connection = useStore(s => s.connection);
      const connectionError = useStore(s => s.connectionError);
      const prefs = useStore(s => s.prefs);
      const [tab, setTab] = useState('overview');
      const ready = connection === 'ready';
      const queryError = useStore((state) => {
        for (const value of Object.values(state.queries)) {
          if (value !== undefined && value.error !== null && value.error !== undefined) return value.error;
        }
        return null;
      });
      const ledgerState = useStore((state) => {
        let seen = false;
        for (const [key, value] of Object.entries(state.queries)) {
          if (!key.startsWith('overview:month:')) continue;
          if (value === undefined || value.data === null || value.data === undefined) continue;
          seen = true;
          if (value.data.ready === false) return 'not-ready';
        }
        return seen ? 'ready' : 'loading';
      });
      const settingsMode = mode === 'settings';
      return h('div', { className: clsx('ub-root', settingsMode ? 'ub-settings' : 'ub-page'), 'data-dsh-usage-billing': mode ?? 'panel' },
        h(Styles),
        h('div', { className: 'ub-head' },
          h('div', null,
            h('h1', { className: 'ub-title' }, settingsMode ? t('nav') : t('panelTitle')),
            h('p', { className: 'ub-sub' }, t('subtitle'))),
          h('div', { className: 'ub-row' },
            settingsMode && close !== undefined ? h(Button, { onClick: () => { close(); } }, t('close')) : null,
            mode !== 'settings'
              ? h(Button, { onClick: () => { store.set(state => ({ tick: state.tick + 1, refreshNonce: (state.refreshNonce ?? 0) + 1 })); void refreshBalanceNow(); } }, t('refresh'))
              : null)),
        connection !== 'ready'
          ? h(Banner, { tone: connection === 'failed' ? 'danger' : 'warn', title: t('noRemote') },
            `${t('noRemoteHint')}${connectionError === null ? '' : ` (${connectionError})`}`)
          : null,
        connection === 'connecting' ? h(Banner, { title: t('loading') }, '') : null,
        connection === 'ready' && ledgerState === 'loading' && ready
          ? h(Banner, { title: t('ledgerLoading') }, '')
          : null,
        connection === 'ready' && ledgerState === 'not-ready'
          ? h(Banner, {
            tone: 'warn',
            title: t('ledgerNotReady'),
            onDismiss: undefined,
          }, t('ledgerNotReadyHint'))
          : null,
        connection === 'ready' && queryError !== null
          ? h(Banner, {
            tone: 'warn',
            title: t('noRemote'),
            onDismiss: undefined,
          }, `${t('noRemoteHint')} (${queryError})`)
          : null,
        h(Tabs, {
          value: tab,
          tabs: [
            { value: 'overview', label: t('tabsOverview') },
            { value: 'trend', label: t('tabsTrend') },
            { value: 'detail', label: t('tabsDetail') },
            { value: 'wallet', label: t('tabsBalance') },
          ],
          onChange: setTab,
        }),
        tab === 'overview' ? h(OverviewTab, { ready, cwd: sessionCwd, settingsMode }) : null,
        tab === 'trend' ? h(TrendTab, { ready, cwd: sessionCwd }) : null,
        tab === 'detail' ? h(DetailTab, { ready, settingsMode }) : null,
        tab === 'wallet' ? h(WalletTab, { ready }) : null);
    }

    /** Root-scoped billing surface: derives the project cwd from slot contexts. */
    function SlotBillingPage(props) {
      const cwd = useProjectCwd(props);
      return h(BillingPage, { ...props, sessionCwd: cwd });
    }

    /* ---------------------------------------------------------------- */
    /* Sidebar entry icon                                              */
    /* ---------------------------------------------------------------- */

    function SidebarEntryIcon(props) {
      const size = props.size ?? 16;
      const overviewKeyPrefix = 'overview:month:';
      const queries = useStore(s => s.queries);
      const prefs = useStore(s => s.prefs);
      const connection = useStore(s => s.connection);
      const balance = useStore(s => s.balance);
      const includeSubagents = prefs.includeSubagents !== false;
      // Keep the entry tooltip/ring fresh even when the panel has never been
      // opened; the shared heartbeat refreshes this query like any other.
      const sidebarOverview = useQuery(
        `overview:month:${includeSubagents ? 1 : 0}:`,
        () => fetchOverviewRemote('month', includeSubagents, null),
        [includeSubagents],
      );
      let ratio = 0;
      let level = 'ok';
      const sidebarMonth = sidebarOverview.data?.month;
      if (sidebarMonth !== undefined && sidebarMonth !== null) {
        const monthly = prefs.monthlyCny ?? sidebarMonth.monthlyCny ?? 100;
        ratio = monthly > 0 ? sidebarMonth.spentCny / monthly : 0;
        level = budgetLevel(sidebarMonth.spentCny, monthly);
      } else {
        for (const [key, value] of Object.entries(queries)) {
          if (!key.startsWith(overviewKeyPrefix)) continue;
          const month = value?.data?.month;
          if (month === undefined || month === null) continue;
          const monthly = prefs.monthlyCny ?? month.monthlyCny ?? 100;
          ratio = monthly > 0 ? month.spentCny / monthly : 0;
          level = budgetLevel(month.spentCny, monthly);
          break;
        }
      }
      if (connection !== 'ready' || prefs.budgetEnabled === false) {
        return h('span', { className: 'ub-entry-icon', style: { color: 'currentColor' } },
          h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
            h('path', { d: 'M8 4.5v7M6 6.2c0-.8.9-1.4 2-1.4s2 .6 2 1.4-.9 1.2-2 1.6-2 .8-2 1.6.9 1.4 2 1.4 2-.6 2-1.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })));
      }
      return h('span', { className: 'ub-entry-icon', style: { color: 'currentColor' }, title: balanceIsLive(balance) ? `${percentText(ratio)} · ${t('balanceShort')} ${money(balance.totalCny)}` : `${percentText(ratio)}` },
        h(Ring, { ratio, size, level, stroke: 2.4 }));
    }

    /* ---------------------------------------------------------------- */
    /* Composer capsule                                                */
    /* ---------------------------------------------------------------- */

    function ComposerCapsule(props) {
      const sessionId = props.sessionId;
      const cwd = useProjectCwd(props, sessionId);
      const connection = useStore(s => s.connection);
      const prefs = useStore(s => s.prefs);
      const includeSubagents = prefs.includeSubagents !== false;
      const query = useQuery(`session:${sessionId}:${includeSubagents ? 1 : 0}`,
        () => fetchSessionCostRemote(sessionId, includeSubagents), [sessionId, includeSubagents]);
      // Root-scoped surfaces opened later reuse this as the project context.
      useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId === '') return;
        store.set(state => (state.sessionId === sessionId ? state : { sessionId }));
      }, [sessionId]);
      const data = query.data;
      const cost = data?.costCny ?? 0;
      const budget = data?.budget ?? null;
      const monthly = budget?.monthlyCny ?? prefs.monthlyCny ?? 100;
      const ratio = monthly > 0 ? (budget?.spentCny ?? 0) / monthly : 0;
      const level = budget?.level ?? budgetLevel(budget?.spentCny ?? 0, monthly);
      const popoverOpen = useStore(s => s.popoverOpen);
      const balance = useStore(s => s.balance);
      const showNotice = budget?.notice !== null && budget?.notice !== undefined;
      if (prefs.entryComposer === false) return null;
      return h(Fragment, null,
        h(Styles),
        showNotice
          ? h('div', { className: 'ub-banner ub-banner-warn', style: { marginBottom: 6 } },
            h('b', null, t('notice')),
            h('span', { style: { flex: 1 } }, t(`notice${budget.notice}`)),
            h('button', {
              type: 'button',
              className: 'ub-btn',
              style: { padding: '1px 8px' },
              onClick: () => { void dismissBudgetNotice(budget.monthKey ?? ''); },
            }, '×'))
          : null,
        h('button', {
          type: 'button',
          className: 'ub-pill',
          'data-dsh-ub-capsule': 'true',
          'aria-haspopup': 'dialog',
          'aria-expanded': popoverOpen === true,
          'aria-label': balanceIsLive(balance) ? t('balanceShort') + ' ' + money(balance.totalCny) + ' · ' + t('capsuleHint') : t('capsuleHint'),
          title: balanceIsLive(balance) ? t('balanceShort') + ' ' + money(balance.totalCny) + ' · ' + t('capsuleHint') : t('capsuleHint'),
          onClick: () => {
            void refreshSessionCost(sessionId, includeSubagents);
            if (api !== null) void rpc('overview', 'month', includeSubagents, typeof cwd === 'string' ? cwd : null).then(result => {
              store.set(state => ({ queries: { ...state.queries, [`overview:month:${includeSubagents ? 1 : 0}:${typeof cwd === 'string' ? cwd : ''}`]: { data: result, at: Date.now(), loading: false, error: null } } }));
            }).catch(error => warn('读取弹层数据失败', error));
            openPopover();
          },
        },
        h(Donut, { ratio, size: 14, level }),
        h('span', { className: 'ub-muted' }, `${t('session')}`),
        h('strong', null, money(cost)),
        balanceIsLive(balance)
          ? h('span', { className: 'ub-small ub-muted', style: { marginLeft: 6 } }, `${t('balanceShort')} ${money(balance.totalCny)}`)
          : null,
        connection !== 'ready' ? h('span', { className: 'ub-badge ub-badge-muted' }, '—') : null));
    }

    /* ---------------------------------------------------------------- */
    /* Popover (shell.overlay)                                         */
    /* ---------------------------------------------------------------- */

    function PopoverHost(props) {
      const open = useStore(s => s.popoverOpen);
      const connection = useStore(s => s.connection);
      const prefs = useStore(s => s.prefs);
      const sessionId = useStore(s => s.sessionId);
      const cwd = useProjectCwd(props, sessionId);
      const queries = useStore(s => s.queries);
      const includeSubagents = prefs.includeSubagents !== false;
      const overview = useMemo(() => {
        let newest = null;
        for (const [key, value] of Object.entries(queries)) {
          if (!key.startsWith('overview:month:')) continue;
          if (value?.data === null || value?.data === undefined) continue;
          if (newest === null || value.at > newest.at) newest = { data: value.data, at: value.at };
        }
        return newest?.data ?? null;
      }, [queries]);
      const sessionCost = sessionId === null ? null : queries[`session:${sessionId}:${includeSubagents ? 1 : 0}`]?.data ?? null;
      const balance = useStore(s => s.balance);
      useEffect(() => {
        if (!open) return undefined;
        const previous = typeof document !== 'undefined' ? /** @type {HTMLElement | null} */ (document.activeElement) : null;
        const dialog = /** @type {HTMLElement | null} */ (document.querySelector('[data-dsh-ub-popover="true"] [data-dsh-ub-dialog]'));
        const focusables = () => /** @type {HTMLElement[]} */ (dialog === null ? [] : Array.from(dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )));
        const onKey = (event) => {
          if (event.key === 'Escape') { closePopover(); return; }
          if (event.key !== 'Tab' || dialog === null) return;
          const items = focusables();
          if (items.length === 0) { event.preventDefault(); dialog.focus(); return; }
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        const timer = setTimeout(() => {
          const close = /** @type {HTMLElement | null} */ (dialog?.querySelector('[data-ub-close]') ?? null);
          (close ?? dialog)?.focus?.();
        }, 30);
        void refreshOverview('month', includeSubagents, cwd).catch(error => warn('refresh popover overview failed', error));
        void loadBalance(false);
        return () => {
          clearTimeout(timer);
          document.removeEventListener('keydown', onKey, true);
          if (previous !== null && typeof previous.focus === 'function') previous.focus();
        };
      }, [open]);
      if (!open) return null;
      const budget = budgetView(overview);
      const todaySplit = overview?.todaySplit ?? {};
      const tiers = overview?.tier ?? null;
      const unpriced = overview?.overview?.unpricedModels ?? [];
      const layout = openPanelRef.current;
      return h(Fragment, null,
        h(Styles),
        h('div', {
          className: 'ub-root ub-modal-layer',
          'data-dsh-ub-popover': 'true',
          onMouseDown: (event) => { if (event.target === event.currentTarget) closePopover(); },
        },
        h('div', {
          className: 'ub-modal',
          role: 'dialog',
          'aria-modal': true,
          'aria-label': t('panelTitle'),
          'data-dsh-ub-dialog': 'true',
          tabIndex: -1,
        },
          h('div', { className: 'ub-modal-head' },
            h('span', { className: 'ub-modal-title' }, t('panelTitle')),
            h('div', { className: 'ub-row' },
              layout !== null ? h(Button, { onClick: () => { closePopover(); layout(); } }, t('viewFull')) : null,
              h(Button, { onClick: closePopover, title: t('close'), 'aria-label': t('close'), 'data-ub-close': true }, '×'))),
          connection !== 'ready'
            ? h(Banner, { tone: 'danger', title: t('noRemote') }, t('noRemoteHint'))
            : null,
          budget.notice !== null && budget.notice !== undefined
            ? h(Banner, {
              tone: budget.notice >= 100 ? 'danger' : 'warn',
              title: t('notice'),
              onDismiss: () => { void dismissBudgetNotice(budget.monthKey); },
            }, t(`notice${budget.notice}`))
            : null,
          h(Card, { title: t('budget') },
            h('div', { className: 'ub-row', style: { justifyContent: 'space-between', marginBottom: 6 } },
              h('b', { style: { fontSize: 20 } }, money(budget.spent)),
              h('span', { className: 'ub-row ub-small ub-muted' },
                budget.includeSubagents ? h('span', { className: 'ub-badge ub-badge-muted' }, t('includeSubagentsTag')) : null,
                `/ ${money(budget.monthly)}`)),
            h(Progress, { value: budget.ratio, level: budget.level }),
            h('div', { className: 'ub-row ub-small ub-muted', style: { justifyContent: 'space-between', marginTop: 5 } },
              h('span', null, budget.enabled ? `${percentText(budget.ratio)} ${t('spent')}` : '—'),
              h('span', null, budget.enabled ? `${t('remaining')} ${money(budget.remaining)}` : ''))),
          h('div', { style: { height: 10 } }),
          h(Card, { title: t('balanceTitle') },
            balanceIsLive(balance)
              ? h(Fragment, null,
                h('div', { className: 'ub-row', style: { justifyContent: 'space-between', marginBottom: 6 } },
                  h('b', { style: { fontSize: 20 } }, money(balance.totalCny)),
                  h('span', { className: 'ub-small ub-muted' },
                    (isFiniteNumber(balance.deltaCny) ? signedMoney(balance.deltaCny) + ' · ' : '') + (timeText(balance.fetchedAt) || '—'))),
                h(Kv, { items: [
                  { label: t('balanceTodayCharged'), value: isFiniteNumber(balance.todaySpentCny) ? money(balance.todaySpentCny) : '—' },
                  { label: t('balanceTodayEstimate'), value: isFiniteNumber(balance.todayEstimatedCny) ? money(balance.todayEstimatedCny) : '—' },
                  { label: t('balanceEstimateDiff'), value: isFiniteNumber(balance.estimateDiffCny) ? signedMoney(balance.estimateDiffCny) : '—' },
                ] }),
                h(BalanceLinks, { links: balance.links, compact: true }))
              : h('div', { className: 'ub-small ub-muted' }, balanceHintView(balance).text)),
          h('div', { style: { height: 10 } }),
          h(Card, { title: t('cumulative') },
            h(Kv, {
              items: [
                { label: t('sessionCount'), value: `${overview?.cumulative?.sessions ?? 0}${(overview?.cumulative?.subagentSessions ?? 0) > 0 ? t('subagentSuffix', overview.cumulative.subagentSessions) : ''}` },
                { label: t('workspace'), value: `${overview?.cumulative?.workspaces ?? 0}` },
                { label: t('calls'), value: `${overview?.cumulative?.calls ?? 0}` },
                ...(sessionCost === null ? [] : [{ label: t('thisSessionCost'), value: money(sessionCost.costCny) }]),
              ],
            })),
          h('div', { style: { height: 10 } }),
          h(Card, { title: t('todayDist') },
            h(Kv, {
              items: todaySplit.hasProject === false
                ? [{ label: t('today'), value: money(overview?.overview?.todayCny ?? 0) }]
                : [
                  { label: t('thisProject'), value: money(todaySplit.projectCny ?? 0) },
                  { label: t('otherProjects'), value: money(todaySplit.otherCny ?? 0) },
                  { label: t('today'), value: money(overview?.overview?.todayCny ?? 0) },
                ],
            })),
          unpriced.length > 0
            ? h('div', { className: 'ub-banner ub-banner-danger', style: { marginTop: 10 } },
              h('b', null, t('unpriced')),
              h('span', null, `${t('unpricedHint')} ${unpriced.join(', ')}`))
            : null,
          prefs.showTierCurve !== false && tiers !== null
            ? h('div', { style: { marginTop: 10 } }, h(TierCurve, { tier: tiers }))
            : null,
          h('div', { className: 'ub-small ub-muted', style: { marginTop: 10 } },
            `${t('peakHint')} ${t('methodNote', String(tiers?.holidayDataThrough ?? ''))}${overview?.pricing?.live === false ? ` · ${t('notLive')}` : ''}`))));
    }

    const openPanelRef = { current: null };

    /* ---------------------------------------------------------------- */
    /* Settings section                                                */
    /* ---------------------------------------------------------------- */

    function SettingsSection(props) {
      return h(SlotBillingPage, { ...props, mode: 'settings', close: props.close });
    }

    /* ---------------------------------------------------------------- */
    /* Plugin                                                          */
    /* ---------------------------------------------------------------- */

    function applyClientLocale(ctx) {
      let unsubscribe = () => {};
      const bind = (localeCtx) => {
        try {
          const locale = localeCtx.locale;
          const read = () => {
            const snapshot = locale.getSnapshot();
            const active = String(snapshot?.active ?? 'en');
            localeId = active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
            if (typeof document !== 'undefined') document.documentElement.setAttribute('data-dsh-ub-locale', localeId);
          };
          read();
          try { unsubscribe(); } catch { /* detached */ }
          unsubscribe = locale.subscribe(() => {
            read();
            store.set(state => ({ tick: state.tick + 1 }));
          });
          localeCtx.effect(() => locale.register('usage-billing', { en: DICTS.en, zh: DICTS.zh }));
        } catch (error) {
          warn('读取客户端语言失败，回退英文', error);
        }
      };
      try {
        ctx.inject(['locale'], bind);
      } catch (error) {
        warn('语言服务注入失败，回退英文', error);
      }
      return () => {
        try { unsubscribe(); } catch { /* detached */ }
      };
    }

    function syncPrefsWatcher() {
      return store.subscribe(() => {});
    }

    function apply(ctx) {
      let disposed = false;
      let localeDisposer = () => {};
      let prefsUnsubscribe = () => {};
      let entriesDisposers = [];
      let lastPrefsKey = '';

      const slotRegister = (slot, options, component, label) => {
        try {
          return ctx.slots.inject(slot, () => {
            try {
              return ctx.slots.register(options, component);
            } catch (error) {
              warn(`插槽 ${slot} 注册失败`, error);
              return () => {};
            }
          });
        } catch (error) {
          warn(`插槽 ${slot} 注入失败（该插槽可能不存在）`, error);
          return () => {};
        }
      };

      try {
        localeDisposer = applyClientLocale(ctx);
      } catch (error) {
        warn('语言同步失败', error);
      }

      // Always-on surfaces: panel + overlay + settings section.
      slotRegister('main', { name: 'main', key: PANEL_ID }, (props) => h(SlotBillingPage, { ...props, mode: 'panel' }));
      slotRegister('shell.overlay', { name: 'shell.overlay', id: PANEL_ID, order: 100, label: () => t('nav') }, PopoverHost);
      slotRegister('settings.section', {
        name: 'settings.section', id: PANEL_ID, order: 30, label: () => t('nav'),
      }, SettingsSection);

      // Entry surfaces follow their preferences; re-register when a toggle flips.
      const syncEntries = () => {
        const prefs = store.get().prefs ?? DEFAULT_PREFS;
        const key = `${prefs.entrySidebar === false ? 0 : 1}:${prefs.entryComposer === false ? 0 : 1}`;
        if (key === lastPrefsKey) return;
        lastPrefsKey = key;
        for (const dispose of entriesDisposers) {
          try { dispose(); } catch (error) { warn('注销入口插槽失败', error); }
        }
        entriesDisposers = [];
        if (prefs.entrySidebar !== false) {
          entriesDisposers.push(slotRegister(
            'sidebar.panellist',
            { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => t('nav') },
            SidebarEntryIcon,
          ));
        }
        if (prefs.entryComposer !== false) {
          entriesDisposers.push(slotRegister(
            'conversation.composer.dock',
            { name: 'conversation.composer.dock', id: PANEL_ID, order: 20 },
            ComposerCapsule,
          ));
        }
      };
      const onPrefsChanged = () => {
        syncEntries();
        const prefs = store.get().prefs ?? DEFAULT_PREFS;
        const key = String(prefs.balanceEnabled) + ':' + String(prefs.balanceRefreshSeconds);
        if (key !== lastBalanceKey) {
          lastBalanceKey = key;
          scheduleBalance();
        }
      };
      prefsUnsubscribe = store.subscribe(onPrefsChanged);
      syncEntries();

      try {
        const layout = ctx.get('layout');
        if (layout !== undefined && typeof layout.selectPanel === 'function') {
          openPanelRef.current = () => { layout.selectPanel(PANEL_ID); };
        }
      } catch (error) {
        warn('读取面板服务失败，弹层将不提供跳转', error);
      }

      // Optional data channel. Its absence or failure never removes a surface.
      let remoteTimeout = setTimeout(() => {
        if (!remoteMounted && !disposed) {
          warn('客户端数据通道（Remote）未在预期时间内挂载，界面以空数据继续工作');
          store.set({ connection: 'failed', connectionError: 'remote mount timeout' });
        }
      }, 8000);
      let remoteFiber = null;
      let balanceTimer = null;
      let lastBalanceKey = '';
      const balanceDelayMs = () => {
        const prefs = store.get().prefs ?? DEFAULT_PREFS;
        const raw = Number(prefs.balanceRefreshSeconds);
        const configured = Number.isFinite(raw) && raw >= 10 ? raw : 30;
        const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        return (hidden ? Math.max(300, configured) : Math.max(15, configured)) * 1000;
      };
      const scheduleBalance = () => {
        if (balanceTimer !== null) {
          clearTimeout(balanceTimer);
          balanceTimer = null;
        }
        if (disposed || api === null) return;
        const prefs = store.get().prefs ?? DEFAULT_PREFS;
        if (prefs.balanceEnabled === false || store.get().connection !== 'ready') return;
        balanceTimer = setTimeout(async () => {
          balanceTimer = null;
          if (disposed || api === null) return;
          try {
            await loadBalance(false);
          } finally {
            if (!disposed) scheduleBalance();
          }
        }, balanceDelayMs());
      };
      const onVisibility = () => scheduleBalance();
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      try {
        remoteFiber = ctx.inject(['remote'], (remoteCtx) => {
          let unmountRemote = null;
          void (async () => {
            try {
              unmountRemote = await remoteCtx.remote.$mount(mountContribution());
              remoteMounted = true;
              clearTimeout(remoteTimeout);
              remoteCtx.effect(() => () => {
                remoteMounted = false;
                api = null;
                if (typeof unmountRemote === 'function') void Promise.resolve(unmountRemote()).catch(() => {});
              });
            } catch (error) {
              clearTimeout(remoteTimeout);
              warn('远程命名空间挂载失败；设置页仍可用，金额显示为空状态', error);
              store.set({ connection: 'failed', connectionError: String(error?.message ?? error) });
            }
          })();
          remoteCtx.inject([`remote.${NS}`], (inner) => {
            try {
              api = inner.remote[NS];
              store.set({ connection: 'ready', connectionError: null });
              void loadPrefs().catch(error => warn('读取偏好失败', error));
              void loadBalance(false);
              scheduleBalance();
            } catch (error) {
              warn('读取远程命名空间失败', error);
              store.set({ connection: 'failed', connectionError: String(error?.message ?? error) });
            }
            inner.effect(() => () => { api = null; });
          });
        });
      } catch (error) {
        clearTimeout(remoteTimeout);
        warn('数据通道注入失败；设置页仍可用', error);
        store.set({ connection: 'failed', connectionError: String(error?.message ?? error) });
      }

      // Shared 25s heartbeat: every mounted surface refreshes stale queries.
      const heartbeat = setInterval(() => {
        if (disposed) return;
        store.set(state => ({ tick: state.tick + 1 }));
      }, 25000);

      // Own every resource through the plugin fiber: the client runner disposes
      // this effect on unload, which removes registrations, timers and the
      // Remote contribution together.
      ctx.effect(() => () => {
        disposed = true;
        clearInterval(heartbeat);
        clearTimeout(remoteTimeout);
        if (balanceTimer !== null) {
          clearTimeout(balanceTimer);
          balanceTimer = null;
        }
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        try { prefsUnsubscribe(); } catch { /* detached */ }
        for (const dispose of entriesDisposers) {
          try { dispose(); } catch { /* detached */ }
        }
        entriesDisposers = [];
        try { localeDisposer(); } catch { /* detached */ }
        try {
          if (remoteFiber !== null && typeof remoteFiber.dispose === 'function') void Promise.resolve(remoteFiber.dispose()).catch(() => {});
        } catch { /* detached */ }
        api = null;
        remoteMounted = false;
        store.set({ connection: 'failed', connectionError: 'plugin disposed' });
      });
    }

    const __internals = { todayCallsOf, rangeLabelText, priceSourceBadge, sparseHeatmap, budgetView, buildHeatmap, signedMoney, balanceHintView, balanceIsLive };

    return { inject: ['slots'], apply, __internals };
  },
});
