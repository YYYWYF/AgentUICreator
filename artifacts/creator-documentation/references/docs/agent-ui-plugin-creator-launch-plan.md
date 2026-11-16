# Agent UI Plugin Creator 架构与执行边界

本项目构建消费 AG-UI 的 Agent 前端。Creator 是开发期通用 Coding Agent，理解用户请求并修改目标 React 工程；最终应用独立构建、部署和运行。

## 职责与交付

| 层 | 职责 |
| --- | --- |
| Creator Agent | 按任务检查、编辑和验证，不负责生产期业务推理 |
| AppUIModel | 布局、Plugin 实例身份、启用关系和语义组合 |
| UI Plugin | 前端行为、展示和对公开能力的消费 |
| UI Runtime | Plugin 激活、Service 生命周期、SlotRegistry 与确定性渲染 |
| Conversation Runtime | 会话、消息、Composer、Tool、Reasoning、历史与运行交互 |
| AG-UI | 每个 Thread 所属业务 Agent 的消息、状态、工具和运行事件 |

六个独立版本公开包为 Core、Renderer、Runtime、Plugins、Web Component 和 Creator，使用 `@za38.03/agent-ui-*` 包名。Operator 是 Creator 内部模块。Plugins 同时交付运行组件、catalog 和精确源码快照。

Creator、Operator、Node 文件工具及更新服务不进入生产前端。项目自行拥有 UI 库、样式和所需依赖。当前交付结构见 [插件所有权](architecture/npm-default-plugin-source-ownership.md)；Conversation Domain 的具体职责见 [Conversation Runtime 架构](architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md)。

## AppUIModel 与布局

AppUIModel 是布局与 Plugin 组合的唯一持久化事实。组件 props、renderers、文案和业务函数写在项目代码中，不放进 JSON。保留已有实例身份、启用状态和子插槽，不擅自迁移持久化 Schema。

Layout 使用 Row、Column、Stack、Panel、Slot 和 Sidebar。父 Row/Column 的 `sizes` 管理轨道；Panel 管理自身允许的尺寸。布局位置、宽度、顺序和响应式关系通过模型修改，不用 CSS order、反转布局或绝对定位绕过组合事实。

Runtime SlotRegistry 管理插槽与贡献的运行关系。运行期派生身份不写回 authoring 模型。当前字段以 Runtime 公开合同和受控操作 Schema 为准，不维护第二套 JSON 配置模型。

Creator 通过 `inspect_ui_project` 获取当前 authoring refs、hash 和目录，通过 `mutate_app_ui_model` 修改健康组合。无效模型使用受控源检查和修复工具，不用通用文本编辑覆盖 AppUIModel 或生成 Registry。

## 项目应用层、实现与 Shell

官方 Plugin 默认由项目薄应用层导入 npm 公开组件。先修改该层的 props、children、renderers、组合和局部样式。新增语义子插槽需同步本地 manifest、definition 和实际 renderSlot 出口；保留包原有插槽。

实现内部确需本地维护时，先展示指定 Plugin、实际安装版本、文件闭包和影响范围，取得明确源码接管同意，再从准确快照提取。接管保持同一 Plugin ID、实例、应用层 props 和服务接线。vendor、共享 Context 和 Runtime 不作为插件定制目标。源码同步只合并实现子树，验证并明确采用后才推进 BASE。

产品 Shell 位于项目 `application/shell/`，初始化只交付选定形态的组件和 CSS，通过 `createAgentUIProject({ Shell })` 静态绑定。关闭面板隐藏子树而不销毁会话和服务。Runtime 通过 `surfaceRef` 观察容器，不根据产品 Mode 选择路由或推断 DOM。

## Plugin Services

跨 Plugin 共享能力使用 Service；单个 Plugin 内的私有 UI 状态使用组件状态。Service Contract 是稳定能力接口，不是具体 Provider 的源码引用。

