# Conversation Domain 架构

assistant-ui 是 Agent UI 的 canonical Conversation Domain 实现。一个应用可组合多个隔离的 Agent 实例；每个 Thread 归属一个逻辑助手，消息与生命周期只有一个 canonical owner。同一助手的工作流按钮可为每次发送指定 URL；只有显式新建会话才生成新的 threadId，打开历史恢复原 Thread。业务组件控制助手显示，后台运行由上游持有；工具续传、重试和审批恢复沿用原请求入口。具体配置方法见[多 Agent 接入](../../../development/multiple-agents.md)。

## 所有权

| 层 | 当前职责 |
| --- | --- |
| AG-UI 接入 | Runtime 的 ConversationRuntimeProvider、HttpAgent 与 useAgUiRuntime |
| Thread 与 Message | assistant-ui 会话、分支、消息顺序、流式合并和状态 |
| Composer 与附件 | canonical Composer、草稿、提交、取消、附件和编辑生命周期 |
| 工具与中断 | 上游原生工具执行与恢复生命周期；应用控制允许的能力 |
| UI Runtime | AppUIModel 编译、激活、Service、SlotRegistry 与诊断 |
| UI Plugin | 公开组件、产品适配、语义插槽，以及会话数据源和管理能力的实现；项目应用层负责选择与绑定 |
| Host | 地址、鉴权、历史接口配置或自定义数据源，以及明确暴露的页面能力 |

生产接入由 `packages/runtime/src/ConversationRuntimeProvider.tsx` 实现；Plugin 消费产品公开 API，不导入实现路径或创建自己的 AG-UI Client。Core 契约不依赖 UI，Renderer 只处理布局。六包交付及源码所有权见 [插件所有权](npm-default-plugin-source-ownership.md)。

## 渲染与语义组合

`conversation-surface` 承担产品会话边界，保留 canonical Thread 对消息、工具组、reasoning、附件、滚动、审批和交互的处理。

AppUIModel 选择实际 Plugin；Runtime 解析语义 Slot。普通 content Slot 使用 renderSlot；runtime entity renderer 使用 renderScopedSlot 和受支持的 scope。空的 renderer Slot 不暗中恢复已移除的 Plugin。具体合同见 [Scoped Renderer Plugins](scoped-renderer-plugin.md)。

`response-footer` 在一轮完整回复尾部显示一次。Copy/Export 作用于该回复，Reload/Branch 委托现有 Conversation Runtime，不建立另一套消息存储。详见 [Response Footer](assistant-response-footer.md)。

## 应用层与 upstream

官方实现通过 Plugins npm 包交付。项目薄应用层桥接当前 scope、服务、props 和组合；公开 API 足够时不提取源码。上游会话行为、共享 Runtime 和 Context 不按 Plugin 复制。

产品适配维护统一 locale、主题容器和来源记录。vendor 保持未修改、locale-agnostic。上游更新检查固定来源和适配锚点；项目实现同步只处理已授权的实现子树。

## Thread 与历史

Thread 绑定在一次挂载期间保持稳定。项目的 `services/conversations/data-source.ts` 直接提供 list/get/delete/rename/archive/unarchive 方法，拥有请求、鉴权和业务响应转换。list 返回会话数组，或分页结果 `{ conversations, nextCursor: string | null }`，接受可选 `cursor` 和取消信号；get 返回带 history 的统一详情。npm 不提供历史 HTTP 工厂或自动识别后端包装。项目应用层按 Agent 实例绑定地址和请求传输，保留预览代理及取消信号；也可通过 `Agent.conversationDataSource` 替换数据源。

会话列表的分页追加、请求去重和结束状态复用 assistant-ui 的 `loadMore`。项目数据源将后端 `body.next_cursor` 映射为 `nextCursor`，并将下一页游标作为 URL query `cursor` 发送；`null` 表示结束。服务保留已加载会话缓存，通用 Thread Binding 传递分页读取和下一页游标。分页追加保持列表 revision token，避免订阅回调触发 `reload` 使正在追加的页失效；其他元数据更新替换 token。适配器整表 reload 读取当前累计快照及末尾游标。分页后的普通 refresh 更新第一页并保留已加载尾部和末尾游标；第一页已覆盖全量时替换列表。默认列表用 IntersectionObserver 触底触发原生分页，失败保留原游标并等待手动重试，搜索仍只过滤已加载会话。

