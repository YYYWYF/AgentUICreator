# 宿主 UI 智能复用 P1 最终验收结果

日期：2026-10-09（Asia/Shanghai）。基线：`d058e342dd7fc2f539ae154c9ba3c7d4d1f6daef`。

**HOST_UI_INTELLIGENT_REUSE = FAIL，未签收。** B 的真实模型提案选择了错误的组件体系，同时存在工具参数协议错误和 Host 环境阻塞。没有生成插件，A/C 及插件浏览器视觉验收按停止条件未执行。

| 项目 | 结果 |
| --- | --- |
| 真实模型工具 Smoke | PASS，mimo-v2.6-flash，合法 value=41；消费 PROBE_RESULT_42 |
| B 宿主源码调查 | 已实际读取 src/App.tsx、AgentMount.tsx、主题 CSS、package.json 等 |
| B UI 选型 | FAIL_UI_SELECTION：提案选择 @agent-ui/react 控件及 AgentUI tokens |
| Host 接收、授权及依据哈希 | NOT_RUN：模型工具参数不合法，提案未到达 Host |
| 插件创建、注册、挂载 | NOT_RUN，没有源码写入 |
| 最终 revision 静态验证和 Build | NOT_RUN，没有插件交付回执 |
| B 插件视觉与交互 | NOT_RUN，没有真实生成插件 |
| A/C | NOT_RUN，B 未通过 |

## 真实运行证据

沿用原 ui_selection_acceptance.py、ObservedHost/ProjectControlClient、真实 Creator、既有 Skill、完成门和 static_only 模式，没有 Fake Model 或手写业务插件。运行用隔离工作树的基线 Python、Skill 及编译包，Host 是复制的既有 Fixture，用户宿主工程未修改。模型配置来自现有工具宿主配置，不复制密钥到报告。

Smoke 耗时 13.32 秒并通过。但小规模工具兼容通过不证明完整 Creator 能交付。B 耗时 313.42 秒：指标为 22 次模型调用、21 次 transport attempt、52 个工具调用、50 个有效调用、2 个参数失败。无 transport failure。配置保持 maxTokens=2048、单请求 120 秒、整体 600 秒、maxRetries=2、模型调用预算 24，未修改默认配置、Prompt、Skill、预算或超时。

模型读取 src/App.tsx 后，实际发出 prepare_ui_plugin_development 提案，其中 reusedComponents 为 `@agent-ui/react public Button`、`@agent-ui/react public Input`、`@agent-ui/react Popover/Dialog facade` 以及 AgentUIRoot CSS theme tokens。宿主页面真实 import Antd 的 Button/Input/Card，ConfigProvider 包围 AgentMount，并使用默认/暗色算法。故本次模型提出的 UI 复用方案不符合 B 要求，标记 FAIL_UI_SELECTION；该证据来自真实模型输出，而非对模型意图的推测。

须区分：这是**模型提出的未被 Host 接收的计划**，不是 Host 授权成功的计划。deliveryContract 被生成为字符串 `<parameter=capability>business-notes`，其余契约字段错误地放在顶层；另一个同名调用参数为空。协议诊断分别为 deliveryContract/model_type 与 deliveryContract/missing。提案没有合法 componentBasisRefs/uiScope，Host 没有接受开发计划或核验依据哈希。

第 21 个 trace finishReason=length、输出 2048 tokens；既有一次 bounded continuation 后仍报 ModelResponseTruncatedError。第 22 个 trace 虽有 tool_calls，参数校验仍失败。归入 MODEL_PROTOCOL_ERROR，不能把它描述为网络超时或单纯 NO_PROGRESS，也不能仅因协议错误抹去明确的错误 UI 提案。之前的多轮读取/搜索未推进到授权；日志仍保留，不推定唯一根因。

activity files=[]、validations=[]，projectRevision=0，deliveries=[]，源文件和依赖变更列表为空。没有 create_custom_plugin、Registry/AppUIModel 写入，没有 statically-verified 回执，也没有 Runtime 或浏览器成功证据。没有重复 600 秒 MiMo 测试；不增大 token 预算、不改提示词来获取通过结果。

## Host 环境限制

1. 隔离基线离线 pnpm install 和真实 Host package builds 成功，但现有 fresh_host 初始化失败：AGENT_UI_INITIALIZATION_VERIFICATION_FAILED，官方 agent-identity/styles.css:10 的 `[data-slot="sidebar"][data-state="collapsed"] .agent-identity-heading` 被 PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED 拒绝。原始诊断在 checks/p1-final/setup.log。
2. 优先复用既有 A/B/C Fixture，保留源码、项目配置和 source-lock，并重链接基线编译包。B 实际安装 antd 5.29.3，React 页面有真实 Antd 控件、Provider 和明暗算法。恢复必要 .agent-ui 元数据后 verify:ui 通过；第一次缺失元数据的诊断不作为最终 verify:ui 结果。
3. 旧 Fixture 的 framework/runtime 源码与基线 runtime-core 的 SidebarNode 合同不匹配。测试前 typecheck/build 已报 children/slotId 等 TS2339 及隐式参数类型错误，因此 Host **不满足干净基线前置条件**。这些错误早于 Creator，不能归因于生成插件；也不能把这个诊断性 B 运行作为完整有效端到端验收。React 浏览器可运行性未验证。

本轮没有修复上述生产代码、改写 Fixture 的 framework/runtime 或放宽校验。最小后续建议：独立修复官方 agent-identity 的插件根作用域选择器；以同一基线发布物准备合同一致的 Host 后重跑 B。模型侧先定位截断续写与契约对象结构错误，再确定是否需要另一个已验证的真实模型对照；本轮不改预算或默认配置。选型偏差也须独立跟踪，不能只解决参数结构就签收。

## 确定性回归及边界

- test_plugin_development_ui_basis.py：33 passed。
- 授权回归：17 passed / 60 failed，与原始失败名称完全相同，新增失败 0。
- P0 回归：125 passed / 31 failed，新增失败 0。历史记录为 124/32，本次 test_behavior_tool_runs_real_project_browser_tests 不再失败；不据此宣称所有 P0 问题已修复。

回归运行于指定基线，并按原始失败名称比较。完整诊断在 checks/p1-final，比较在 regression-comparison.json。历史 60/31 项失败仍为失败，仓库 CI 未重跑、不能记为 PASS。

生产实现和现有测试断言零改动：P0 验证、PluginDevelopmentAuthority、assistant-ui vendor、AG-UI/Runtime、官方插件 ownership、UI 依赖均未修改。仅交付本轮报告和证据；此前第一阶段报告保存在 phase1-REPORT.md / phase1-summary.json。

## 交付文件

summary.json 汇总阶段状态；model-tool-timeline.json 保留模型及工具时序、协议指标、真实提案；host-ui-evidence.json 保留源码 SHA256、依赖版本和 Provider/主题事实；delivery-receipts.json 明确没有有效开发计划/交付；generated-source-diff/result.json 记录零源码变更；visual/results.json 明确 NOT_RUN，不用 Host 基线截图替代插件截图。environment.json 记录提交、运行环境和隔离原始证据路径。

B 完整成功案例未取得，任务要求的成功验收条件尚未达成。按本轮测试范围输出失败及阻塞证据，不扩展修复架构，不执行 A/C 的完整模型测试，不签收整个功能。