- Provider 在 definition 声明 `provides`，在同步 `setup({ services })` 中注册能力并返回清理函数。
- 核心运行依赖声明 `inject`；有完整 fallback 的增强依赖声明 `optionalInject`。
- `provides`、`inject`、`optionalInject` 两两互斥。组件可读取自身提供的服务；setup.get 只读取声明的依赖。
- Consumer 使用 `usePluginService`；持续观察状态时使用 `usePluginServiceSnapshot` 和稳定的 getSnapshot/subscribe 合同。
- Provider 停用、替换或移除时清理 Service；硬依赖 Consumer 随服务可用性失效和重新激活，不能持有已卸载 Provider。
- 同名服务重复提供确定性失败，依赖顺序不取决于 AppUIModel 对象顺序。
- 已有 Service 的纯消费不要求创建新契约。新增或修改公共契约先解析 Owner、Consumers、依赖方式及路径，再修改项目代码和受影响的接线。
- 普通项目 Service 契约与实现修改不单独弹审批。可使用通用文件工具，或选择 preflight 工具检查拓扑、公共声明和文件版本，再以返回的 planId 应用；契约路径相对于实际 sourceRoot。保留只读、路径隔离、修改前新鲜读取和 hash 校验。

可运行的提供、订阅和清理示例见 [插件 API](../../development/plugin-api.md)。

## 会话与 Agent 交互

一个应用可组合多个 Agent 实例，每个 Thread 固定归属一个逻辑助手。同一助手的工作流按钮可按次指定请求 URL；只有显式新建会话才生成新 threadId。业务组件控制显示切换，历史导航恢复既有 Thread，保留上游持有的后台运行。AG-UI 由 canonical Conversation Runtime 处理，Plugin 消费公开 Hook、Service 和 render scope，不自行解析消息或创建 Client。接线见[多 Agent 接入](../../development/multiple-agents.md)。

标准消息、工具、状态、Activity 与中断保留各自语义。业务 Custom Event 是经过应用 Schema 校验的瞬时事件，不作为本地插件通信、持久状态或工具执行通道。

Frontend Tool 由应用明确选择并暴露，Plugin 提供能力，Tool UI 只展示。历史加载、切换、重挂载和 StrictMode 不得执行历史工具副作用。详见 [Frontend Tool 生命周期](architecture/frontend-tool-lifecycle.md)。

## Creator 执行

模型按任务决定工具和顺序，不实现固定需求分类、布局、开发、构建节点流程。先使用最小必要检查；已知目标不要求全目录调查，新增查询应对应具体缺口。

`inspect_ui_plugin` 提供身份、位置、所有权和实际安装类型；`inspect_ui_edit_context` 提供适用的编辑入口；通用文件读取、搜索和编辑继续可用。Skill 和文档提供知识，不授予权限。公开类型证明签名，不证明 UI 行为、样式或交付成功。

模型调用与图步数没有固定累计上限。调用数用于遥测，保留用户取消、单次请求超时、无进展检测、权限和显式确认。LangGraph factory 与共享 streaming runner 显式设置正无穷；升级时核对长任务和中断恢复。

模型输入按预算归档较大成功只读结果并保留可回查标识，必要时摘要历史。原始消息、checkpoint、工具与事务记录保留。摘要和快照不产生文件新鲜度、写权限或验证证据；当前请求、相关源码与未完成事项按预算保留。

## 修改、验证与恢复

读取当前目标后按 hash 和范围写入；并发内容变化时重新读取和协调。新增 Plugin 使用具体开发方案和对应创建工具。停用保留源码与位置；永久删除源码使用专用检查和明确授权。

事务记录真实 before/after 和当前 revision。撤销、再次应用检查当前内容，不覆盖后续用户编辑。源码事务与依赖安装恢复分别处理。

源码修改后验证当前 revision。delta 模式仅修复本次引入或用户明确要求的缺陷。新可视插件、依赖或样式集成执行相关构建。交付还需已组合实例、Runtime 和所声明交互的实际证据。缺少测试设施或观察时准确报告，不能用模型文字或静态通过替代浏览器行为。

详见 [开发决策](creator-plugin-development-decision-contract.md)、[交付与验证](creator-plugin-delivery.md) 和 [Creator 控制面](creator-control-plane-implementation-plan.md)。

## 语言、平台与更新

产品文案使用统一 locale，保持 en-US/zh-CN 字段与占位参数一致；不改 vendor 文案，不按翻译后的标签分支业务行为。

Windows 与 macOS 都需保持原生文件路径和逻辑资源路径分离，使用既有跨平台进程 helper。静态、单元、浏览器、真实服务与 Windows 实机验收分别报告。

更新由 [统一更新中心](architecture/unified-update-center.md) 的实际身份、兼容清单、具体方案确认、安装与验证控制。npm 安装、源码合并和 BASE 采用各自有独立授权边界。