应用可通过可选的异步 `beforeRequest` 在首次发送时分配新会话的后端身份。未绑定的 Thread 使用 assistant-ui 本地草稿标识；回调返回的 `threadId` 或随后补全的默认 ID 在首次请求前绑定，此后保持稳定。Runtime 保留原生 Thread/消息实例，将 Host 句柄、历史管理调用和后续 AG-UI 请求映射到该正式身份；不因分配身份创建另一套 Runtime。回调对每个出站请求执行，`runId` 按本次运行确定，取消和失败不得发送迟到请求。生成项目不默认配置此回调。

`conversation-service` 插件拥有业务 DTO/DataSource 契约、列表/详情缓存与会话管理，处理 `<think>` 等历史兼容，并提供通用 `agent-ui.thread-binding` 工厂。项目薄应用层负责服务创建、注册和清理；Runtime 通过通用接口加载消息、封装 assistant-ui 官方转换并运行会话，不创建具体业务会话服务。直接调用 Runtime 转换器不包含插件的特殊兼容。读取历史不发起新 Agent 推理，也不在历史 Tool UI 挂载时执行工具。

历史数据、当前 Agent state、瞬时消息和应用事件分别处理，不将历史消息回放当成实时 AG-UI 事件流。插件可调用业务接口管理保存的会话，但数据库持久化属于业务后端，canonical 会话分支与运行生命周期仍使用 assistant-ui，不另建仓库或 Runtime。页面内提示通过 [临时消息服务](transient-assistant-messages.md) 展示，不写入 Agent 消息和历史。

所有输入插件只通过 setData 提交自身 JSON，由 Composer 汇总为唯一的 pluginData，并在一个最终适配器中组装请求；不维护第二份原始选择集合或插件级请求适配器。Composer、技能、引用及 @、/ 的具体输入规则属于 Plugins：默认请求组装、选择快照、引用文本转换和展示均由对应能力实现。Runtime 不依赖 Plugins，不解析这些业务数据；它只承载可选的输入控制器接口和共享通用 Context，在原生 Thread 生命周期内绑定并调用应用选定的实现。默认实现由 `createDefaultAgentUIPresentation()` 显式选择；底层 Runtime 单独使用时不加载官方输入规则。原生正文、引用、附件和编辑生命周期仍归 assistant-ui。技能由两个 UI 插件通过 `conversation.skills` Service 共享选择，通用 `setData({ id, label })` 仅收集发送数据并自动记录来源；领域解析及消息元数据转换归 Skills，`ctx.skill` 只是生成项目 Composer `request-adapter.ts` 的可修改默认映射，不是 Composer 或 Runtime 的内置规则。

