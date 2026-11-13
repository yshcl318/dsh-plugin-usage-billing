# 用量计费 bundle — 交付与复核修复报告（v1.4.0）

交付物与安装状态：

| 项 | 值 |
|---|---|
| 工作区源码 | `D:\deepseek-harness\bundle\dsh-plugin-usage-billing` |
| 可安装包 | `dist/dsh-plugin-usage-billing-1.4.0.zip`（同目录 `dist/dsh-plugin-usage-billing/` 可直接安装） |
| profile 安装位置 | `C:\Users\Hp\.dsh\bundles\dsh-plugin-usage-billing`（profile 依赖为 `link:C:/Users/Hp/.dsh/bundles/dsh-plugin-usage-billing`，不再指向工作区） |
| 包名/版本 | `@yshcl318/dsh-plugin-usage-billing@1.4.0`，`private: true`，`engines.dsh: >=0.2.2-rc.2 <0.3.0-0` |
| 状态 | `desktop` profile 中启用、运行中；Host 行 `usage-billing` 已激活 |

安装：`plugin_manager install_bundle target = C:\Users\Hp\.dsh\bundles\dsh-plugin-usage-billing`
卸载：`plugin_manager remove_bundle target = @yshcl318/dsh-plugin-usage-billing`

---

## 一、复核意见逐条处理结果

### P0

| # | 问题 | 结果 | 处理 |
|---|---|---|---|
| 1 | 本项目恒为 ¥0.00 | ✅ 已修 | Client 在根级页面用 `useSessions` 解析 cwd：优先胶囊记住的会话 → 最近会话 → 无则隐藏“本项目/其他项目”，只显示“今日”；`overview` 第三参数由 `sessionId` 改为 `cwd`，Host 不再查会话表。实测弹层「本项目 ¥9.16 / 其他项目 ¥0.00」（截图 `v11-final-popover.png`）。 |
| 2 | 旧插件 v1 数据躺在同域 | ✅ 已清理并说明 | 删除 14 个 v1 记录 + `ledger_shards/`、`folds/` 两个旧表目录；v2 仅保留 17 条本插件记录。README/DETAIL 增加“v1 数据不迁移”说明（同名域 version 2 使 v1 记录按 absent 读取）。 |
| 3 | 2 条会话记录被 backup-and-skip | ✅ 已定位并清理 | 备份内容确认是早期版本写下的 `revision: null` 记录；校验器已放宽为允许 `null`，清理 2 个 `.bak`；多轮重载后 0 个新备份（`clean-domain-v1.cjs` 复核输出 `invalid-record backups removed: 0`）。 |

### P1

| # | 问题 | 结果 | 处理 |
|---|---|---|---|
| 4 | 手搓 zod / 伪装类型 | ✅ 已改 | 移除伪 `_def`；`createDomainSpec()` 优先使用真实 `zod`（`z.custom` + 谓词），无法解析时回退等价 shim。Host 通过 profile/dsh 安装目录锚点解析 zod；UI 显示“校验引擎 zod”（截图 `v11-pricing-runtime.png`）。 |
| 5 | retry 成功后不重置 | ✅ 已修 | 成功 attach 后 `retry = 0`；失败 attach 会关闭已打开的域，避免永久 `already-open`。 |
| 6 | link 指向工作区 | ✅ 已修 | 包已迁到 `C:\Users\Hp\.dsh\bundles\dsh-plugin-usage-billing` 并从该路径安装；工作区源码仅作开发副本（与安装副本逐文件 SHA256 一致）。 |
| 7 | 预算可存 0 元且无提示 | ✅ 已修 | 0 元在 Host 层视为 `enabled:false`；UI 显示“预算未启用（金额为 0）”，不再是 0% 进度条。实测切换 0 后提示出现，恢复 100 正常。 |
| 8 | 节假日表 2027 且未上屏 | ✅ 已修 | 界面口径行与设置页均显示“节假日数据覆盖 2025–YYYY 年”（来自 Host `tier.holidayDataThrough`）；口径同时说明北京时间（UTC+8）。 |
| 9 | 时区固定 +08 | ✅ 保留并明示 | 按北京时间归天/判档是产品口径，已在概览、弹层与设置页三处文案说明；未做可配置时区（记录为限制）。 |
| 10 | 无 engines.dsh | ✅ 已加 | `"engines": { "dsh": ">=0.2.2-rc.2 <0.3.0-0" }`。 |

