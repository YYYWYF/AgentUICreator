# 宿主 UI 智能复用阻断重跑结果

日期：2026-10-09（Asia/Shanghai）。最新 `origin/dev` 基线：`62b7321c8e9767117abbe0b9f226c16b26d061c6`。

**HOST_ENVIRONMENT = PASS。SCENARIO_B = NOT_RUN，未签收。HOST_UI_INTELLIGENT_REUSE = NOT_ACCEPTED。**

工程阻断已解除；一次真实复杂工具探针未提交组件依据字段，未达到本轮门槛，停止后续依赖步骤。没有执行真实 Creator B，没有生成业务插件。

| 问题 | 最新状态 | 证据与原因 |
| --- | --- | --- |
| CSS 校验 | RESOLVED | 全新 Platform Host 初始化和 verify:ui 成功；当前官方 agent-identity 使用插件根作用域选择器。没有删除插件、修改 CSS 或放宽样式校验。 |
| Sidebar/Host 合同 | RESOLVED | 从当前源码初始化的 B 使用同基线 Framework/Runtime；verify:ui、typecheck、build 全通过，无 children/slotId 类型错误，浏览器正常渲染。 |
| 复杂工具调用 | FAIL | 原始调用 deliveryContract 为对象、Schema 校验通过、没有截断；但 componentBasisRefs 字段未提交，uiScope 仅列范围，未说明选型依据，不满足本轮接受条件。 |
| 宿主 UI 选型 | NOT_RUN | 独立探针提案包含 Antd 控件，不代表真实 Creator B 的自主调查、选型和 Host 授权。 |
| 真实插件交付 | NOT_RUN | 未启动 B Creator，无创建、注册、挂载、最终 revision 验证及交付回执。 |

## 工程证据

通过 fetch 确认最新 dev，并创建隔离工作树 `/Users/yifei/.codex/worktrees/host-ui-rerun/AgentUICreator`。Source Registry、Project Control、React Runtime、Creator Python 和 Fixture 均来自上述 HEAD。使用 `pnpm install --frozen-lockfile`、`node scripts/prepare-host-packages.mjs` 和 `node scripts/run-python-tests.mjs --setup-only`，新建依赖及 Python 环境，没有复制旧 dist 或 Framework/Runtime。正式准备状态摘要保存在 host-baseline/preparation-state.json。所有 Project Control/初始化进程均在当前包构建后启动，未观察到 CREATOR_PROJECT_CONTROL_RESTART_REQUIRED。

另建真实 Platform Host，初始化 exit=0；`npm run verify:ui` status=passed。官方 CSS 的两个祖先状态条件现在均以 `.agent-identity-plugin:where(...) .agent-identity-heading` 为根。完整样式与验证日志在 host-baseline/。两个历史错误码均未出现。

B 由原 `ui_selection_acceptance.py setup` 生成，不复用旧 B。保留原 App.tsx 的 Antd Button/Input/Card、ConfigProvider 包裹 AgentMount、theme.defaultAlgorithm/theme.darkAlgorithm。实际 antd=5.29.3，Fixture 声明 npm@11.0.0，按 npm run 执行三项检查。源码、package.json、主题和 SHA256 在 host-baseline/。

测试准备期间，外部 Antd 目录先出现 React 类型解析失败（Card TS2604/TS2786），首次浏览器也因外部重复 React 出现 invalid hook call。这是隔离依赖链接问题：只将外部依赖链接到 Host 已有 @types、React 和 ReactDOM，不改类型声明、源码或依赖版本、不新增 UI 依赖。保留首次失败日志；重新准备后重启 Vite（--force），再次执行全部三项检查，均 exit=0。最终构建仅有 bundle size 提示。

