# Sidebar 修复与验证记录 — 2026-10-08

基于 `dev` / `770a679`。遵循最后的“做完推送，不要验收”：本轮执行代码验证、包消费与回归归因，不执行 Playwright 浏览器交互或视觉验收，不生成截图。不能将本记录当作完整产品验收通过。

## 修复

- 从 Project Control 和 Source Registry 对应 `UIPluginRenderSlotOptions` 删除误加的 `sidebar`；保留 `sizing` / `layout`。导航名称和图标继续只属于 Manifest。
- 外部操作 JSON Schema 新增 `sidebarItemSlot`：只接受 `slot`、插件数组长度恰好为 1、合法 `$localRef`。Mutation 类型和 Zod Schema 同步收紧。拒绝 Row、Column、Stack、Panel、空 Slot 和多插件 Slot。
- `defaultActive` 文档明确只接受 null 或现有 Item ID，并拒绝空白字符串。标准 JSON Schema 2020-12 无法表达动态兄弟字段间的 ID 引用包含关系，仍由已有 AppUIModel 最终结构校验验证唯一 ID 和引用关系。没有加入非标准 `$data` 扩展，也没有改变事务提交边界；本次未改动已正确约束这些关系的 `app-ui-model.ts`。
- 测试覆盖合法 `localRef` 的跨操作使用、临时双插件到最终单插件的原子批次、非法 child、悬空默认选中，以及旧包版本拒绝。
- 只提升新增 API 所属包：`@agent-ui/react` → `0.1.2`，`@agent-ui/runtime-react` → `0.1.1`。四个使用 Sidebar API 的 foundation Source Registry 条目同步最低版本，阻止旧版本被静默判为兼容。没有批量修改其他包或用户 Host。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Sidebar Contract | 17 passed |
| Sidebar Frame | 3 passed |
| 外部 JSON Schema / Python Sidebar | 10 passed |
| i18n / Project Control Contract / assistant-ui upstream | 全部通过 |
| assistant-ui 升级契约 | 33 passed |
| React、Runtime React、Project Control 类型检查 | 全部通过 |
| Sidebar E2E TypeScript | 通过，未执行浏览器测试 |
| Portal adapter 同步测试 / 可再生 adapter provenance 校验 | 通过 |
| Source Registry release 单元测试 | 3 passed |
| `pnpm verify:ui` | 三个现有 Host 均 passed，无 errors |
| `pnpm typecheck` | 基线 Web Component 缺少 `@agent-ui/plugins`，未完成全量类型检查 |
| `pnpm test:ts` | Runtime React 164 passed / 2 failed；递归执行在此停止 |
| Operation + Transaction 额外回归 | 59 passed / 40 failed / 2 errors，基线结果相同 |

所有命令、分类和日志入口见 [summary.json](summary.json)。`verify:ui` 是静态检查，不代表视觉或真实交互验收。

## 独立真实包消费

新增可重跑脚本 `scripts/verify-sidebar-consumer.mjs`。完成包构建后运行 `node scripts/verify-sidebar-consumer.mjs`。

消费工程位于操作系统临时目录，使用 `pnpm pack` 生成的真实 runtime-core/react/runtime-conversation/runtime-react/plugins tarball。安装启用本地 tarball overrides、关闭 global virtual store、使用 copy import，并清空 NODE_PATH；脚本断言每个 Agent UI 包的 realpath 位于消费工程内。没有 monorepo 源码 alias、workspace 包软链或内部源码引用。

首次安装遇到 metadata timeout，重试使用现有 pnpm store 后成功。platform 和 assistant 各自完成：真实依赖安装 → 最新 Source Registry 初始化 → AppUIModel / 插件 / 注册表生成 → 严格类型检查（skipLibCheck:false）→ Vite 生产构建。类型检查直接消费 `AgentUISidebarFrame` 和 `SidebarNode` 的公开导出。

[consumer.json](consumer.json) 记录临时工程、tarball 版本、SHA-256 和结果；`generated/{platform,assistant}` 保存生成模型、注册表、依赖清单、项目配置和源码 SHA-256 清单；`consumer-*-install/typecheck/build.log` 保存运行证据。临时工程中保留完整生成源码和 build 产物。这些验证使用当前工作区 Source Registry，已有无关未提交修改保持原样，未纳入本次提交。

## 基线失败与未完成范围

使用 `git archive 770a679` 建立干净源代码基线，复用已安装第三方依赖并构建基线产物。位置见 [baseline.json](baseline.json)。

- 全量 typecheck：在基线运行相同 `pnpm typecheck`，同样失败于 Web Component `prepare-shell` 的 `AGENT_UI_PACKAGE_MISSING: @agent-ui/plugins`。见 `logs/baseline-typecheck.log`。因此本轮不能宣称 Web Component 编译或运行时接入通过，也没有修改这个既有依赖问题。
- Runtime React：基线同一 `plugin-error-boundary.test.tsx` 重现两项语言/可访问名称断言失败，见 `logs/baseline-runtime-errors.log`。
- Transaction 回归：基线同样 40 failed / 59 passed / 2 errors，失败集中于既有项目配置 fixture。逐项失败名称一致，见 `logs/baseline-failure-comparison.log`。本轮不修复这些非 Sidebar 问题。
- 发包校验：当前 `release:verify` 被既有 `conversation-quote` 版本/changelog 漂移阻断。基线 gate 先遇到 `conversation-command-source` 漂移；另外对基线 quote 与发布 fixture 做相同源码摘要/版本比较，证明 quote 源码已变化但版本仍为 `0.0.1`。见 `logs/baseline-release-verify.log` 和 `logs/baseline-quote-release.log`。
- npm 发布路径：查询 `@agent-ui/react` / `@agent-ui/runtime-react` 均返回 E404（包不存在或当前身份不可访问），无法确认公共 registry 有可用发布产物。本地 tarball 已包含 Sidebar API，最低版本保护已就绪；npm 发布仍是交付阻断。未执行 npm publish，不能声称普通 npm 安装已闭环。
- Playwright、真实会话新建/搜索/切换/删除/重试、浮窗/多实例焦点和 Portal、Web Component 窄容器、Light/Dark/Violet 截图，均按最后指令未验收。没有截图和浏览器运行证据。

## 架构与纯净性

`internal/vendor/assistant-ui` 相对 `770a679` 的 diff 为空。既有官方 Sidebar / Sheet / Menu / Tooltip 复用、容器响应式和 Runtime 边界未改变。`checkProductAdapters()` 验证源码及 provenance 与从干净 vendor 的受保护生成结果完全一致；升级契约通过。未新增抽屉、全局 Cookie、快捷键或 Runtime，未覆盖现有用户 Host 定制源码。

代码和独立 Host 消费验证通过；已执行范围未发现确认由本次修复新增的回归。完整验收、Web Component 和公共 npm 发布仍未通过，不能宣称方案全部通过。