### P2

| # | 问题 | 结果 | 处理 |
|---|---|---|---|
| 11 | 弹层缺 dialog/a11y、焦点管理 | ✅ 已修 | `role="dialog"` + `aria-modal` + `data-dsh-ub-dialog`；打开后焦点移入关闭按钮、Tab 在弹层内循环、Esc/关闭后焦点回到胶囊；胶囊增加 `aria-haspopup="dialog"` 与 `aria-expanded`（实测 `focusInside=true`、`focusReturned=true`、`expandedAfter=true`）。 |
| 12 | 热力图大片空格 | ✅ 已修 | 按活跃天数收窄窗口（≤2 天→14 天、≤7 天→30 天，否则 90 天），空数据显示“暂无活跃日期”。 |
| 13 | 弹层预算与累计金额重复 | ✅ 已修 | 累计卡去掉重复“金额”行；会话计数改为“会话数”，当前会话金额单独标为“本会话金额”。 |
| 14 | 胶囊无口径提示 | ✅ 已修 | `title` 改为“本会话金额 · 点开查看计费弹层”。 |
| 15 | 累计会话含子代理未标注 | ✅ 已修 | Host 返回 `subagentSessions`；概览与弹层显示“5 会话（含 3 子代理）”。 |
| 16 | 回填估算不可见 | ✅ 已修 | “估算”横幅移到概览顶部（截图 `v11-final-panel.png`），并在“累计”副标题追加“· 估算”。 |
| 17 | 本项目/其他项目文案误导 | ✅ 已修 | 无项目上下文时整行隐藏，仅保留“今日”合计（P0-1 同源修复）。 |
| 18 | i18n 字典硬编码在 client.js | ✅ 保留（已记录） | 与 `locale/*.json`（插件详情页用）分离是平台机制；新增语言需改代码，接受为维护限制。 |

### P3

| # | 问题 | 结果 | 处理 |
|---|---|---|---|
| 19 | 测试无 npm script | ✅ 已加 | 工作区根 `package.json`：`test` / `test:host` / `test:client` / `pack`；`node tests/...` 直跑 16/16 + client 装配通过。 |
| 20 | 工作区残留 zip / browser-test.png | ✅ 已清 | 旧 zip、`browser-test.png` 删除；打包统一到 `dist/`（`node tools/packBundle.mjs`）。 |
| 21 | client.js 无类型检查 | ⚠️ 未做（说明） | 环境无离线 TypeScript 工具链（无法安装/运行 `tsc --checkJs`）；已用两个测试套件 + 运行时验证兜底，未伪造 `@ts-check`。 |
| 22 | 版本/变更记录 | ✅ 已加 | 版本升至 1.1.0，新增 `CHANGELOG.md` 并纳入 `files`。 |

---

## 二、验收结果（v1.1.0 最终态）

**真实重启已验证**：应用在安装状态下重启过（GUI 端口从 62326 变为 56186），重启后侧栏 `计费` 入口直接可见、账本从 storage-domain 恢复（¥9.7+），无插件错误。这补上了上一版只能“等价验证”的缺口。

