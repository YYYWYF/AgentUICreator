# UI 体系识别与验证完成判定验收

日期：2026-10-08。基线：`71324123`。P0 提交：`005362bc`。

## P0：验证身份与交付判定

- `validation/models.py`：`CreatorValidationCheck.check_id` 使用现有 allowlist 类型；结果序列化补充 `checkId`，`command` 保留真实执行命令。
- `validation/service.py`：执行结果和缓存回执都从当前 allowlist 项显式取得身份。不解析命令，不改 ActivityRecorder 的命令/revision/mode 缓存。
- `domain_agent/completion_gate.py`：插件交付检查、Recovery、开发完成回执三个位置均比较 `check_id`；最终开发分支同时拒绝缺少必需验证项的证据。
- 测试文件：`test_creator_validation.py`、`test_creator_validation_differential.py`、`test_plugin_delivery.py`、`test_recovery_completion.py`。未改验证 allowlist、AG-UI、Plugin Runtime 或 Shell 工具入口。

新增 9 项回归通过，包含真实 npm/pnpm 子进程 → `CreatorValidationService` → `CreatorDevelopmentCompletionGate` / `inspect_deliveries`：三项通过、typecheck 失败、build 失败、缺项、缓存身份、revision 失效、持续 includeBuild、Recovery 当前 revision。子进程测试使用可控退出码的 Host 脚本，是完成门回归测试，不代表真实 AI 已完成插件开发。

聚焦命令：命令 Runner 全集、差分基线/缓存测试、Plugin Delivery（排除现有 Playwright 入口故障）、Recovery 全集：**75 passed，1 deselected**。

扩大相关全集：上述两项验证测试、Runner、Delivery、Recovery、Debugging Completion、Domain Write Agent：**124 passed，32 failed**。在原始基线独立导出后复现全部 32 个失败：首组 26 failed / 95 passed / 1 skipped，补充组 5 failed / 20 passed，补齐相同浏览器依赖路径后原先 skipped 的浏览器测试也失败。没有新增失败；没有修复历史断言、工程配置或 Playwright `.bin` 解析故障。详细列表保存在证据目录的 `verification-logs`。

## P1：真实 Creator 运行

使用现有 `create_domain_write_creator_agent`、真实 `ProjectControlClient`、现有 `ui-plugin-development` Skill 与当前配置的 `mimo-v2.6-flash`。未用模拟模型、未改 Prompt。以明确插件开发委托运行备注输入/添加/列表/说明弹层任务。

三个工程真实保留在证据目录：A 页面使用 `src/design-system/index.tsx` 的自研 Button/Input/Card 与 CSS tokens；B 页面使用实际安装的 `antd@5.29.3`、ConfigProvider 和明暗算法；C 安装 Antd，但实际页面使用自研组件。各 Host 的 verify:ui、typecheck、build 单独通过。这些结果只验证原始 Host；不是 Creator 的生成插件验证回执。

首次工具准备因 runtime-conversation 消费者依赖下载超时失败；测试初始化随后使用已有构建产物。临时 Host 的 `.bin` 相对路径与 Antd 独立安装/type declarations 路径已在测试工程侧修正。完整 Antd 依赖保存在证据目录 `.dependencies/antd`，不修改仓库宿主依赖。B/C 保留首轮及环境稳定后的重试记录。

真实运行的最终状态、工具次数、源码差异见证据目录 `summary.json`。当前模型默认输出上限为 2048 tokens；C 的稳定环境重试发生一次续写后仍截断的错误，因此又以同一模型、同一 Prompt、仅在验收进程覆盖 `CREATOR_MODEL_MAX_TOKENS=8192` 运行三个场景。此覆盖未写入配置文件。A 的 8192 重试仍以 ModelToolProtocolError 终止。A 首轮 600 秒超时，45 次模型工具调用、未进入开发授权或修改。B/C 首轮均为 `ModelToolProtocolError: MiMo returned malformed tool intent after one repair attempt.`。首轮 A/C 的测试清理曾调用不存在的 `creator.close()`，发生在证据文件保存之后；已修正验收脚本，未改变 Creator 实现。错误与超时均不得记作交付成功。

8192-token 最后一轮结果：

