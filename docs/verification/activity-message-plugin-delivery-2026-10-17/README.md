# 第六批：Agent 状态、计划、任务进度与生成文件

新增 `agent-status-message`、`agent-plan-message`、`job-progress-message`、`generated-file-message`，现代 npm 入口累计 **20 个**。其余 24 个现代插件资源与历史兼容 ID 见 [inventory.json](inventory.json)。本轮没有修改或修复旧 migrated fixture。

## 实现

四个插件保留原 ID、manifest、协议名称和生命周期语义，按同一 delivery/catalog 生成 npm 入口和精确版本的可提取源码。每个插件的 component、package-definition、展示适配和 projection 均有独立 canonical 文件。旧资源入口保留原导出名并转发到同一展示 owner；历史基础投影合同和 helper 文件保留兼容，不覆盖已安装工程的旧源码或历史 BASE。原始 assistant-ui upstream 未修改。

这些是 headless 消息插件，在 AppUIModel 的 applicationPlugins 中声明。通用薄层生成器根据 registration kind/name 保留 toolkit 或 data-message 注册，并把本地应用 renderer 注册进去；Component 返回 null。它们不是布局组件，不通过 Layout Slot 伪装注册：

| 插件 | 原注册 | 应用层定制 |
| --- | --- | --- |
| agent-status-message | toolkit: mock_agent_status | rootProps/statusProps、renderStatus、Fallback |
| agent-plan-message | data-message: agui-activity/agent-plan | rootProps/planProps、renderPlan |
| job-progress-message | toolkit: run_ci_job | progressProps/renderProgress、Fallback；既有 state/abortRun |
| generated-file-message | toolkit: generate_file | fileProps/renderFile、Fallback |

任务进度的 runtimeContext 标记让工具在薄层中调用工程已有的 useAgentState/useAgentRuntimeActions，再传入 npm 或本地实现。直接使用公开组件时，Host 同样需要提供这些 props。没有创建 Runtime、复制 Context 或另建 AG-UI 订阅。状态仍派生于真实工具生命周期，计划仍校验显式 activity payload；进度的等待用户操作、终态、取消、elapsedMs 和文件的非成功/非法 URL 回退均保留。

普通 props/组合修改无需接管。需要改实现时仍由 Creator 原生询问，用户同意后提取准确安装版本，仅切换应用层 import；保留 ID、实例、配置和已有定制。源码同步只合并 source/，其中同时包含展示与投影文件。toolkit/data-message 注册与 Host state 桥接留在应用层，不进入官方 BASE 或源码合并。

ownership 新增可选 applicationContractHash，绑定组件/scope、注册 kind/name 和 Runtime 桥接约定。新目标改变这些约定时拒绝源码同步，要求单独迁移应用层；不会自动覆写用户代码。当前不提供不兼容合同的自动迁移。没有该字段的历史普通 UI 插件仍可做兼容源码同步；本批新 ownership 会记录它。

## 验证

相关 **270 项测试通过**，详细记录见 [validation.json](validation.json)：

- Plugins 45 项：npm 与实际 portable snapshot 的 props、默认展示、renderer、状态与回退；真实原生 data-message 路由；同一 Host Context 的进度订阅/取消；上一批消息能力、locale、来源布局与生成桥接回归。
- Operator 102 项：101 项相关回归，加 1 项历史 ownership 兼容检查。完整生命周期覆盖全部 19 个非 Composer 现代插件。使用真实 TypeScript/Vite 验证带定制 props、中文注释与 CRLF 的薄层，验证精确版本接管、npm 替换隔离、展示和 projection 文件的冲突合并、单一注册、ID/AppUIModel 字节保留及旧源码有/无 lock 时的定制保留。新增四个 ID 的注册元数据不匹配、进度 Runtime 桥接不匹配和源码同步路由变更均拒绝写入。
- Creator Python 121 项：包括四个新 ID 的真实 LangGraph 确认中断、同意/拒绝恢复及源码写入边界。
- Node 包边界 2 项。

Plugins / Operator 构建和类型检查、公开声明检查、i18n、上游完整性及 diff 检查通过。实际 tarball 的 20 个现代入口、21 个 portable closure、417 个 canonical snapshot、227 个 portable/runtime 摘要记录全部核对；所有 exports 目标存在，Windows 声明清理所需的主题类型保留，没有打包 tests/node_modules。见 [tarball.json](tarball.json)。

## 验证边界

没有跑或修复全量旧 fixture，没有宣称全量测试通过。升级目标使用临时合成的 0.0.2 包/插件版本；并非真实新 upstream 升级，也没有发布 npm 包。

本轮没有重新运行真实 Creator UI/外部模型流程或生成新的过程截图；原生 Runtime、询问中断及生成工程测试不是该流程的替代证明。未做原生 Windows 验收；执行了 Windows drive/UNC/path.win32 相关检查，以及带中文、空格的工程原生路径与打包验证。新增代码的模块路径使用逻辑 `/`，文件访问使用原有 native path API。