| # | 标准 | 结果 | 证据 |
|---|---|---|---|
| 1 | 重启后侧栏入口可见 | ✅ | 重启后侧栏“全局面板”有 `计费` 行；点击打开同 id 的 `main` 面板（`verify/v11-final-panel.png`、`verify/restart-panel.png`）。 |
| 2 | 有数据显金额 / 无数据 ¥0.00 空态 | ✅ | 本月 ¥10.12、今日 ¥9.16、累计 ¥10.12（含 3 子代理）、875 调用、99% 缓存命中；无数据/未就绪时 ¥0.00 + 空态提示（Host 单测覆盖）。 |
| 3 | 弹层含本月/今日/预算，Esc 可关 | ✅ | 弹层：预算 ¥10.12/¥100、累计（会话数/项目/调用/本会话金额）、今日分布（本项目 ¥9.16 / 其他 ¥0.00）、峰谷与口径；Esc 后弹层消失（断言 `popoverClosed=true`）。 |
| 4 | 设置三页签可用且数据一致 | ✅ | 概览/趋势/明细均可用；价目表显示 58 页、校验引擎 zod、实时价/非实时价标识；与卡片同源一致（`v11-final-settings-overview.png`、`v11-final-settings-detail.png`、`v11-pricing-runtime.png`）。 |
| 5 | 改预算进度条即时更新 | ✅ | 100 → 50：10% → 20%，金额行 `¥10.16 / ¥50.00` 即时变；已恢复 100（截图 `v11-final-budget.png`）。 |
| 6 | Console 无未捕获异常 | ✅（插件） | 全程 `pageerror=0`、`[usage-billing]` 错误=0、slot crash=0。仅见与本插件无关的 `/api/present.open`、`/api/changes.summary` 资源 404/500（旧会话历史里演示文件/变更摘要在重启后的失效引用），不属插件代码路径。 |
| 7 | 卸载后应用正常无报错 | ✅（live） | v1.0 阶段完整验证卸载：依赖/bundles 行/侧栏入口/胶囊/设置分区全部消失、应用可用、Console 无插件错误；随后重装。v1.1 的卸载路径同代码（无新增卸载逻辑），未再次“卸载后整应用重启”（会终止本会话），风险已说明。 |

数据/计价口径保持并通过测试：写时锁价、峰谷 0.5、未收录显示 `—`、安装前历史估算、按天分片持久化、预算 50/80/100 各一次、Remote 17 方法两端一致、挂载失败降级。

---

## 三、自动化测试

```
node tests/host.test.mjs      → 16/16 passed
node tests/client.test.mjs    → 5 surfaces, 5 degraded surfaces, 17 remote methods
```

新增覆盖：cwd 项目口径（hasProject）、子代理会话计数、预算 0 = disabled、domain spec 解析/拒绝垃圾记录、zod/shim 运行时；既有覆盖：峰谷/写时锁价/估算/回填/fork 去重/预算一次性提醒/持久化/断网降级。

---

## 四、最终数据与卫生状态

| 检查 | 结果 |
|---|---|
| 域目录 | 仅 v2 表：`ledger/ sessions/ snapshots/ aliases/ custom/ prefs/ diag/ global.json`；无 `ledger_shards/`、`folds/` |
| v1/备份文件 | 已清理 14 个 v1 记录 + 2 个 `.bak`；复核 0 残留、0 新备份 |
| 偏好 | `budgetEnabled=true, monthlyCny=100, entrySidebar=true, entryComposer=true, includeSubagents=true, showTierCurve=true` |
| 价目 | models.dev 目录实时拉取成功、汇率接口失败 → UI 标注“非实时价”，校验引擎 `zod` |
| profile | 依赖 `link:C:/Users/Hp/.dsh/bundles/dsh-plugin-usage-billing`；bundles 列表含本包；`@local` junction 指向该目录 |
| 源码/安装副本 | 逐文件 SHA256 一致 |

---

## 五、截图

| 文件 | 内容 |
|---|---|
| `verify/restart-panel.png` | 真实重启后的侧栏入口与面板 |
| `verify/v11-final-panel.png` | 概览：顶部估算横幅、本月/今日/累计（含子代理）、热力图收窄、口径行 |
| `verify/v11-final-popover.png` | 弹层：预算、累计（会话数/本会话金额）、今日本项目/其他、峰谷 |
| `verify/v11-final-settings-overview.png` | 设置 → 计费 → 概览（预算编辑） |
| `verify/v11-final-settings-detail.png` | 设置 → 计费 → 明细 |
| `verify/v11-final-budget.png` | 预算 50 时 20% 即时更新 |
| `verify/v11-pricing-runtime.png` | 价目表页脚“校验引擎 zod / 非实时价” |

---


---

## 七、第三轮复核（v1.2.0）

