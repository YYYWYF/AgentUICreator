# Mention 与 Slash 插件接入

mention-trigger 和 slash-command-trigger 是独立 UI Plugin，组合在 composer.triggers。它们复用 canonical Composer、草稿、附件、引用和提交生命周期，不创建第二套 Runtime 或指令协议。

## 来源与公开 API

公开组件、ConversationMentionSource 和 ConversationSlashCommandSource 来自 `@za38.03/agent-ui-plugins`；具体方法和字段以目标工程已安装声明为准。

Mention Provider 提供 conversation.mention-source。候选必须带真实稳定 ID；显示名只负责呈现。查询遵守 AbortSignal，来源身份、cacheKey 或语言/账号变化后隔离旧响应。来源缺失时使用声明的可选依赖降级，不伪造搜索结果。

Slash Provider 提供 conversation.slash-command-source。action 项消费触发文本并执行明确的页面回调；directive 项修改草稿，在用户主动发送后成为 Agent 文本。候选选择本身不自动创建 Agent 推理。

## 数据与业务边界

Core 的 directive codec 负责稳定引用的序列化和解析；输入、历史展示和后端解析沿用同一格式。原子标签是展示能力，服务端 ID、权限和业务数据解析由应用提供。

默认 conversation-command-source 的 /new 使用既有会话导航。演示命令和 Mock 花名册属于显式资源，不进入默认业务工程。后端参考的范围见 [Mention Context](mention-backend-context.md)。

## 组合与样式

Provider 与 Consumer 声明真实 Service 依赖，状态和订阅按生命周期清理。候选菜单保持在现有 Composer 与主题边界内；不创建 body 级 Portal、独立语言状态或替代上游键盘/IME 的编辑器。

按实际安装 manifest 与 AppUIModel 启停插件，先定制项目薄应用层 props 和公开组件。需要原子标签输入时按需启用 [Lexical 输入](../../../plugins/lexical-composer-input.md)，它不是默认输入要求。输入与历史编辑的隔离和降级规则见 [插槽生命周期](scoped-renderer-plugin.md#可选-lexical-的生命周期)。

验证来源切换、取消、过期响应、空/失败结果、选择、键盘、IME、标签删除、普通文本发送及历史展示；业务权限与真实搜索接口单独验证。
