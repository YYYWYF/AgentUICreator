# 插件默认启用情况

以下状态按当前工作台（`platform`）、悬浮助手（`assistant`）和嵌入式助手（`embedded`）模板列出，三种模板的启用清单相同。目前 46 个官方插件中，23 个默认启用，23 个默认未启用。已有项目可能经过调整，以项目实际配置为准。

**默认启用**表示新建项目已组合该插件；有对应数据或发生相关操作时才显示。附件上传、历史会话等功能还需业务服务支持。**默认未启用**的插件可以按需让 Creator 添加，或在项目应用层接入。

Agent 服务返回什么数据才能显示卡片，见[插件显示条件与 AG-UI 数据](/plugins/ag-ui-data.md)及对应插件页的“显示条件与数据来源”。

**审批默认可用**：`tool-result` 已包含操作确认区，支持[旧版 CUSTOM 和新版 interrupt 审批](/plugins/tool-fallback.md#显示条件与数据来源)，不需要额外开启审批插件。`tool-fallback` 是同一位置的基础展示替代，两者选择一个即可。

## 对话与会话管理

| 插件                                                                         | 用途                             | 默认状态 |
| -------------------------------------------------------------------------- | ------------------------------ | ---- |
| [`conversation-surface`](/plugins/conversation-surface.md)                 | 把历史消息、回复和输入框组成完整聊天界面。          | 默认启用 |
| [`conversation-thread-list`](/plugins/conversation-thread-list.md)         | 在侧栏搜索、打开和管理历史会话。               | 默认启用 |
| [`conversation-new`](/plugins/conversation-new.md)                         | 开始新对话，保留原有聊天记录。                | 默认启用 |
| [`conversation-suggestions`](/plugins/conversation-suggestions.md)         | 显示可点击的示例问题，帮助用户开始对话。           | 默认启用 |
| [`transient-assistant-messages`](/plugins/transient-assistant-messages.md) | 在对话中显示不发送给 Agent、不写入后端历史的页面提示。 | 默认启用 |

## 消息输入与编辑

| 插件                                                             | 用途                       | 默认状态  |
| -------------------------------------------------------------- | ------------------------ | ----- |
| [`composer`](/plugins/composer.md)                             | 编辑待发送的消息，并容纳附件、引用和发送按钮。  | 默认启用  |
| [`submit-action`](/plugins/submit-action.md)                   | 发送问题，或在 Agent 回复期间请求停止。  | 默认启用  |
| [`add-attachment-action`](/plugins/add-attachment-action.md)   | 选择文件、加入当前消息，发送前可移除。      | 默认启用  |
| [`dictation-action`](/plugins/dictation-action.md)             | 开始或停止听写，把识别文字放入草稿。       | 默认未启用 |
| [`conversation-quote`](/plugins/conversation-quote.md)         | 选中已有回复的一段文字，引用后继续提问。     | 默认启用  |
| [`mention-trigger`](/plugins/mention-trigger.md)               | 输入 @ 搜索并选择要引用的人或资料。      | 默认未启用 |
| [`slash-command-trigger`](/plugins/slash-command-trigger.md)   | 输入 / 选择快捷操作，或把指令加入草稿。    | 默认未启用 |
| [`lexical-composer-input`](/plugins/lexical-composer-input.md) | 把已选中的 @ 对象和 / 指令显示成完整标签。 | 默认未启用 |
| [`lexical-edit-composer`](/plugins/lexical-edit-composer.md)   | 编辑已发送的用户消息，并保留其中的引用标签。   | 默认未启用 |

## 回复操作

| 插件                                                             | 用途                        | 默认状态  |
| -------------------------------------------------------------- | ------------------------- | ----- |
| [`response-footer`](/plugins/response-footer.md)               | 把复制、重试、评价和导出等按钮放在完整回复下方。  | 默认启用  |
| [`copy-action`](/plugins/copy-action.md)                       | 把当前这次完整回复复制到剪贴板。          | 默认启用  |
| [`reload-action`](/plugins/reload-action.md)                   | 让 Agent 针对当前问题重新生成回复。     | 默认启用  |
| [`feedback-actions`](/plugins/feedback-actions.md)             | 让用户评价当前回复是否有帮助。           | 默认未启用 |
| [`export-markdown-action`](/plugins/export-markdown-action.md) | 把当前这次完整回复下载成 Markdown 文件。 | 默认启用  |

## 思考、工具与任务

| 插件                                                         | 用途                                      | 默认状态  |
| ---------------------------------------------------------- | --------------------------------------- | ----- |
| [`thinking-indicator`](/plugins/thinking-indicator.md)     | 在尚未显示回答时提示 Agent 仍在思考或处理。               | 默认未启用 |
| [`reasoning`](/plugins/reasoning.md)                       | 展开或折叠 Agent 返回的思考文字。                    | 默认启用  |
| [`tool-group`](/plugins/tool-group.md)                     | 把多个工具调用归为一组，展开查看各项调用。                   | 默认启用  |
| [`tool-timeline`](/plugins/tool-timeline.md)               | 汇总一条回复中的工具执行状态，展开查看过程。                  | 默认未启用 |
| [`tool-fallback`](/plugins/tool-fallback.md)               | 展开单次工具调用的参数和结果，必要时允许或拒绝执行。              | 默认未启用 |
| [`tool-result`](/plugins/tool-result.md)                   | 按内容顺序显示工具返回的文本、图片、音频、视频和文档，保留工具详情和审批操作。 | 默认启用  |
| [`ask-user-question`](/plugins/ask-user-question.md)       | 在对话中展示问题与选项，收集用户回答后继续执行。                | 默认未启用 |
| [`task-group`](/plugins/task-group.md)                     | 展开 SubAgent 任务，查看各自的执行状态、过程和结果。         | 默认启用  |
| [`agent-status-message`](/plugins/agent-status-message.md) | 用简短状态文字说明 Agent 当前正在做什么。                | 默认未启用 |
| [`agent-plan-message`](/plugins/agent-plan-message.md)     | 显示计划步骤、当前步骤和已完成步骤。                      | 默认未启用 |
| [`job-progress-message`](/plugins/job-progress-message.md) | 显示后台作业的阶段和进度，业务支持时可取消。                  | 默认未启用 |

## 结果、来源与检索

| 插件                                                                   | 用途                       | 默认状态  |
| -------------------------------------------------------------------- | ------------------------ | ----- |
| [`generated-file-message`](/plugins/generated-file-message.md)       | 显示生成文件的名称和下载入口。          | 默认未启用 |
| [`chart-message`](/plugins/chart-message.md)                         | 把数值结果显示为可比较的图表。          | 默认未启用 |
| [`source-citations-message`](/plugins/source-citations-message.md)   | 列出回答引用的网页和文档来源。          | 默认未启用 |
| [`retrieval-chunks`](/plugins/retrieval-chunks.md)                   | 阅读文档搜索命中的原文片段。           | 默认未启用 |
| [`web-search`](/plugins/web-search.md)                               | 查看网页搜索结果并打开原网页。          | 默认未启用 |
| [`context-retrieval-message`](/plugins/context-retrieval-message.md) | 展开阅读本次提供给 Agent 参考的检索资料。 | 默认启用  |

## 外观、语言与账号

| 插件                                             | 用途                     | 默认状态  |
| ---------------------------------------------- | ---------------------- | ----- |
| [`agent-identity`](/plugins/agent-identity.md) | 显示当前 Agent 的名称、头像和介绍。  | 默认启用  |
| [`theme-switch`](/plugins/theme-switch.md)     | 让用户切换浅色、深色和紫色主题。       | 默认未启用 |
| [`locale-switch`](/plugins/locale-switch.md)   | 切换中英文界面，保留当前对话和草稿。     | 默认未启用 |
| [`auth-gate`](/plugins/auth-gate.md)           | 在进入聊天前显示登录页，认证成功后进入应用。 | 默认未启用 |
| [`auth-account`](/plugins/auth-account.md)     | 显示当前用户资料，并按接入情况提供退出登录。 | 默认未启用 |

## 配置与服务

以下插件不提供独立的界面按钮，用于支撑会话、主题、语言和命令来源。启用主题或语言服务，并不代表已显示对应的切换按钮。

| 插件                                                                       | 用途                | 默认状态  |
| ------------------------------------------------------------------------ | ----------------- | ----- |
| [`conversation-data-source`](/plugins/conversation-data-source.md)       | 接入会话列表与历史数据来源。    | 默认启用  |
| [`conversation-service`](/plugins/conversation-service.md)               | 管理会话列表、选择和历史加载。   | 默认启用  |
| [`theme-provider`](/plugins/theme-provider.md)                           | 为界面提供主题配置。        | 默认启用  |
| [`locale-provider`](/plugins/locale-provider.md)                         | 为界面提供语言配置。        | 默认启用  |
| [`conversation-command-source`](/plugins/conversation-command-source.md) | 提供项目定义的 `/` 快捷命令。 | 默认未启用 |