| 组 | # | 问题 | 结果 | 处理与证据 |
|---|---|---|---|---|
| A | 1 | 今日卡调用数用了本月值 | ✅ 已修（真 bug） | Host 新增 `todaySplit.totalCalls`，Client 用 `todayCallsOf()`；实测今日卡 826 调用 = 明细表今日行 826（`callsMatch=true`），新增 view-model 回归测试。 |
| B | 2 | 两个"刷新" | ✅ 已修 | 删除概览工具栏重复按钮；页头刷新通过 `refreshNonce` 强制所有已挂载查询刷新一次。实测面板内"刷新"按钮数 = 1。 |
| B | 3 | 预算进度重复三处 | ✅ 已修 | "本月/区间"统计卡只显示金额 + 预算金额（不再显示 %），进度条只在预算卡；弹层为独立表面。 |
| B | 4 | 峰谷图过高 | ✅ 已修 | 峰谷条限宽 520px，实测 SVG 高度 74.75px（原约占整行 200px），分模型不再被挤到下一屏。 |
| B | 5 | 范围切换后标题仍写"本月" | ✅ 已修 | 统计卡标题随范围：本月 / 近 7 天 / 近 30 天 / 全部；实测切到"近 7 天"后标题与金额同步变化。 |
| C | 6 | 热力图仍 90 格 | ✅ 实测已生效 | DOM 实测 `.ub-heat i` = 14 个（活跃 2 天 → 14 天窗口），此前评审看到的可能是旧构建/旧截图。 |
| C | 7 | 提示固定"最近 90 天" | ✅ 已修 | 改为按实际窗口：实测"最近 14 天 · 颜色越深花费越多"。 |
| D | 8 | 胶囊无 hover 提示 | ✅ 已修 | `title` 与 `aria-label` 均为"本会话金额 · 点开查看计费弹层"（实测属性存在）。 |
| D | 9 | 预算卡未标是否含子代理 | ✅ 已修 | 预算卡/弹层预算行显示"含子代理"徽标（实测 `badgeSubagents=true`）。 |
| D | 10 | 价目/汇率降级只在底部说明 | ✅ 已修 | 范围切换右侧显示价格来源徽标：实时价（绿）/ 内置价 · 默认汇率 ×7.1（灰，悬停说明原因）；实测显示"实时价"。 |
| D | 11 | `useProjectCwd` 取最近会话 | ✅ 已改进（有边界） | 优先胶囊记住的当前会话，其次最近会话；多工作区且从未打开过会话时仍只能回退最近会话（记为限制）。 |
| D | 12 | 时区固定 +08 | ✅ 保留并说明 | 三处口径文字写明北京时间（UTC+8）；未做设置项。 |
| E | 13 | 无类型检查 | ✅ 已加 | `tsconfig.json`（`checkJs`、ambient `react`/`zod`/`__ModuleLoader__`）+ `// @ts-check`；`pnpm typecheck` 0 错误，`pnpm check` = typecheck + 两套测试。 |
| E | 14 | UI 渲染无测试 | ✅ 已加 | 工厂暴露 `__internals`（`todayCallsOf/rangeLabelText/sparseHeatmap/budgetView`），client 测试覆盖今日计数、范围标题、热力图收窄、预算口径。 |
| E | 15 | i18n 内联 client.js | ⚠️ 保留 | 单文件无 import 能力、无构建步骤；字典与 `locale/*.json`（插件详情页）分离是平台机制，新增语言仍需改代码（记为维护限制）。 |
| E | 16 | 单文件无模块拆分 | ⚠️ 部分 | 已按 pricing/views/styles 分段并加 `__internals` 测试出口；Browser 半只能由单个 `./client` 入口加载，真正拆分需要引入打包器（当前故意保持零构建）。 |
| E | 17 | `private: true` | ⚠️ 保留 | 当前交付为本地/索引外的 bundle；发布需补 publish 配置与版本策略，已在报告中列明。 |

第三轮验证摘要：`tsc` 0 错误；`host.test.mjs` 16/16；client 接线 + view-model 断言通过；浏览器实测无 `[usage-billing]` 错误，今日调用数、热力图、峰谷高度、刷新按钮数、价格徽标、含子代理标记、胶囊 a11y 均符合预期（截图 `verify/v12-panel.png`、`v12-popover.png`）。


---

## 八、第四轮复核（v1.3.0）