项目配置和自定义适配不属于插件实现 BASE，npm 升级保留它们；已接管的插件通过单独源码同步合并更新。本次移除旧工厂，不提供旧配置兼容。准确文件归属见 [插件所有权](npm-default-plugin-source-ownership.md#1-通用基础设施与应用配置)。

AG-UI 请求的 `messages` 默认只发送本次用户消息，不附带历史用户或 assistant 消息；完整历史仍由本地 Conversation Runtime 展示，后端按 `threadId` 维护上下文。前端工具续传只发送本次工具结果；中断恢复使用原生 `resume`，`messages` 只携带中断后追加的消息，没有新消息时为空。

Host 通过 `Agent.ctx` 设置默认业务参数，通过 `sendMessage(input, { ctx })` 添加本次参数，后端从 `forwardedProps.ctx` 读取。用法见[业务上下文](../../../development/business-context.md)。

## Frontend Tool 与 HITL

应用决定允许向 Agent 暴露的前端工具，Plugin 提供 activation-scoped Service，Tool UI 显示参数、状态与结果。执行、取消和标准 continuation 使用原生工具链路，详见 [Frontend Tool 生命周期](frontend-tool-lifecycle.md)。

Structured interrupt 通过完整、匹配的响应集合恢复原有会话。用户提问卡片的客户端 Tool Result 与后端审批中断不是同一协议；不能把用户回答伪装成普通消息或从历史 renderer 发起恢复。

## 数据、事件与展示

主会话文本事件的应用 metadata 由 Runtime 内的消息 metadata 补充层通过同一个 HttpAgent 订阅并读取，在上游尚未透传实时文本 metadata 的版本上提供兼容。补充数据绑定原生消息及服务端 ID，按 Thread 隔离；完整历史由原生消息 metadata 提供，快照导入后采用其权威值。统一 `useConversation` 的 `state.message.metadata.custom`、`state.thread.messages` 与 `getSnapshot().messages` 包含同一份实时补充数据。Plugins 的同一消息视图从 `metadata.custom.speaker` 派生类型明确的只读 `speaker`，当前消息、列表、即时快照与 `ConversationIf` 共用解析规则；有效对象包含 id/name/可选 avatarUrl，缺失或不合法为 undefined，显式隐藏为 null，展示 fallback 不混入数据。身份未变化时复用派生对象。这里不新增 Hook、状态仓库或 Runtime 输入字段，也不改写原生消息对象；直接使用上游状态 Hook 不包含补充数据或派生字段。正文、排序、分支、运行和取消仍只有 assistant-ui 一个 owner，补充层不订阅第二条流或运行 Agent。子 Agent 文本事件不写入主消息补充层。`conversation-surface` 读取统一消息视图的 `speaker` 并显示消息头像和名称，props 控制展示，AppUIModel 不存放身份字段。当前 LangChain 历史从 `additional_kwargs.metadata.speaker` 恢复身份；后端负责持久化。

AG-UI 的消息、STATE、ACTIVITY、SUBAGENT 和 CUSTOM 保留各自语义。Runtime 做协议边界映射，Plugin 不重建投影器。应用自定义事件先经过应用 Schema，再向声明的 Plugin 发布。

具名后端 Tool UI 与 Data Message UI 只展示已有结果，不授予 Frontend Tool 权限。消息插件使用公开的 defineDataMessageUI，将注册保留在 definition.dataMessageUIs，声明 manifest.data.messageUI，并组合到 applicationPlugins；类型泛型不代替 payload 的运行时校验。启用实例的注册名必须有效且唯一，冲突在组合发布前报告 DATA_MESSAGE_UI_INVALID_NAME / DATA_MESSAGE_UI_NAME_CONFLICT；停用或移除清理注册，不用优先级或隐式覆盖解决冲突。完整开发示例见 [CUSTOM 消息渲染](../../../development/custom-ag-ui-events.md)。

同一个 CUSTOM 可以形成具名消息内容，也可经应用事件入口提供瞬时通知，两条消费路径不能混为一体。Plugin 事件订阅使用应用 appEventSchemas 和 manifest.data.events 中的同名声明，保留 root/subagent producer，停用时清理，不重放历史、不把通配符当成注册语法。用法见 [业务事件订阅](../../../development/plugin-api.md#订阅业务事件)。应用 Schema 的转换不改写会话消息的原始 data，消息 renderer 仍校验自己的输入。

AgentPlan 使用权威 Activity，不从 elapsed、工具调用次数或推理文本推断进度。ACTIVITY_DELTA 更新同 messageId/activityType 的既有项，不追加另一条计划；快照、delta 和恢复规则见 [AgentPlan Activity](authoritative-agent-plan-activity.md)。多模态结果沿用标准内容数组及共享展示。

## 验证边界

检查单一连接、切换与草稿、工具/审批/中断恢复、历史副作用隔离、语义插槽、语言/主题、卸载清理和安装产物。源码、静态检查、受控 Mock、实际浏览器、业务服务与真实 Windows 分别记录，不由其中一层通过推断其余层通过。
