# Creator 文档索引

公开文档目录：[llms.txt](llms.txt)。以下是当前 Creator 内部参考，按任务查阅；接口仍以目标工程实际安装版本为准。

## 职责与所有权

- [Agent UI Plugin Creator 架构与执行边界](references/docs/agent-ui-plugin-creator-launch-plan.md)：当前架构：Creator、AppUIModel、Plugin、Runtime、AG-UI、Service 和交付边界。
- [Agent UI 参考项目选择](references/docs/agent-ui-reference-guide.md)：按问题选择参考项目；目标工程 UI Stack、已安装 API 与证据边界。
- [统一 Plugins 包、内置源码目录与按需源码托管](references/docs/architecture/npm-default-plugin-source-ownership.md)：npm 默认交付、项目薄应用层、源码接管授权、BASE/LOCAL/TARGET 与更新保护。
- [Conversation Domain 架构](references/docs/architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md)：Conversation Domain 当前所有权；assistant-ui Runtime、消息注册与 Custom Event 边界。

## 插件开发与组合

- [Plugin Authoring Contract](references/docs/architecture/plugin-authoring-contract.md)：自定义插件 authoring、默认放置、容器子插槽、renderer、样式隔离和校验合同。
- [官方插件公开 props 约定与逐项核对](references/docs/architecture/plugin-public-props.md)：官方插件公开 props、children、组件组合与应用层定制；类型和运行转发核对。
- [Scoped Renderer Plugins](references/docs/architecture/scoped-renderer-plugin.md)：render scope、renderer 子插槽、消息/工具展示及 Lexical 编辑生命周期。
- [Generic Sidebar Layout](references/docs/architecture/generic-sidebar-layout.md)：Sidebar 布局、左右区域、尺寸与语义组合。
- [Plugin hiding and permanent deletion](references/docs/architecture/plugin-hide-purge.md)：插件隐藏、停用与永久删除的区别；实例、子插槽及清理边界。
- [Creator UI Plugin 编辑与开发确认](references/docs/creator-plugin-development-decision-contract.md)：复用与新开发决策、真实用户授权、方案范围、UI 库选择和依赖安装。
- [Creator Plugin Delivery](references/docs/creator-plugin-delivery.md)：插件开发交付、静态验证与浏览器验收的证据要求。

## Host 与接入

- [Host-owned Integration Recipe](references/docs/architecture/host-integration-recipe.md)：Host 拥有服务与业务接线；官方应用模板、Provider 生命周期和清理。
- [Agent Connection and Preview Source](references/docs/architecture/agent-connection-preview-source.md)：业务 Agent 连接、预览来源、Mock/recording 解析、身份与隔离。
- [可选认证与账号插件](references/docs/implementation/authentication/README.md)：可选认证与账号插件；Host 服务、登录状态和应用自有配置。

## 会话与交互

- [Frontend Tool lifecycle](references/docs/architecture/frontend-tool-lifecycle.md)：Frontend Tool 注册、执行、审批、中断恢复、取消与历史副作用隔离。
- [Dialog 与 Form Frontend Tool 示例](references/docs/architecture/frontend-tool-form-demo.md)：Dialog/Form 前端工具的声明与交互示例。
- [可选 Generative UI](references/docs/architecture/generative-ui-integration.md)：可选 Generative UI 工厂与前端执行边界。
- [Authoritative Agent Plan Activity](references/docs/architecture/authoritative-agent-plan-activity.md)：Agent Plan Activity 的权威数据、计划状态与展示合同。
- [Assistant Response Group and Footer](references/docs/architecture/assistant-response-footer.md)：回复组与操作栏；多消息回复只在最终消息下呈现一次 footer。
- [Mention 与 Slash 插件接入](references/docs/architecture/composer-mention-slash-plugin-integration.md)：输入框 @ 提及和 / 命令插件接入与薄应用层。
- [Mention Backend Context Reference](references/docs/architecture/mention-backend-context.md)：提及对象 ID、后端上下文与发送协议；不按展示文案判断业务。
- [Conversation Quote](references/docs/architecture/conversation-quote.md)：会话引用与草稿生命周期。
- [Feedback 与消息排队](references/docs/architecture/message-feedback-and-queue.md)：消息反馈与运行中排队语义。
- [Transient conversation messages](references/docs/architecture/transient-assistant-messages.md)：临时通知、共享内存 store、清理与不写入聊天历史的边界。
- [多模态工具结果展示](references/docs/architecture/multimodal-output-phase-1.md)：工具结果中文本、图片、音频、视频与文件的有序展示。
- [Web Search 与 Retrieval Tool UI](references/docs/architecture/web-search-retrieval-tool-ui-plugins.md)：网页搜索与检索工具 UI，searchTools locale、DOM/count/cycle props。
- [Sources / Citations](references/docs/source-citations.md)：Sources/Citations 引用数据 Schema、来源绑定及后端输出约定。

## 主题与本地化

- [Theme architecture](references/docs/design/violet-theme/THEME-ARCHITECTURE.md)：主题 tokens、明暗模式、样式职责与项目级主题定制。
- [Theme ownership and upgrade boundaries](references/docs/design/violet-theme/UPGRADE-BOUNDARIES.md)：主题文件所有权、npm 升级保护与样式维护。
- [Product localization ownership](references/docs/i18n/README.md)：统一 locale、领域 namespace、英文/中文对齐与产品文案所有权。
- [Pinned upstream localization gaps](references/docs/i18n/upstream-localization-gaps.md)：固定上游版本的本地化缺口、公开 seam 与 vendor 禁改边界。

## 更新与开发工具

- [统一更新中心与兼容版本清单](references/docs/architecture/unified-update-center.md)：兼容清单、独立包版本、只读发现、具体升级确认、安装恢复与源码同步。
- [Creator 开发控制面实现](references/docs/creator-control-plane-implementation-plan.md)：Creator 工具控制面、命令、Host guards、上下文及 Mock 管理。
- [Source 资源与项目事务](references/docs/architecture/source-registry-project-mutation.md)：Source 资源安装、项目事务与受控修改。
- [Transactional Preview Composition](references/docs/architecture/transactional-preview-composition.md)：预览组合的事务、revision、校验与恢复。
- [依赖版本与跨平台开发](references/docs/dependency-version-policy.md)：依赖版本、跨平台开发与包管理器约定。
- [主流程测试](references/docs/testing.md)：项目测试入口、类型检查、构建和真实运行证据。
- [Creator TypeScript 发行](references/packages/creator/docs/typescript-distribution.md)：Creator TypeScript 单包发行、离线文档交接、Node 与 Windows 安装和运行边界。