| 组 | # | 问题 | 结果 | 处理与实测 |
|---|---|---|---|---|
| P0 | 1 | "日均"口径含糊 | ✅ 已改标签 | 文案改为"**活跃日均**"（Avg per active day），算法保持 total ÷ 活跃天；趋势页实测显示"活跃日均 ¥6.34"。 |
| P0 | 2 | Token 两处不一致 | ✅ 已统一口径 | 概览缓存卡改为"缓存读 331.12M · 输入侧 334.07M"（两侧都点名）；趋势/模型表所有总量标签改为"**总 token**"（含输入/缓存/输出）。实测同屏可区分。 |
| P0 | 3 | 趋势逐日 30 行多为 0 | ✅ 默认隐藏 + 开关 | 默认只渲染有数据的天（实测 2 行），"显示空白天/隐藏空白天"按钮可展开 30 行；图表仍保留完整范围。 |
| P1 | 4 | 活跃度卡片右侧空白 | ✅ 已改布局 | 概览改为 flex 行：预算卡弹性占宽、热力图卡按内容宽度（实测热力图卡 **219.6px**，预算卡 479.6px），不再半屏空白。 |
| P1 | 5 | 峰谷图权重过高 | ✅ 已降级 | 峰谷条移入预算卡作为紧凑一行（实测预算卡内 tier 元素数 = 1，页面上不再有整宽"高峰"卡），分模型表上移。 |
| P2 | 6 | 缺 LICENSE | ✅ 已补 | 新增 MIT `LICENSE` 并加入 `files`；`pnpm pack`/dist 均包含。 |
| P2 | 7 | 时区固定 +08 | ✅ 保留 | 三处口径文字已说明北京时间（UTC+8）；未做设置项（限制）。 |
| P2 | 8 | 节假日表到 2027 | ✅ 保留 | UI 已显示覆盖年份；需每年维护一次（限制）。 |
| P3 | 9 | strict:false / noImplicitAny:false | ✅ 已实测错误量（未直接开） | 临时开启 `noImplicitAny`：browser 半 **656** 个、host+tests **339** 个（仅 pricing+ledger 也 **69** 个）——需要专门类型化改造，不能只翻配置（列为下一步）。当前 `pnpm typecheck` 仍为 0 错误。 |
| P3 | 10 | 只有 view-model 测试 | ✅ 已补 DOM 渲染测试 | 新增 `tests/ui.test.mjs`（jsdom + React）：真实渲染主面板/胶囊/弹层，断言今日调用数、14 格热力图、单一刷新按钮、范围标题、趋势空白天过滤、预算含子代理、价格徽标、弹层 Esc 关闭。 |
| P3 | 11 | i18n 内联 / 102KB 单文件 | ⚠️ 记录 | 零构建方案的固有限制：浏览器半只能一个 `./client` 入口、无法 import JSON；已在 BUILD/README 与限制清单说明。 |
| P3 | 12 | 工作区体积 | ✅ 已加 .gitignore | 新增 `.gitignore`：`node_modules/`、`dist/`、`ref/`、`verify/`、`.playwright-mcp/`、`mcp-browser/`、`*.tgz`、验证 cookie。 |

第四轮自动化：`tsc` 0 错误；host 16/16；client 接线通过；**ui.test.mjs 通过**（真实 DOM 渲染）。浏览器实测：四张统计卡同一行、热力图卡内容宽度、峰谷条在预算卡内、趋势 2 行→30 行切换、无 `[usage-billing]` 错误（截图 `verify/v13-panel.png`、`v13-trend.png`）。


---

## 九、第五轮复核（v1.3.1，仅测试/发布卫生）