B 的 1440px / 420px、Light / Dark 基线浏览器检查均无 pageerror，Agent 插件可见，Antd Card 背景由 rgb(255,255,255) 切换为 rgb(20,20,20)。基线截图只放 host-baseline/，不充当生成插件的视觉验收。宿主 Antd 暗色切换不等于 Agent Runtime 自身主题也已同步；本轮仅证明 Provider 主题可用于宿主组件。

## 一次真实复杂工具探针

使用现有工具工厂和未修改的 PrepareUIPluginDevelopmentInput，模型 `mimo-v2.6-flash`。配置只从现有工具宿主读取到验收进程，不写默认模型配置、不改生产 Prompt。maxTokens=2048、单请求 timeout=120 秒、maxRetries=2，沿用 CreatorModelInvocationReliability；一次结构化调用，实际 transport attempt=1、retry=0，耗时 21.60 秒。输入 2112 tokens、输出 1014 tokens，finish_reason=tool_calls，没有空参数、非法 JSON、ModelResponseTruncatedError 或 Pydantic 校验错误。

原始参数中 deliveryContract 为合法对象，契约字段没有错误地放到顶层。模型 reusedComponents 包含 antd Button/Input/Card，同时混入 acme CSS 类和主题说明；uiScope 为 `notes input, notes list, help overlay`。模型没有提交 componentBasisRefs，而是在 reuseEvidenceRefs 中提供带描述的引用。这两个字段职责不同，不能由验收程序替模型搬运或拼接。

**本轮 FAIL 是组件依据传递门槛失败，不是 Schema/Pydantic 不兼容。** 当前 Schema 将省略的 componentBasisRefs 默认成 []，故结构校验 PASS；当前 Authority 又要求新建可视化 Plugin 提供真实组件依据（authority.py 的 visual_creation 检查）。验收未执行工具或 Authority.prepare，未获得 Host 回执、哈希绑定或授权；不能声称 Host 已拒绝，也不能将此归为 Host 错误拒绝合法证据。源规则只解释为何默认空数组不能作为交付依据。

探针是独立结构兼容性测试，提供真实 Host 文件内容，没有执行完整 Creator discovery/Skill。本探针提示要求所有必需字段，而 componentBasisRefs 在结构 Schema 中是可省略字段，因此这个结果只能证明本次输出未满足本轮明确接受条件，不能证明真实 Creator 下必然失败、无法修复，或生产选型逻辑存在回归。没有修改生产提示、额外重试或进行 MiMo 超时诊断。未配置第二个可直接使用的验收模型，没有变更默认模型进行对照。

原始参数、Schema 校验结果、判定与可复现探针脚本在 model-protocol/。通用可靠性 metrics 的 modelCalls/toolCalls 为 0，是因为该探针没有运行完整 Creator middleware；实际调用数使用 transportAttempts=1 和返回的一个 tool_call，不将这些零值误解为没有真实调用。

## 停止条件与交付边界

依据用户指定的顺序，在复杂工具依据门槛失败后停止。`ui_selection_acceptance.py B`、Host 授权、业务源码创建、Registry/AppUIModel 挂载、生成后 typecheck/build、交付回执及四视图插件交互全部 NOT_RUN。generated-source/result.json 确认源码与依赖清单变更为零。没有手写备注插件，没有用 Host 基线成功替代生成插件验收。A/C 没有执行。

生产实现、assistant-ui vendor、AG-UI、Runtime、Plugin 协议、P0 机制、Schema、Pydantic 和模型默认配置均未修改。此次只新增本 rerun 目录；历史 REPORT.md 和原始证据保留。隔离原始日志位于 summary.json 的 rawEvidenceDirectory，交付文件不含密钥或完整未脱敏模型请求。没有提交或推送 Git。

下次若继续，可先在真实 Creator 既有工作流中确认 componentBasisRefs 与 uiScope 的证据提交，再进入 B；本轮没有取得首个智能复用宿主 UI 端到端成功案例。即使后续 B 成功，仍须 A/C 泛化验证才能评价完整 HOST_UI_INTELLIGENT_REUSE。
