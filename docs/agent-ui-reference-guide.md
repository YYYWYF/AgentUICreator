# Agent UI 参考项目选择

本项目的产品需求、AG-UI 语义、Plugin Contract 与当前前端状态决定实现。参考项目提供适用层的模式，不能覆盖这些合同，也不能替代目标项目实际安装的 API。

## 按问题选择

| 问题 | 参考 | 使用边界 |
| --- | --- | --- |
| HITL、审批、中断、共享状态、前端工具与生成式交互语义 | CopilotKit | 理解 Agent UX，不引入其 Runtime、协议或后端 |
| Thread、Message、Composer、Tool、Reasoning 与会话生命周期 | assistant-ui | canonical Conversation Domain；通过产品公开入口消费 |
| 目标项目使用 Ant Design 时的 Agent UI 视觉表达 | Ant Design X | 只适用于该 UI Stack，不强制安装 Ant Design |
| AG-UI streaming、工具事件、快照、delta 到前端状态的映射模式 | TDesign AIGC | 参考状态映射，不替代 canonical Runtime |

先看目标 Plugin、应用层和当前项目约定。常规 props、文案、样式、已有插槽和组件组合定制，不要求重新研究外部参考项目。只为具体缺口查阅相应层，不同时引入所有参考。

## Conversation Domain

assistant-ui 拥有会话、消息、Composer、附件、工具和中断的原生生命周期。Agent UI Runtime 负责现有 Provider、AG-UI 接入、应用服务与语义组合的桥接；Plugin 不创建独立 Runtime 或复制 Context。

需要检查上游实现时，使用本地 `/Users/yifei/Coding/assistant-ui` 的已固定 revision，并核对项目 provenance；不把 main 分支或其他版本接口当成当前能力。当前所有权见 [Conversation Runtime 架构](architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md)。

## UI Stack 与组件 API

目标生成工程自行选择 UI 库或样式方案。先检查实际组件导入、Provider、主题、样式和已安装版本，再使用稳定公开 API。项目已有封装优先；包声明或文件名不证明实际运行行为。

官方 Plugin 默认使用 npm 实现，项目拥有薄应用层。先调整 props、children、renderers 和公开扩展入口；确需实现源码时才走明确接管。布局与语义组合属于 AppUIModel，不把组件参数或上游微型部件放进 JSON。详见 [插件所有权](architecture/npm-default-plugin-source-ownership.md) 和 [公开 props](architecture/plugin-public-props.md)。

## 交互与证据

保留标准 AG-UI 消息、状态、Activity、工具和中断语义。普通 UI 操作不伪造 Agent 事件，Tool UI 挂载不执行能力，历史恢复不重放副作用。跨 Plugin 本地能力使用 Service，应用自定义事件只承担应用声明的瞬时通知。

类型建立签名，源码建立当前实现事实，浏览器检查建立真实交互和视觉证据。三者不能互相冒充。验证范围与限制见 [交付与验证](creator-plugin-delivery.md)。