| # | 问题 | 结果 | 处理 |
|---|---|---|---|
| 1 | `pnpm test` 不含 UI 测试 | ✅ 已修 | `test` 脚本改为 host + client + **ui** 三套；`check` = `tsc` + 三套。实测 `pnpm test` 三套全部通过（exit 0）。 |
| 2 | `act()` 弃用警告 | ✅ 已修 | DOM 测试改用 React 18.3 自带的 `React.act`，不再引用 `react-dom/test-utils`；单跑 ui 测试无任何警告输出。 |
| 3 | `noImplicitAny` 未开 | ⚠️ 保持记录 | 已实测错误量（browser 656 / host+tests 339 / pricing+ledger 69），需专门一轮类型化，已列为下一步；当前 `pnpm typecheck` = 0 错误。 |
| 4 | i18n 内联 / 102KB 单文件 | ⚠️ 保持记录 | 零构建入口的架构限制（浏览器半只能一个 `./client`、无法 import JSON），已在 BUILD/README/限制清单说明。 |
| 5 | `private: true` 无发布配置 | ⚠️ 保持记录 | 仅在发布到插件索引时需要补 publish 配置与版本策略；当前交付为本地 bundle。 |

运行时 bundle 代码自 1.3.0 未变，本版只调整测试脚本、测试写法与版本记录。


---

## 十、实际余额实时变动（v1.4.0）

新增 **实际余额**：读取当前登录 DeepSeek 账号的真实余额，并在插件内实时刷新、记录变动、对照本地估算。

| 项 | 实现与实测 |
|---|---|
| 数据来源 | 平台 `deepseekAccount` 服务（`getBalance` / `getState`），不读取、不存储、不上传任何 API Key；无账号服务或未登录时显示对应状态而不是假数字。 |
| 展示位置 | 概览顶部余额条（实时圆点 + 刷新按钮）、弹层、设置 → 计费 → **钱包** 页、侧栏入口 tooltip、输入框胶囊 tooltip 与行内「余额 ¥x」、主面板「钱包」页签。 |
| 实时刷新 | 客户端 25s 心跳拉取；Host 按偏好缓存 15/30/60/120s（默认 30s）；每次手动刷新立即查询；本地会话每产生一次用量后 8s 触发一次检查。 |
| 变动记录 | 新 domain 表 `balances` 持久化采样（同值 10 分钟内只留心跳，最多 1200 条）；「较上次」「今日余额减少*」「变动历史」重启后保留。 |
| 估算对照 | 今日「用量估算」（本地账本）vs「余额减少」（实际观测），并显示差值；* 标注以当天第一次观测为锚点（非午夜）。 |
| 设置 | 钱包页：显示开关、刷新间隔 15/30/60/120s、充值/用量外链、最近 40 条采样历史；关闭显示后退化为不请求。 |
| 实测 | 登录账号下显示 **¥10.68**（账号页同刻 ¥10.70，差值为查询间隔内的真实消耗），实时标记、较上次 −¥0.03、今日余额减少 ¥0.30、今日用量估算 ¥15.00、9 条采样历史；侧栏 tooltip「32% · 余额 ¥10.68」；胶囊行内「会话 ¥9.33 余额 ¥10.68」；无 `[usage-billing]` 错误。 |
| 测试 | host **19/19**（新增钱包解析、观测变动、账号服务 mock、未登录/无服务降级、balances 表校验）；client 19 方法接线；jsdom UI 测试新增余额卡断言；`tsc` 0 错误。 |

截图：`verify/v15-panel.png`（概览余额条）、`verify/v15-wallet.png`（钱包页）、`verify/v15-capsule.png`（胶囊行内余额）。


---

## 十一、余额功能复核修复（1.4.0 发布前）

