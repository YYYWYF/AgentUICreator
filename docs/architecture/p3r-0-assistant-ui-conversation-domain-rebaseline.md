# Conversation Domain 架构

assistant-ui 是 Agent UI 的 canonical Conversation Domain 实现。一个 Agent 应用只连接一个业务 Agent Runtime，消息与生命周期只有一个 canonical owner。

## 所有权

| 层 | 当前职责 |
| --- | --- |
| AG-UI 接入 | Runtime 的 ConversationRuntimeProvider、HttpAgent 与 useAgUiRuntime |
| Thread 与 Message | assistant-ui 会话、分支、消息顺序、流式合并和状态 |
| Composer 与附件 | canonical Composer、草稿、提交、取消、附件和编辑生命周期 |
| 工具与中断 | 上游原生工具执行与恢复生命周期；应用控制允许的能力 |
| UI Runtime | AppUIModel 编译、激活、Service、SlotRegistry 与诊断 |
| UI Plugin | 公开组件、产品适配、语义插槽与项目应用层 |
| Host | 地址、业务服务、鉴权、历史来源和明确暴露的页面能力 |

生产接入由 `packages/runtime/src/ConversationRuntimeProvider.tsx` 实现；Plugin 消费产品公开 API，不导入实现路径或创建自己的 AG-UI Client。Core 契约不依赖 UI，Renderer 只处理布局。六包交付及源码所有权见 [插件所有权](npm-default-plugin-source-ownership.md)。

## 渲染与语义组合

`conversation-surface` 承担产品会话边界，保留 canonical Thread 对消息、工具组、reasoning、附件、滚动、审批和交互的处理。

AppUIModel 选择实际 Plugin；Runtime 解析语义 Slot。普通 content Slot 使用 renderSlot；runtime entity renderer 使用 renderScopedSlot 和受支持的 scope。空的 renderer Slot 不暗中恢复已移除的 Plugin。具体合同见 [Scoped Renderer Plugins](scoped-renderer-plugin.md)。

`response-footer` 在一轮完整回复尾部显示一次。Copy/Export 作用于该回复，Reload/Branch 委托现有 Conversation Runtime，不建立另一套消息存储。详见 [Response Footer](assistant-response-footer.md)。

## 应用层与 upstream

官方实现通过 Plugins npm 包交付。项目薄应用层桥接当前 scope、服务、props 和组合；公开 API 足够时不提取源码。上游会话行为、共享 Runtime 和 Context 不按 Plugin 复制。

产品适配维护统一 locale、主题容器和来源记录。vendor 保持未修改、locale-agnostic。上游更新检查固定来源和适配锚点；项目实现同步只处理已授权的实现子树。

## Thread 与历史

Thread 绑定在一次挂载期间保持稳定。Host 提供历史数据源，Runtime 使用现有 thread/history adapter 加载消息，不因查看历史发起新 Agent 推理，不在历史 Tool UI 挂载时执行工具。

历史数据、当前 Agent state、瞬时消息和应用事件分别处理，不将历史消息回放当成实时 AG-UI 事件流，也不让 Plugin 接管会话持久化或分支仓库。页面内提示通过 [临时消息服务](transient-assistant-messages.md) 展示，不写入 Agent 消息和历史。

## Frontend Tool 与 HITL

应用决定允许向 Agent 暴露的前端工具，Plugin 提供 activation-scoped Service，Tool UI 显示参数、状态与结果。执行、取消和标准 continuation 使用原生工具链路，详见 [Frontend Tool 生命周期](frontend-tool-lifecycle.md)。

Structured interrupt 通过完整、匹配的响应集合恢复原有会话。用户提问卡片的客户端 Tool Result 与后端审批中断不是同一协议；不能把用户回答伪装成普通消息或从历史 renderer 发起恢复。

## 数据、事件与展示

AG-UI 的消息、STATE、ACTIVITY、SUBAGENT 和 CUSTOM 保留各自语义。Runtime 做协议边界映射，Plugin 不重建投影器。应用自定义事件先经过应用 Schema，再向声明的 Plugin 发布。

具名后端 Tool UI 与 Data Message UI 只展示已有结果，不授予 Frontend Tool 权限。消息插件使用公开的 defineDataMessageUI，将注册保留在 definition.dataMessageUIs，声明 manifest.data.messageUI，并组合到 applicationPlugins；类型泛型不代替 payload 的运行时校验。启用实例的注册名必须有效且唯一，冲突在组合发布前报告 DATA_MESSAGE_UI_INVALID_NAME / DATA_MESSAGE_UI_NAME_CONFLICT；停用或移除清理注册，不用优先级或隐式覆盖解决冲突。完整开发示例见 [CUSTOM 消息渲染](../../website/docs/development/custom-ag-ui-events.md)。

同一个 CUSTOM 可以形成具名消息内容，也可经应用事件入口提供瞬时通知，两条消费路径不能混为一体。Plugin 事件订阅使用应用 appEventSchemas 和 manifest.data.events 中的同名声明，保留 root/subagent producer，停用时清理，不重放历史、不把通配符当成注册语法。用法见 [业务事件订阅](../../website/docs/development/plugin-api.md#订阅业务事件)。应用 Schema 的转换不改写会话消息的原始 data，消息 renderer 仍校验自己的输入。

AgentPlan 使用权威 Activity，不从 elapsed、工具调用次数或推理文本推断进度。ACTIVITY_DELTA 更新同 messageId/activityType 的既有项，不追加另一条计划；快照、delta 和恢复规则见 [AgentPlan Activity](authoritative-agent-plan-activity.md)。多模态结果沿用标准内容数组及共享展示。

## 验证边界

检查单一连接、切换与草稿、工具/审批/中断恢复、历史副作用隔离、语义插槽、语言/主题、卸载清理和安装产物。源码、静态检查、受控 Mock、实际浏览器、业务服务与真实 Windows 分别记录，不由其中一层通过推断其余层通过。