| 场景 | 模型提出的工具调用数 | 最终结果 | 生成源码/依赖变更 |
| --- | ---: | --- | --- |
| A 自研 Design System | 13 | ModelToolProtocolError | 无 |
| B 实际使用 Antd 5 | 41 | 600 秒 TimeoutError | 无 |
| C 安装 Antd、页面使用自研组件 | 50 | AgentNoProgressError：超过现有 24 次模型调用预算 | 无 |

B 的真实授权计划保存在 `B/outcome.json`：其 `uiScope` / `deliveryContract.reusedComponents` 选择 `@agent-ui/react` 的公共 Button/Input、AgentUIRoot tokens 和 Popover facade，而非当前 `src/App.tsx` 实际使用的 Antd Button/Input/Card、ConfigProvider 与主题；`componentBasisRefs` 为空。工具记录确认它已读取该页面和依赖清单，却未将这些 Host 组件/主题证据绑定到计划。这是**计划阶段的选型偏差**，不是实际生成 import 的结论。没有用 Prompt 修改、额外选型规则或组件抽象层掩盖此失败。

A/C 没有形成开发计划；B 的计划未进入创建阶段。读取记录不能证明成功复用组件。三者均缺少实际 Plugin import、生成源码、Creator Host 验证和最终成功交付回执，P1 不通过。独立 Host 静态验证结果不补充或替代这些缺失的 Creator 证据。

## P1：视觉证据

复用工作区现有 Playwright/Chrome。A/B 的 1440px / 420px × light / dark 共 8 张截图，浏览器异常为 0，测得横向溢出为 0；保存字体、字号、padding、圆角、颜色和控件矩形。

**这些是 Host 基线截图，不是生成插件截图。插件的表单/按钮/弹层、主题匹配和跨插件样式隔离尚未验收。**

人工审图发现：420px 下原始 Platform Host 的固定历史侧栏把会话区挤得过窄。该基线布局未通过可用性视觉验收，不能用“无横向溢出”替代视觉通过；本次未扩大范围修改它。

## assistant-ui 升级边界

`node packages/react/scripts/check-assistant-ui-upstream.mjs` 通过：`assistant-ui upstream-owned Elements: OK`。固定 upstream revision 为 `3542d602272a62eddeb8989befc910841c267022`。P0 提交文件不包含 vendor、Runtime、官方插件 ownership 或升级规则。测试 Host 使用包持有的 vendor，没有独立 vendor 副本；`summary.json` 明确记录此限制，不以空哈希比较宣称通过。仓库 vendor 的基线/工作区差异为空。没有执行 assistant-ui 升级；不能据此声称完整升级/发布 gate 已通过。

## 复现入口与证据

验收脚本：`packages/creator-python/tests/live/ui_selection_acceptance.py`；Playwright 截图脚本：`packages/creator-python/tests/live/ui_selection_visual.cjs`。

证据根目录：`/Users/yifei/.codex/visualizations/2026/10/08/01a11971-df82-7e90-88d8-47db50c95f72/ui-selection`。

每个场景保留 `request.txt`、Host 全源码、`baseline-hashes.json`、`.agentuicreator/logs/*.jsonl`、`model-tool-calls.json`、`host-calls.json`、`activity.json`、`outcome.json`；各场景历史轮次在 `attempt-*/`。截图和 `visual-observations.json` 位于根目录；全集/基线回归与 Host 检查在 `verification-logs/`。

在新输出目录重跑：先将真实 Antd 5 安装到独立目录，令 `CREATOR_ACCEPTANCE_ANTD_MODULES` 指向其 node_modules，并共用 Host 的 React/React DOM/@types 以避免重复实例；设置 `CREATOR_ACCEPTANCE_OUTPUT`，以 `PYTHONPATH=packages/creator-python` 调用验收脚本 `setup`，随后分别调用 `A` / `B` / `C`。`setup` 使用现有工作区构建产物；如产物不可用必须报告失败。Host 启动端口 A=5291、B=5292，然后调用截图脚本。截图脚本不自动宣称插件通过，需要对真实生成插件另行完成交互检查。

结论：P0 的 Host 证据与完成门一致性修复及回归已交付。P1 的真实调用和宿主基线证据已执行并保存，真实插件选型与插件视觉完成标准仍未达成。