| # | 复核问题 | 结论与处理 |
|---|---|---|
| 1 | 刷新间隔选项与实际不符（Host 固定 45s） | ✅ 已修：删除 Host 固定定时器；客户端新增**专用钱包调度器**按偏好间隔运行（15/30/60/120s），修改间隔立即重排，手动刷新仍即时。实测选 15s 后连续两次请求间隔 **15.048s / 15.012s**，钱包页文案同步为「每 15 秒自动刷新」，随后恢复默认 30s。 |
| 2 | `getState` 疑似不存在 | ❌ 不是 bug：`deepseekAccount` 的 Host 服务契约包含 `getState(): Promise<AccountView>`，`AccountView.links` 即用量/充值链接；Host 单测断言了 `links.topUpUrl`，真实界面也显示「充值 / 查询用量」链接。 |
| 3 | `accountClientMeta().version` 硬编码 | ✅ 已修：从本包 `package.json` 读取（`createRequire`，带缓存与兜底），单测断言发送的 version 与 manifest 一致。 |
| 4 | 充值当天「实际扣费」失真 | ✅ 已修：改为**当天观测到的余额下降累加**（充值导致的上涨不抵消已发生的消耗），并返回 `todayTopUp` 标记，界面提示「今日观察到充值；实扣按余额下降累计」。少于 2 个样本时仍显示 `—`。新增 12→10→20→18 的单元测试：实扣 = 4、`todayTopUp=true`。 |
| 5 | 空闲时也在轮询 | ✅ 已修：Host 无任何钱包后台定时器，只有客户端请求（及本地用量后 8s 一次）才会触发平台查询；页面隐藏时客户端退避到 5 分钟。打开的 GUI 按配置间隔刷新。 |
| 6 | 新增 balances 表但域版本未 bump | ✅ 确认安全，保持 v2：`storage-domain` 打开时只遍历**自身 spec 声明的表**（源码 `lib/index.js` 391–406 行），旧 1.3.x 读取器会忽略 `balances` 目录而账本正常；反而 bump 会让本版读不到现有 v2 账本。已把该理由写入 `host/domain.js` 与 DETAIL。 |
| 7 | 发布状态未同步 | ✅ 已处理：提交 1.4.0 代码 → 取新 commit SHA → `index.json` 追加 1.4.0 版本条目并单独提交；dist 重新打包为 `dsh-plugin-usage-billing-1.4.0.zip`。 |

回归：`tsc` 0 错误、host 19/19、client 19 方法、jsdom UI 测试通过；浏览器实测无 `[usage-billing]` 错误。


---

## 十二、回退兼容性与多客户端调度（复核补充）

| 项 | 处理 |
|---|---|
| 回退兼容测试 | ✅ 新增 `tests/domain-compat.test.mjs`：用**真实** `@deepseek-ai/dsh-storage-domain` 的 `DomainFacility` + 内存 kv unit，构造「1.3.x 的 7 表 schema」打开含 `balances` 记录的 v2 域，断言：旧读取器成功打开、只加载 7 张表、`table('balances')` 抛「declares no table」、账本记录可读、balances 文档未被改动；再用 1.4.0 的 8 表 spec 打开同一快照，能校验并读取钱包记录；损坏的钱包记录按 `backup-and-skip` 备份后跳过。`pnpm test`/`pnpm check` 已纳入该套件。 |
| 多客户端调度说明 | ✅ 已写入 bundle `docs/DETAIL.md`（及 README 摘要）：每个打开的 Client 各自按 `balanceRefreshSeconds` 调度；Host 用一个缓存观测 + TTL + 单飞请求去重，所以多标签/多面板共享同一次平台查询；本地用量后额外强制一次，隐藏标签页退避 5 分钟，无 UI 时不轮询。 |

测试结果：`pnpm test` 四套件全部通过（host 19/19、client 19 方法、jsdom UI、真实 storage-domain 兼容测试）；`tsc` 0 错误。

## 六、剩余限制（明确保留）

1. 整应用重启后的“卸载→重启”未再单独跑（会中断当前会话）；卸载 live 路径已验证，卸载逻辑自 v1.0 未变。
2. `sidebar.panellist` 合约只支持 icon+label：入口显示预算圆环 + “计费”，富卡片在同 id 的 `main` 面板内。
3. storage-domain 无 unit 删除 API：卸载后 `$DSH_HOME/storages/usage_billing` 数据保留，需手动删目录彻底清空（README/DETAIL 已写）。
4. 北京时间固定 UTC+8，未提供可配置时区；节假日表 2025–2027，UI 明示覆盖年份。
5. 类型检查已通过（`pnpm typecheck`）；但它是 `strict:false` 的轻量 checkJs，不是完整 TS 重写。
6. i18n 字典仍在 `client.js` 内（`locale/*.json` 仅供插件详情页），新增语言需改代码。
7. 浏览器半仍是单文件（零构建的代价），i18n 字典仍内联；发布到插件索引前需要补发布配置与版本策略。
8. peerDependencies 仍由平台/安装副本解析（本 profile 内 `@deepseek-ai/*` 由 DSH 安装解析成功）；`autoInstallPeers:false` 下安装日志会保留该提示。
