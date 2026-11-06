---
title: "样式与文案开发"
---

# 样式与文案开发

样式和文案在项目中定制，沿用工程已有的 UI 库、样式方案和版本。需要 Creator 帮你修改时，见[主题与样式需求](/guide/adjustments/themes)和[语言与文案需求](/guide/adjustments/localization)。

## 默认主题

主题统一通过 `Agent` 传入。例如，固定使用深色主题：

```tsx
<Agent theme="dark" />
```

不传 `theme` 时使用内置紫色主题，启用[主题切换控件](/plugins/theme-switch)后可在界面中切换。业务页面传入 `theme` 后，由页面控制当前值；允许控件切换时，同时传入 `onThemeChange` 更新页面状态，见[主题属性与回调](./agent-options#主题切换)。

## 样式入口

在生成目录的 `styles.css` 中追加项目样式，保留原有 npm 样式导入及源码扫描声明。默认样式由 npm 提供，项目只保存自己的覆盖。

例如，在文件末尾设置 violet 主题的品牌色：

```css
:is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"] {
  --agent-brand: #1677ff;
  --agent-brand-solid: #0958d9;
  --radius: 0.75rem;
}
```

同时覆盖外框与会话根，弹层才能使用一致的主题。保持其他主题的配色；选择主题通过 `Agent` 的 `theme` 属性传入。主题 ID 使用工程支持的值，品牌颜色通过 CSS 设置。

修改具体组件优先使用其公开 `className`、`style` 或对应的 `…Props`。避免依赖上游私有 DOM 和类名；布局区域大小见[布局与插件组合](./layout-and-composition)。

## 修改已有文案

通过 `Agent` 的 `locales` 属性覆盖需要修改的文案：

```tsx
<Agent locales={{
  'zh-CN': { composer: { placeholder: '输入你的问题' } },
  'en-US': { composer: { placeholder: 'Ask your question' } },
}} />
```

`locale` 选择当前语言，支持 `zh-CN` 和 `en-US`；`locales` 按语言、命名空间和字段覆盖文案。只提供需要修改的字段，其他字段沿用已有配置和默认翻译，两种语言的覆盖保持一致。

新生成项目的默认欢迎语和推荐问题在生成目录的 `application/locales.ts` 中维护，由 `application/project-config.tsx` 绑定。业务页面也可以通过 `Agent.locales` 覆盖；同一字段以 Host 传入的值为准，保留项目已有的其他覆盖。

### 覆盖多个功能的文案

例如，同时修改欢迎语、输入提示和历史记录标题：

```tsx
<Agent locales={{
  'zh-CN': {
    conversation: { welcome: '你好，欢迎咨询产品使用问题' },
    composer: { placeholder: '描述你遇到的问题' },
    threadList: { historyTitle: '咨询记录' },
  },
  'en-US': {
    conversation: { welcome: 'Hello! How can we help you use the product?' },
    composer: { placeholder: 'Describe your issue' },
    threadList: { historyTitle: 'Support conversations' },
  },
}} />
```

表格中的 `toolTimeline.summary` 等字段包含占位符，覆盖时保留原有占位符名称和花括号；值由组件在运行时填入：

```tsx
<Agent locales={{
  'zh-CN': { toolTimeline: { summary: '已完成 {count} 个操作' } },
  'en-US': { toolTimeline: { summary: 'Completed {count} operations' } },
}} />
```

`conversation.welcomeDescription` 默认是空字符串，设为 `''` 可以隐藏这段可选说明。必需标签传入空字符串会回退到默认文案，不能用来隐藏按钮；按钮的显示应通过插件或组件配置调整。

### 在组件中读取文案

组件通过工程已有的统一 Hook 读取：

```tsx
import { useAgentUILocale } from '@za38.03/agent-ui-plugins';

export function ComposerHint() {
  const labels = useAgentUILocale('composer');
  return <p>{labels.placeholder}</p>;
}
```

不直接按语言写条件分支，也不复制一套独立 i18n 状态。

官方文案沿用现有域；`Agent.locales` 不注册任意新命名空间或键。新增业务文案集中在项目共享消息模块，按领域组织完整双语表，通过统一的 `useAgentUILocaleCode()` 值选择文案。组件不写语言条件，不创建每插件国际化 Hook 或独立语言状态，纯展示函数接收文案参数。示例见[插件 API](./plugin-api#主题与多语言)。

## 可替换文案清单

按界面功能查找下面的字段，再按上面的示例构造覆盖对象。当前项目安装版本的 `AgentUILocaleOverrides` 类型是可用字段的依据，编辑器可以补全字段并检查拼写；网站清单对应当前文档版本。

“示例与演示页面”中的字段只影响使用这些词典的示例，不是生产插件通用配置。语言代码等标识值（如 `composerTriggerDemo.localeKey`）保留原值；Agent 消息、用户输入和后端返回内容不会由 `locales` 自动翻译。

<!-- locale-reference:start -->

以下 36 个命名空间、453 个字段从 Plugins 的中英文词典自动生成，按功能分组。字段路径相对于每种语言的覆盖对象，例如 `composer.placeholder` 对应 `locales['zh-CN'].composer.placeholder`。

默认值以字符串字面量展示，`""` 表示空字符串，`\n` 表示换行；引号不属于文案。这里只列出 npm 的默认值，项目和 Host 的已有覆盖可能使实际显示不同。字段是否显示取决于启用的插件、组件和当前状态。

### 会话、欢迎内容与历史记录

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `agentIdentity.name` | <code>"智能助手"</code> | <code>"Agent"</code> |
| `conversation.generationStopped` | <code>"生成已停止"</code> | <code>"Generation stopped"</code> |
| `conversation.editInput` | <code>"编辑消息"</code> | <code>"Edit message"</code> |
| `conversation.loading` | <code>"正在加载会话"</code> | <code>"Loading conversation"</code> |
| `conversation.scrollToBottom` | <code>"滚动到底部"</code> | <code>"Scroll to bottom"</code> |
| `conversation.welcome` | <code>"您好，有什么可以帮您？"</code> | <code>"Hello, how can I help you?"</code> |
| `conversation.welcomeDescription` | <code>""</code> | <code>""</code> |
| `conversation.working` | <code>"助手正在处理"</code> | <code>"Assistant is working"</code> |
| `conversation.moreActions` | <code>"更多操作"</code> | <code>"More actions"</code> |
| `conversation.exportMarkdown` | <code>"导出 Markdown"</code> | <code>"Export as Markdown"</code> |
| `conversation.reasoning` | <code>"思考"</code> | <code>"Reasoning"</code> |
| `conversation.reasoningDuration` | <code>"（&#123;seconds&#125;秒）"</code> | <code>" (&#123;seconds&#125;s)"</code> |
| `conversation.editCancel` | <code>"取消"</code> | <code>"Cancel"</code> |
| `conversation.editUpdate` | <code>"更新"</code> | <code>"Update"</code> |
| `starterSuggestions.architectureTitle` | <code>"账户交易查询"</code> | <code>"Account lookup"</code> |
| `starterSuggestions.architectureLabel` | <code>"查询余额、账单与交易明细"</code> | <code>"View balances, statements and transactions"</code> |
| `starterSuggestions.architecturePrompt` | <code>"如何查询账户余额、账单和交易明细？"</code> | <code>"How can I view my account balance, statements, and transaction history?"</code> |
| `starterSuggestions.debugTitle` | <code>"转账汇款指引"</code> | <code>"Transfer guide"</code> |
| `starterSuggestions.debugLabel` | <code>"了解流程、到账时间与须知"</code> | <code>"Explore steps, arrival times and tips"</code> |
| `starterSuggestions.debugPrompt` | <code>"请介绍转账汇款的办理流程、到账时间和注意事项。"</code> | <code>"Please explain how to make a bank transfer, how long it takes, and what to check."</code> |
| `starterSuggestions.nextTitle` | <code>"银行卡服务"</code> | <code>"Bank card services"</code> |
| `starterSuggestions.nextLabel` | <code>"办理新卡、挂失与日常用卡"</code> | <code>"Apply for cards, report loss and manage"</code> |
| `starterSuggestions.nextPrompt` | <code>"请介绍银行卡申请、挂失和日常用卡的常见办理方式。"</code> | <code>"How can I apply for a bank card, report a lost card, and manage everyday card services?"</code> |
| `threadList.historyTitle` | <code>"历史会话"</code> | <code>"Conversation history"</code> |
| `threadList.retry` | <code>"重试"</code> | <code>"Retry"</code> |
| `threadList.newChat` | <code>"新会话"</code> | <code>"New Chat"</code> |
| `threadList.moreOptions` | <code>"更多选项"</code> | <code>"More options"</code> |
| `threadList.running` | <code>"运行中"</code> | <code>"Running"</code> |
| `threadList.rename` | <code>"重命名"</code> | <code>"Rename"</code> |
| `threadList.archive` | <code>"归档"</code> | <code>"Archive"</code> |
| `threadList.unarchive` | <code>"取消归档"</code> | <code>"Unarchive"</code> |
| `threadList.archived` | <code>"已归档会话"</code> | <code>"Archived conversations"</code> |
| `threadList.delete` | <code>"删除"</code> | <code>"Delete"</code> |
| `threadList.loading` | <code>"正在加载会话列表"</code> | <code>"Loading threads"</code> |
| `threadList.empty` | <code>"没有找到会话"</code> | <code>"No threads found"</code> |
| `threadList.loadFailed` | <code>"加载会话失败"</code> | <code>"Could not load conversations"</code> |
| `threadList.historyFailed` | <code>"历史会话加载失败"</code> | <code>"Could not load conversation history"</code> |
| `threadList.newThread` | <code>"新建会话"</code> | <code>"New Thread"</code> |
| `threadList.search` | <code>"搜索会话"</code> | <code>"Search threads"</code> |
| `threadList.clearSearch` | <code>"清除搜索"</code> | <code>"Clear search"</code> |
| `threadList.today` | <code>"今天"</code> | <code>"Today"</code> |
| `threadList.yesterday` | <code>"昨天"</code> | <code>"Yesterday"</code> |
| `threadList.earlier` | <code>"更早"</code> | <code>"Earlier"</code> |
| `conversationQuote.quote` | <code>"引用"</code> | <code>"Quote"</code> |
| `conversationQuote.dismiss` | <code>"取消引用"</code> | <code>"Dismiss quote"</code> |
| `quote.quote` | <code>"引用"</code> | <code>"Quote"</code> |
| `quote.dismiss` | <code>"取消引用"</code> | <code>"Dismiss quote"</code> |
| `conversationFeedback.helpful` | <code>"有帮助"</code> | <code>"Helpful"</code> |
| `conversationFeedback.notHelpful` | <code>"没有帮助"</code> | <code>"Not helpful"</code> |
| `copyAction.failed` | <code>"复制失败，请检查浏览器权限后重试。"</code> | <code>"Copy failed. Check browser permissions and try again."</code> |
| `transientMessages.systemMessage` | <code>"系统消息"</code> | <code>"System message"</code> |
| `transientMessages.userMessage` | <code>"用户消息"</code> | <code>"User message"</code> |
| `transientMessages.assistantMessage` | <code>"助理消息"</code> | <code>"Assistant message"</code> |
| `transientMessages.errorMessage` | <code>"错误消息"</code> | <code>"Error message"</code> |

### 输入、附件与语音服务

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `composer.awaitingReply` | <code>"当前任务正在等待你的回复，请先回答上方的问题，再发送新消息。"</code> | <code>"The current task is waiting for your reply. Please answer the question above before sending a new message."</code> |
| `composer.placeholder` | <code>"发送消息…"</code> | <code>"Send a message..."</code> |
| `composer.input` | <code>"消息输入框"</code> | <code>"Message input"</code> |
| `composer.addAttachment` | <code>"添加附件"</code> | <code>"Add Attachment"</code> |
| `composer.voiceInput` | <code>"语音输入"</code> | <code>"Voice input"</code> |
| `composer.startVoice` | <code>"开始语音输入"</code> | <code>"Start voice input"</code> |
| `composer.stopDictation` | <code>"停止听写"</code> | <code>"Stop dictation"</code> |
| `composer.stopVoice` | <code>"停止语音输入"</code> | <code>"Stop voice input"</code> |
| `composer.send` | <code>"发送消息"</code> | <code>"Send message"</code> |
| `composer.queueSend` | <code>"加入发送队列"</code> | <code>"Queue message"</code> |
| `composer.stop` | <code>"停止生成"</code> | <code>"Stop generating"</code> |
| `composer.cancelSend` | <code>"取消发送"</code> | <code>"Cancel sending"</code> |
| `composer.queued` | <code>"待发送"</code> | <code>"Pending"</code> |
| `composer.removeQueued` | <code>"移除待发送消息"</code> | <code>"Remove queued message"</code> |
| `conversationTriggers.suggestions` | <code>"输入建议"</code> | <code>"Input suggestions"</code> |
| `conversationTriggers.back` | <code>"返回"</code> | <code>"Back"</code> |
| `conversationTriggers.empty` | <code>"没有匹配项"</code> | <code>"No matching items"</code> |
| `conversationTriggers.loading` | <code>"加载中…"</code> | <code>"Loading…"</code> |
| `conversationTriggers.searchFailed` | <code>"无法加载候选项"</code> | <code>"Could not load suggestions"</code> |
| `conversationTriggers.retry` | <code>"重试"</code> | <code>"Retry"</code> |
| `conversationTriggers.commandFailed` | <code>"命令执行失败"</code> | <code>"Could not execute command"</code> |
| `conversationTriggers.invalidItem` | <code>"无法插入此候选项"</code> | <code>"This item cannot be inserted"</code> |
| `conversationTriggers.newConversation` | <code>"新建会话"</code> | <code>"New conversation"</code> |
| `triggers.noItems` | <code>"没有可用项"</code> | <code>"No items available"</code> |
| `triggers.noResults` | <code>"没有找到结果"</code> | <code>"No results found"</code> |
| `triggers.suggestions` | <code>"输入建议"</code> | <code>"Suggestions"</code> |
| `triggers.back` | <code>"返回"</code> | <code>"Back"</code> |
| `triggers.empty` | <code>"没有结果"</code> | <code>"No results"</code> |
| `triggers.loading` | <code>"正在加载"</code> | <code>"Loading"</code> |
| `triggers.searchFailed` | <code>"搜索失败"</code> | <code>"Search failed"</code> |
| `triggers.retry` | <code>"重试"</code> | <code>"Retry"</code> |
| `triggers.commandFailed` | <code>"指令执行失败"</code> | <code>"Command failed"</code> |
| `triggers.invalidItem` | <code>"不可用"</code> | <code>"Unavailable"</code> |
| `triggers.items` | <code>"选项"</code> | <code>"Items"</code> |
| `attachments.previewNamed` | <code>"预览 &#123;name&#125;"</code> | <code>"Preview &#123;name&#125;"</code> |
| `attachments.removeNamed` | <code>"移除 &#123;name&#125;"</code> | <code>"Remove &#123;name&#125;"</code> |
| `attachments.tileNamed` | <code>"&#123;type&#125;附件 &#123;name&#125;"</code> | <code>"&#123;type&#125; attachment &#123;name&#125;"</code> |
| `attachments.named` | <code>"&#123;label&#125;"</code> | <code>"&#123;label&#125;"</code> |
| `attachments.namedUploading` | <code>"&#123;label&#125;，上传中"</code> | <code>"&#123;label&#125;, uploading"</code> |
| `attachments.namedFailed` | <code>"&#123;label&#125;，上传失败"</code> | <code>"&#123;label&#125;, upload failed"</code> |
| `attachments.preview` | <code>"附件预览"</code> | <code>"Attachment preview"</code> |
| `attachments.previewFailed` | <code>"无法加载图片预览。"</code> | <code>"The image preview could not be loaded."</code> |
| `attachments.imagePreview` | <code>"图片附件预览"</code> | <code>"Image Attachment Preview"</code> |
| `attachments.uploadFailed` | <code>"上传失败"</code> | <code>"Upload failed"</code> |
| `attachments.remove` | <code>"移除文件"</code> | <code>"Remove file"</code> |
| `attachments.imageType` | <code>"图片"</code> | <code>"Image"</code> |
| `attachments.documentType` | <code>"文档"</code> | <code>"Document"</code> |
| `attachments.fileType` | <code>"文件"</code> | <code>"File"</code> |
| `attachments.tile` | <code>"&#123;type&#125;附件"</code> | <code>"&#123;type&#125; attachment"</code> |
| `attachments.tileUploading` | <code>"&#123;type&#125;附件，正在上传"</code> | <code>"&#123;type&#125; attachment, uploading"</code> |
| `attachments.tileFailed` | <code>"&#123;type&#125;附件，上传失败"</code> | <code>"&#123;type&#125; attachment, upload failed"</code> |
| `attachments.demoSizeExceeded` | <code>"示例附件每个文件不能超过 5 MiB。"</code> | <code>"Demo attachments are limited to 5 MiB per file."</code> |
| `attachments.demoPdfOnly` | <code>"示例 PDF 附件只接受 PDF 文件。"</code> | <code>"Demo PDF attachments accept only PDF files."</code> |
| `attachments.demoReadAborted` | <code>"附件读取已取消"</code> | <code>"Attachment read aborted"</code> |
| `attachments.demoExpectedDataUrl` | <code>"未能获取文件数据地址。"</code> | <code>"Expected a file data URL."</code> |
| `attachments.demoReadFailed` | <code>"无法读取示例附件。"</code> | <code>"Could not read demo attachment."</code> |
| `serviceAdapters.requestFailed` | <code>"服务请求失败。"</code> | <code>"The service request failed."</code> |
| `serviceAdapters.invalidResponse` | <code>"服务返回的数据格式不正确。"</code> | <code>"The service returned an invalid response."</code> |
| `serviceAdapters.invalidUploadUrl` | <code>"上传响应中需要包含有效的文件 URL。"</code> | <code>"The upload response must contain a valid file URL."</code> |
| `serviceAdapters.invalidConfig` | <code>"附件配置不正确。"</code> | <code>"The file settings are invalid."</code> |
| `serviceAdapters.fileTypeRejected` | <code>"不支持选择此类型的文件。"</code> | <code>"This file type is not accepted."</code> |
| `serviceAdapters.fileTooLarge` | <code>"文件超过配置的大小限制。"</code> | <code>"The file exceeds the configured size limit."</code> |
| `serviceAdapters.dictationFailed` | <code>"语音识别失败。"</code> | <code>"Speech recognition failed."</code> |
| `serviceAdapters.recordingUnavailable` | <code>"当前浏览器不支持录音。"</code> | <code>"Audio recording is unavailable in this browser."</code> |

### 工具、任务与人工确认

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `toolPresentation.replyQueued` | <code>"回复已排队，尚未发送"</code> | <code>"Reply queued, not sent yet"</code> |
| `toolPresentation.alternativeAnswerPlaceholder` | <code>"或输入回答"</code> | <code>"Or type an answer"</code> |
| `toolPresentation.request` | <code>"请求："</code> | <code>"Request:"</code> |
| `toolPresentation.running` | <code>"正在调用工具"</code> | <code>"Running tool"</code> |
| `toolPresentation.waiting` | <code>"等待工具操作"</code> | <code>"Waiting on tool"</code> |
| `toolPresentation.cancelled` | <code>"工具调用已取消"</code> | <code>"Cancelled tool"</code> |
| `toolPresentation.failed` | <code>"工具调用失败"</code> | <code>"Failed tool"</code> |
| `toolPresentation.used` | <code>"已调用工具"</code> | <code>"Used tool"</code> |
| `toolPresentation.call` | <code>"&#123;count&#125; 次工具调用"</code> | <code>"&#123;count&#125; tool call"</code> |
| `toolPresentation.calls` | <code>"&#123;count&#125; 次工具调用"</code> | <code>"&#123;count&#125; tool calls"</code> |
| `toolPresentation.result` | <code>"结果："</code> | <code>"Result:"</code> |
| `toolPresentation.error` | <code>"错误："</code> | <code>"Error:"</code> |
| `toolPresentation.cancelReason` | <code>"取消原因："</code> | <code>"Cancelled reason:"</code> |
| `toolPresentation.allow` | <code>"允许"</code> | <code>"Allow"</code> |
| `toolPresentation.alwaysAllow` | <code>"始终允许"</code> | <code>"Always allow"</code> |
| `toolPresentation.deny` | <code>"拒绝"</code> | <code>"Deny"</code> |
| `toolPresentation.alwaysDeny` | <code>"始终拒绝"</code> | <code>"Always deny"</code> |
| `toolPresentation.dismiss` | <code>"关闭"</code> | <code>"Dismiss"</code> |
| `toolPresentation.send` | <code>"发送"</code> | <code>"Send"</code> |
| `toolPresentation.confirm` | <code>"确认"</code> | <code>"Confirm"</code> |
| `toolPresentation.back` | <code>"返回"</code> | <code>"Back"</code> |
| `toolPresentation.answer` | <code>"回答"</code> | <code>"Answer"</code> |
| `toolPresentation.note` | <code>"备注"</code> | <code>"Note"</code> |
| `toolPresentation.answerPlaceholder` | <code>"输入你的回答"</code> | <code>"Type your answer"</code> |
| `toolPresentation.notePlaceholder` | <code>"为你的决定添加备注"</code> | <code>"Add a note to your decision"</code> |
| `toolPresentation.cancelledDecision` | <code>"决定前已取消"</code> | <code>"Cancelled before a decision"</code> |
| `toolPresentation.expiredDecision` | <code>"决定前已过期"</code> | <code>"Expired before a decision"</code> |
| `toolPresentation.answered` | <code>"已回答"</code> | <code>"Answered"</code> |
| `toolPresentation.allowed` | <code>"已允许"</code> | <code>"Allowed"</code> |
| `toolPresentation.dismissed` | <code>"已关闭"</code> | <code>"Dismissed"</code> |
| `toolPresentation.denied` | <code>"已拒绝"</code> | <code>"Denied"</code> |
| `toolPresentation.automatic` | <code>"（自动）"</code> | <code>" automatically"</code> |
| `toolTimeline.summaryWithOneFile` | <code>"&#123;count&#125; 个步骤 · 1 个文件已修改"</code> | <code>"&#123;count&#125; steps · 1 file changed"</code> |
| `toolTimeline.summaryWithFiles` | <code>"&#123;count&#125; 个步骤 · &#123;files&#125; 个文件已修改"</code> | <code>"&#123;count&#125; steps · &#123;files&#125; files changed"</code> |
| `toolTimeline.pendingSummary` | <code>"工具执行 · &#123;count&#125; 个步骤"</code> | <code>"Tool execution · &#123;count&#125; steps"</code> |
| `toolTimeline.summary` | <code>"已执行 &#123;count&#125; 个步骤"</code> | <code>"Executed &#123;count&#125; steps"</code> |
| `toolTimeline.active` | <code>"正在执行 &#123;count&#125; 个步骤"</code> | <code>"Executing &#123;count&#125; steps"</code> |
| `toolTimeline.read` | <code>"读取"</code> | <code>"Read"</code> |
| `toolTimeline.command` | <code>"执行"</code> | <code>"Ran"</code> |
| `toolTimeline.search` | <code>"搜索"</code> | <code>"Searched"</code> |
| `toolTimeline.edit` | <code>"编辑"</code> | <code>"Edited"</code> |
| `toolTimeline.tool` | <code>"工具调用"</code> | <code>"Tool call"</code> |
| `toolTimeline.complete` | <code>"已完成"</code> | <code>"Completed"</code> |
| `toolTimeline.running` | <code>"运行中"</code> | <code>"Running"</code> |
| `toolTimeline.waiting` | <code>"等待操作"</code> | <code>"Waiting for action"</code> |
| `toolTimeline.failed` | <code>"失败"</code> | <code>"Failed"</code> |
| `toolTimeline.cancelled` | <code>"已取消"</code> | <code>"Cancelled"</code> |
| `toolTimeline.interrupted` | <code>"已中断"</code> | <code>"Interrupted"</code> |
| `toolTimeline.unknown` | <code>"状态未知"</code> | <code>"Unknown"</code> |
| `toolResult.resolving` | <code>"正在加载文件…"</code> | <code>"Loading file…"</code> |
| `toolResult.unavailable` | <code>"暂时无法预览，需要可用的媒体地址或文件解析服务。"</code> | <code>"Preview unavailable. A supported media URL or file resolver is required."</code> |
| `tasks.title` | <code>"任务"</code> | <code>"Tasks"</code> |
| `tasks.running` | <code>"&#123;total&#125; 项任务中有 &#123;running&#125; 项正在运行"</code> | <code>"&#123;running&#125; of &#123;total&#125; tasks running"</code> |
| `tasks.waiting` | <code>"&#123;count&#125; 项任务等待输入"</code> | <code>"&#123;count&#125; tasks waiting for input"</code> |
| `tasks.failed` | <code>"&#123;total&#125; 项任务已结束，&#123;failed&#125; 项失败"</code> | <code>"&#123;total&#125; tasks done, &#123;failed&#125; failed"</code> |
| `tasks.done` | <code>"&#123;count&#125; 项任务已完成"</code> | <code>"&#123;count&#125; tasks done"</code> |
| `tasks.working` | <code>"正在运行"</code> | <code>"Working"</code> |
| `tasks.waitingState` | <code>"等待输入"</code> | <code>"Waiting for input"</code> |
| `tasks.failedState` | <code>"失败"</code> | <code>"Failed"</code> |
| `tasks.childFailed` | <code>"子任务失败，展开查看详情"</code> | <code>"Subagent failed. Expand for details."</code> |
| `tasks.doneState` | <code>"已完成"</code> | <code>"Done"</code> |
| `tasks.cancelledState` | <code>"已取消"</code> | <code>"Cancelled"</code> |
| `tasks.runningOne` | <code>"&#123;total&#125; 项任务中有 &#123;running&#125; 项正在运行"</code> | <code>"&#123;running&#125; of &#123;total&#125; task running"</code> |
| `tasks.waitingOne` | <code>"&#123;count&#125; 项任务等待输入"</code> | <code>"&#123;count&#125; task waiting for input"</code> |
| `tasks.failedOne` | <code>"&#123;total&#125; 项任务已结束，&#123;failed&#125; 项失败"</code> | <code>"&#123;total&#125; task done, &#123;failed&#125; failed"</code> |
| `tasks.doneOne` | <code>"&#123;count&#125; 项任务已完成"</code> | <code>"&#123;count&#125; task done"</code> |
| `tasks.groupCount` | <code>"&#123;count&#125; 项任务"</code> | <code>"&#123;count&#125; tasks"</code> |
| `tasks.groupRunning` | <code>"&#123;count&#125; 项正在运行"</code> | <code>"&#123;count&#125; running"</code> |
| `tasks.groupWaiting` | <code>"&#123;count&#125; 项等待输入"</code> | <code>"&#123;count&#125; waiting"</code> |
| `tasks.groupFailed` | <code>"&#123;count&#125; 项失败"</code> | <code>"&#123;count&#125; failed"</code> |
| `humanQuestion.back` | <code>"上一步"</code> | <code>"Back"</code> |
| `humanQuestion.next` | <code>"下一步"</code> | <code>"Next"</code> |
| `humanQuestion.submit` | <code>"确认选择"</code> | <code>"Confirm selection"</code> |
| `humanQuestion.submitting` | <code>"正在提交选择…"</code> | <code>"Submitting selection…"</code> |
| `humanQuestion.answered` | <code>"已选择"</code> | <code>"Selected"</code> |
| `humanQuestion.noneSelected` | <code>"未选择"</code> | <code>"No selection"</code> |
| `humanQuestion.unavailable` | <code>"此问题暂时无法回答"</code> | <code>"This question cannot be answered right now"</code> |
| `questionOptions.confirm` | <code>"确认"</code> | <code>"Confirm"</code> |
| `questionOptions.noneSelected` | <code>"未选择"</code> | <code>"Nothing selected"</code> |
| `questionOptions.selected` | <code>"已选择："</code> | <code>"Selected:"</code> |
| `questionOptions.count` | <code>"已选 &#123;count&#125; / &#123;max&#125;"</code> | <code>"&#123;count&#125; of &#123;max&#125;"</code> |
| `frontendTools.formTitle` | <code>"个人资料表单"</code> | <code>"Profile Form"</code> |
| `frontendTools.firstName` | <code>"名"</code> | <code>"First name"</code> |
| `frontendTools.lastName` | <code>"姓"</code> | <code>"Last name"</code> |
| `frontendTools.email` | <code>"邮箱"</code> | <code>"Email"</code> |
| `frontendTools.projectIdea` | <code>"项目想法"</code> | <code>"Project idea"</code> |
| `frontendTools.resetForm` | <code>"重置"</code> | <code>"Reset"</code> |
| `frontendTools.submitForm` | <code>"提交"</code> | <code>"Submit"</code> |
| `frontendTools.formRequired` | <code>"此字段必填"</code> | <code>"This field is required"</code> |
| `frontendTools.formInvalid` | <code>"表单包含无效字段"</code> | <code>"The form contains invalid fields"</code> |
| `frontendTools.formBusy` | <code>"表单正在提交"</code> | <code>"The form is already submitting"</code> |
| `frontendTools.formUnavailable` | <code>"表单能力不可用"</code> | <code>"Form capability unavailable"</code> |
| `frontendTools.formSubmitted` | <code>"已提交表单"</code> | <code>"Submitted form"</code> |
| `frontendTools.formReset` | <code>"已重置表单"</code> | <code>"Reset form"</code> |
| `frontendTools.formUpdating` | <code>"正在更新表单…"</code> | <code>"Updating form…"</code> |
| `frontendTools.formFailed` | <code>"无法更新表单"</code> | <code>"Could not update form"</code> |
| `frontendTools.fieldUpdated` | <code>"已更新"</code> | <code>"Updated"</code> |
| `frontendTools.fieldTo` | <code>"为"</code> | <code>"to"</code> |
| `frontendTools.close` | <code>"关闭"</code> | <code>"Close"</code> |
| `frontendTools.opening` | <code>"正在打开弹窗…"</code> | <code>"Opening dialog…"</code> |
| `frontendTools.opened` | <code>"已打开弹窗"</code> | <code>"Opened dialog"</code> |
| `frontendTools.failed` | <code>"无法打开弹窗"</code> | <code>"Could not open dialog"</code> |

### 搜索与检索

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `searchTools.searching` | <code>"正在搜索"</code> | <code>"Searching"</code> |
| `searchTools.sources` | <code>"已读取 &#123;count&#125; 个来源"</code> | <code>"Read &#123;count&#125; sources"</code> |
| `searchTools.retrieving` | <code>"正在检索"</code> | <code>"Retrieving"</code> |
| `searchTools.passages` | <code>"已检索 &#123;count&#125; 个片段"</code> | <code>"&#123;count&#125; passages retrieved"</code> |
| `searchTools.relevance` | <code>"&#123;source&#125; 相关度"</code> | <code>"&#123;source&#125; relevance score"</code> |
| `searchTools.score` | <code>"&#123;score&#125;，满分 1.00"</code> | <code>"&#123;score&#125; of 1.00"</code> |
| `searchTools.contextKnowledgeBase` | <code>"知识库信息检索"</code> | <code>"Knowledge base search"</code> |
| `searchTools.contextLongTermMemory` | <code>"长期记忆检索"</code> | <code>"Long-term memory search"</code> |
| `searchTools.contextCount` | <code>"&#123;count&#125; 条上下文"</code> | <code>"&#123;count&#125; contexts"</code> |
| `searchTools.contextQuery` | <code>"检索词"</code> | <code>"Query"</code> |
| `searchTools.contextEmpty` | <code>"没有检索到上下文"</code> | <code>"No context returned"</code> |
| `search.searching` | <code>"正在搜索"</code> | <code>"Searching"</code> |
| `search.readSources` | <code>"已读取 3 个来源"</code> | <code>"Read 3 sources"</code> |
| `search.searchFiles` | <code>"正在搜索文件"</code> | <code>"Searching files"</code> |
| `search.searchedFiles` | <code>"已搜索文件"</code> | <code>"Searched files"</code> |
| `search.noFiles` | <code>"未找到文件"</code> | <code>"0 files found"</code> |
| `search.oneFile` | <code>"找到 1 个文件 — &#123;files&#125;"</code> | <code>"1 file found — &#123;files&#125;"</code> |
| `search.manyFiles` | <code>"找到 &#123;count&#125; 个文件 — &#123;files&#125;"</code> | <code>"&#123;count&#125; files found — &#123;files&#125;"</code> |

### 图片、音视频与文件

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `images.content` | <code>"图片内容"</code> | <code>"Image content"</code> |
| `images.newTab` | <code>"（在新标签页中打开）"</code> | <code>"(opens in a new tab)"</code> |
| `images.preview` | <code>"图片预览"</code> | <code>"Image preview"</code> |
| `images.zoom` | <code>"点击放大图片"</code> | <code>"Click to zoom image"</code> |
| `images.zoomed` | <code>"放大的图片"</code> | <code>"Zoomed image"</code> |
| `images.closeZoom` | <code>"关闭放大图片"</code> | <code>"Close zoomed image"</code> |
| `images.generating` | <code>"正在生成图片…"</code> | <code>"Generating image…"</code> |
| `images.generationFailed` | <code>"无法生成图片"</code> | <code>"Image could not be generated"</code> |
| `images.regenerate` | <code>"重新生成图片"</code> | <code>"Regenerate image"</code> |
| `images.download` | <code>"下载图片"</code> | <code>"Download image"</code> |
| `images.copy` | <code>"复制图片"</code> | <code>"Copy image"</code> |
| `images.blocked` | <code>"服务提供方阻止了这张图片。"</code> | <code>"The provider blocked this image."</code> |
| `media.audio` | <code>"音频"</code> | <code>"Audio"</code> |
| `media.video` | <code>"视频"</code> | <code>"Video"</code> |
| `media.play` | <code>"播放 &#123;title&#125;"</code> | <code>"Play &#123;title&#125;"</code> |
| `media.pause` | <code>"暂停 &#123;title&#125;"</code> | <code>"Pause &#123;title&#125;"</code> |
| `media.seek` | <code>"调整播放进度"</code> | <code>"Seek"</code> |
| `media.position` | <code>"&#123;current&#125;，共 &#123;duration&#125;"</code> | <code>"&#123;current&#125; of &#123;duration&#125;"</code> |
| `media.audioError` | <code>"无法播放此音频"</code> | <code>"Can't play this audio"</code> |
| `files.unnamed` | <code>"未命名文件"</code> | <code>"Unnamed file"</code> |
| `files.download` | <code>"下载 &#123;filename&#125;"</code> | <code>"Download &#123;filename&#125;"</code> |

### 主题、语言与通用控件

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `theme.settings` | <code>"主题设置"</code> | <code>"Theme settings"</code> |
| `theme.light` | <code>"浅色"</code> | <code>"Light"</code> |
| `theme.dark` | <code>"深色"</code> | <code>"Dark"</code> |
| `theme.violet` | <code>"紫色"</code> | <code>"Violet"</code> |
| `accessibility.sidebar` | <code>"侧边栏"</code> | <code>"Sidebar"</code> |
| `accessibility.sidebarDescription` | <code>"显示移动端侧边栏。"</code> | <code>"Displays the mobile sidebar."</code> |
| `accessibility.toggleSidebar` | <code>"切换侧边栏"</code> | <code>"Toggle Sidebar"</code> |
| `accessibility.language` | <code>"语言"</code> | <code>"Language"</code> |
| `accessibility.chineseName` | <code>"简体中文"</code> | <code>"简体中文"</code> |
| `accessibility.englishName` | <code>"English"</code> | <code>"English"</code> |
| `layout.open` | <code>"打开业务面板"</code> | <code>"Open panel"</code> |
| `layout.close` | <code>"关闭业务面板"</code> | <code>"Close panel"</code> |
| `layout.collapse` | <code>"收起业务面板"</code> | <code>"Collapse panel"</code> |
| `layout.restore` | <code>"恢复业务面板"</code> | <code>"Restore panel"</code> |
| `common.close` | <code>"关闭"</code> | <code>"Close"</code> |
| `common.copy` | <code>"复制"</code> | <code>"Copy"</code> |
| `common.refresh` | <code>"重试"</code> | <code>"Refresh"</code> |
| `common.edit` | <code>"编辑"</code> | <code>"Edit"</code> |
| `common.cancel` | <code>"取消"</code> | <code>"Cancel"</code> |
| `common.update` | <code>"更新"</code> | <code>"Update"</code> |
| `common.previous` | <code>"上一项"</code> | <code>"Previous"</code> |
| `common.next` | <code>"下一项"</code> | <code>"Next"</code> |
| `common.show` | <code>"显示"</code> | <code>"Show"</code> |
| `common.more` | <code>"更多"</code> | <code>"more"</code> |
| `common.back` | <code>"返回"</code> | <code>"Back"</code> |
| `common.retry` | <code>"重试"</code> | <code>"Retry"</code> |

### 登录与账号

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `auth.title` | <code>"登录你的 Agent"</code> | <code>"Sign in to your Agent"</code> |
| `auth.checking` | <code>"正在检查登录状态…"</code> | <code>"Checking your session…"</code> |
| `auth.account` | <code>"账号"</code> | <code>"Account"</code> |
| `auth.password` | <code>"密码"</code> | <code>"Password"</code> |
| `auth.signIn` | <code>"登录"</code> | <code>"Sign in"</code> |
| `auth.signOut` | <code>"退出登录"</code> | <code>"Sign out"</code> |
| `auth.working` | <code>"请稍候…"</code> | <code>"Please wait…"</code> |
| `auth.signInFailed` | <code>"登录失败，请检查账号和密码后重试。"</code> | <code>"Sign-in failed. Check your credentials and try again."</code> |
| `auth.signOutFailed` | <code>"已退出本地会话，远程退出失败。"</code> | <code>"You are signed out locally. Remote sign-out failed."</code> |
| `auth.notSignedIn` | <code>"未登录"</code> | <code>"Not signed in"</code> |
| `auth.accountMenu` | <code>"账户菜单"</code> | <code>"Account menu"</code> |

### 运行状态与错误

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `thinkingIndicator.thinking` | <code>"正在思考..."</code> | <code>"Thinking..."</code> |
| `thinkingIndicator.working` | <code>"正在处理..."</code> | <code>"Working..."</code> |
| `runtime.pluginRenderFailed` | <code>"无法显示插件“&#123;plugin&#125;”。"</code> | <code>"&#123;plugin&#125; could not be rendered."</code> |
| `runtime.assistant` | <code>"助手"</code> | <code>"Assistant"</code> |
| `runtime.openAssistant` | <code>"打开助手"</code> | <code>"Open assistant"</code> |
| `runtime.closeAssistant` | <code>"关闭助手"</code> | <code>"Close assistant"</code> |
| `runtime.startupFailed` | <code>"应用启动失败"</code> | <code>"Application startup failed"</code> |
| `runtime.unknownGateError` | <code>"未知的应用启动错误。"</code> | <code>"Unknown Application Gate error."</code> |
| `runtime.gateCannotRender` | <code>"无法显示当前应用启动界面。"</code> | <code>"The active Application Gate cannot be rendered."</code> |
| `runtime.pluginNotifications` | <code>"插件错误通知"</code> | <code>"Plugin error notifications"</code> |
| `runtime.pluginFailed` | <code>"插件运行失败"</code> | <code>"Plugin failed"</code> |
| `runtime.dismissPluginError` | <code>"关闭 &#123;plugin&#125; 错误提示"</code> | <code>"Dismiss &#123;plugin&#125; error"</code> |
| `runtime.pluginNotRegistered` | <code>"UI 插件“&#123;plugin&#125;”尚未注册。"</code> | <code>"UI plugin &#92;"&#123;plugin&#125;&#92;" is not registered."</code> |
| `runtime.pluginActivationFailed` | <code>"UI 插件“&#123;plugin&#125;”激活失败：&#123;error&#125;"</code> | <code>"UI plugin &#92;"&#123;plugin&#125;&#92;" failed to activate: &#123;error&#125;"</code> |
| `runtime.waitingForService` | <code>"正在等待插件服务：&#123;services&#125;"</code> | <code>"Waiting for plugin service: &#123;services&#125;"</code> |
| `runtime.missingInstance` | <code>"缺少 UI 插件实例“&#123;instance&#125;”。"</code> | <code>"UI plugin instance &#92;"&#123;instance&#125;&#92;" is missing."</code> |

### 示例与演示页面

| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |
| --- | --- | --- |
| `examples.hostAnalyzeButton` | <code>"让助理分析"</code> | <code>"Analyze with assistant"</code> |
| `examples.hostAnalyzePrompt` | <code>"请检查当前演示页面并提出改进建议。"</code> | <code>"Please review this presentation page and suggest improvements."</code> |
| `examples.hostCloseAssistant` | <code>"关闭助理"</code> | <code>"Close assistant"</code> |
| `examples.hostOpenAssistant` | <code>"打开助理"</code> | <code>"Open assistant"</code> |
| `examples.hostSendFailed` | <code>"助理请求失败，请重试。"</code> | <code>"The assistant request failed. Please try again."</code> |
| `examples.presentationEditor` | <code>"演示文稿编辑区"</code> | <code>"Presentation editor"</code> |
| `examples.presentationDocument` | <code>"演示文稿"</code> | <code>"Presentation"</code> |
| `examples.canvasSelect` | <code>"选择"</code> | <code>"Select"</code> |
| `examples.canvasText` | <code>"编辑标题"</code> | <code>"Edit title"</code> |
| `examples.canvasBold` | <code>"标题加粗"</code> | <code>"Bold title"</code> |
| `examples.canvasAlign` | <code>"标题居中"</code> | <code>"Center title"</code> |
| `examples.canvasGrid` | <code>"画布网格"</code> | <code>"Canvas grid"</code> |
| `examples.canvasSlide` | <code>"幻灯片"</code> | <code>"Slide"</code> |
| `examples.canvasHint` | <code>"点击标题即可编辑"</code> | <code>"Click the title to edit"</code> |
| `examples.canvasSubtitle` | <code>"让每一个想法，都有清晰的表达"</code> | <code>"A clearer workspace for every idea"</code> |
| `examples.canvasPillarOne` | <code>"连接上下文"</code> | <code>"Connect context"</code> |
| `examples.canvasPillarTwo` | <code>"梳理想法"</code> | <code>"Shape ideas"</code> |
| `examples.canvasPillarThree` | <code>"推动下一步"</code> | <code>"Move work forward"</code> |
| `examples.durableRun` | <code>"持久化运行"</code> | <code>"Durable run"</code> |
| `examples.agentPlanActivityRefreshRecovery` | <code>"执行计划刷新恢复"</code> | <code>"AgentPlan Activity refresh recovery"</code> |
| `examples.productionBindingRefreshRecovery` | <code>"生产绑定刷新恢复"</code> | <code>"Production binding refresh recovery"</code> |
| `examples.agentInvocationCount` | <code>"Agent 调用次数："</code> | <code>"Agent invocation count:"</code> |
| `examples.runALongTask` | <code>"执行一个长任务"</code> | <code>"Run a long task"</code> |
| `examples.send` | <code>"发送"</code> | <code>"Send"</code> |
| `examples.loading` | <code>"加载中……"</code> | <code>"Loading…"</code> |
| `examples.runResumeMock` | <code>"运行恢复示例"</code> | <code>"Run Resume Mock"</code> |
| `examples.sendALongTaskAndRefreshAfter` | <code>"发送长任务，看到第一段后刷新页面。Mock server 会继续执行同一个 Run。"</code> | <code>"Send a long task and refresh after the first segment. The Mock server continues the same Run."</code> |
| `examples.task` | <code>"任务"</code> | <code>"Task"</code> |
| `examples.stop` | <code>"停止"</code> | <code>"Stop"</code> |
| `examples.organizeCustomerFeedback` | <code>"整理客户反馈"</code> | <code>"Organize customer feedback"</code> |
| `examples.productExperience` | <code>"产品体验"</code> | <code>"Product experience"</code> |
| `examples.today` | <code>"今天"</code> | <code>"Today"</code> |
| `examples.inProgress` | <code>"进行中"</code> | <code>"In progress"</code> |
| `examples.updateTheQuarterlyRoadmap` | <code>"更新季度路线图"</code> | <code>"Update the quarterly roadmap"</code> |
| `examples.planning` | <code>"规划"</code> | <code>"Planning"</code> |
| `examples.tomorrow` | <code>"明天"</code> | <code>"Tomorrow"</code> |
| `examples.pending` | <code>"待处理"</code> | <code>"Pending"</code> |
| `examples.prepareFridaySDesignReview` | <code>"准备周五设计评审"</code> | <code>"Prepare Friday's design review"</code> |
| `examples.designSystem` | <code>"设计系统"</code> | <code>"Design system"</code> |
| `examples.friday` | <code>"周五"</code> | <code>"Friday"</code> |
| `examples.workspaceNavigation` | <code>"工作区导航"</code> | <code>"Workspace navigation"</code> |
| `examples.myWorkspace` | <code>"我的工作区"</code> | <code>"My workspace"</code> |
| `examples.overview` | <code>"总览"</code> | <code>"Overview"</code> |
| `examples.activity` | <code>"动态"</code> | <code>"Activity"</code> |
| `examples.lin` | <code>"林"</code> | <code>"Lin"</code> |
| `examples.jiayiLin` | <code>"林嘉怡"</code> | <code>"Jiayi Lin"</code> |
| `examples.teamWorkspace` | <code>"团队工作区"</code> | <code>"Team workspace"</code> |
| `examples.workspaceOverview` | <code>"工作区 / 总览"</code> | <code>"Workspace / Overview"</code> |
| `examples.september2026` | <code>"2026 年 9 月"</code> | <code>"September 2026"</code> |
| `examples.fridayWorkOverview` | <code>"星期五 · 工作概览"</code> | <code>"Friday · Work overview"</code> |
| `examples.goodMorningJiayi` | <code>"早上好，嘉怡"</code> | <code>"Good morning, Jiayi"</code> |
| `examples.startYourDayHereStayOnTop` | <code>"从这里开始今天的工作。你的项目进展都在掌握之中。"</code> | <code>"Start your day here. Stay on top of your projects."</code> |
| `examples.workStatistics` | <code>"工作统计"</code> | <code>"Work statistics"</code> |
| `examples.activeProjects` | <code>"进行中的项目"</code> | <code>"Active projects"</code> |
| `examples.sameAsLastWeek` | <code>"与上周持平"</code> | <code>"Same as last week"</code> |
| `examples.tasksToComplete` | <code>"待完成任务"</code> | <code>"Tasks to complete"</code> |
| `examples.section3DueThisWeek` | <code>"本周有 3 项到期"</code> | <code>"3 due this week"</code> |
| `examples.teamUpdates` | <code>"团队更新"</code> | <code>"Team updates"</code> |
| `examples.section2NewToday` | <code>"今天新增 2 条"</code> | <code>"2 new today"</code> |
| `examples.nextSteps` | <code>"下一步"</code> | <code>"Next steps"</code> |
| `examples.upcomingTasks` | <code>"近期任务"</code> | <code>"Upcoming tasks"</code> |
| `examples.viewAll` | <code>"查看全部 →"</code> | <code>"View all →"</code> |
| `examples.teamTip` | <code>"团队提示"</code> | <code>"Team tip"</code> |
| `examples.turnIdeasIntoActionFaster` | <code>"让想法更快落地"</code> | <code>"Turn ideas into action faster"</code> |
| `examples.letYourAssistantOrganizeRepetitiveWorkSo` | <code>"把重复的整理工作交给助理，把时间留给真正重要的决定。"</code> | <code>"Let your assistant organize repetitive work so you can focus on important decisions."</code> |
| `examples.userInterviews` | <code>"用户访谈"</code> | <code>"User interviews"</code> |
| `examples.september12` | <code>"9 月 12 日"</code> | <code>"September 12"</code> |
| `examples.completed` | <code>"已完成"</code> | <code>"Completed"</code> |
| `examples.interactivePrototype` | <code>"交互原型"</code> | <code>"Interactive prototype"</code> |
| `examples.september19` | <code>"9 月 19 日"</code> | <code>"September 19"</code> |
| `examples.developmentHandoff` | <code>"开发交付"</code> | <code>"Development handoff"</code> |
| `examples.october3` | <code>"10 月 03 日"</code> | <code>"October 3"</code> |
| `examples.notStarted` | <code>"待开始"</code> | <code>"Not started"</code> |
| `examples.projectSpace` | <code>"项目空间"</code> | <code>"Project space"</code> |
| `examples.projects` | <code>"项目"</code> | <code>"Projects"</code> |
| `examples.productDesign` | <code>"产品设计"</code> | <code>"Product design"</code> |
| `examples.documents` | <code>"文档"</code> | <code>"Documents"</code> |
| `examples.projectDocument` | <code>"项目文档"</code> | <code>"Project document"</code> |
| `examples.nextGenerationWorkbench` | <code>"下一代工作台"</code> | <code>"Next-generation workbench"</code> |
| `examples.aClearerSmootherCollaborationExperienceForYour` | <code>"为团队打造一个更清晰、更流畅的协作体验。"</code> | <code>"A clearer, smoother collaboration experience for your team."</code> |
| `examples.shareDocument` | <code>"分享文档"</code> | <code>"Share document"</code> |
| `examples.updatedSeptember24` | <code>"更新于 9 月 24 日"</code> | <code>"Updated September 24"</code> |
| `examples.editing` | <code>"● 正在编辑"</code> | <code>"● Editing"</code> |
| `examples.section01ProjectOverview` | <code>"01 / 项目概览"</code> | <code>"01 / Project overview"</code> |
| `examples.whatProblemAreWeSolving` | <code>"我们要解决什么问题？"</code> | <code>"What problem are we solving?"</code> |
| `examples.teamInformationIsSpreadAcrossToolsPeople` | <code>"团队的工作信息散落在不同工具中。成员需要反复切换页面，才能理解一个项目的背景、进度和下一步行动。我们希望把关键上下文放在同一个地方，让讨论和执行自然衔接。"</code> | <code>"Team information is spread across tools. People switch between pages to understand a project's background, progress, and next steps. We want key context in one place so discussion leads naturally to action."</code> |
| `examples.designPrincipleShowImportantInformationWhenIt` | <code>"设计原则：让重要信息在需要的时候出现，减少无意义的打断。"</code> | <code>"Design principle: show important information when it is needed and reduce unnecessary interruptions."</code> |
| `examples.section02DeliveryPlan` | <code>"02 / 交付计划"</code> | <code>"02 / Delivery plan"</code> |
| `examples.upcomingMilestones` | <code>"近期里程碑"</code> | <code>"Upcoming milestones"</code> |
| `examples.section03Notes` | <code>"03 / 备注"</code> | <code>"03 / Notes"</code> |
| `examples.questionsToDiscuss` | <code>"待讨论的问题"</code> | <code>"Questions to discuss"</code> |
| `examples.howCanTheAssistantHelpUsersExplore` | <code>"如何让助理在保留当前文档上下文的同时，协助用户探索不同方案？右侧的嵌入式助理可以与页面并排工作。"</code> | <code>"How can the assistant help users explore alternatives while preserving the current document context? The embedded assistant works beside the page."</code> |
| `examples.embeddedAssistant` | <code>"嵌入式助理"</code> | <code>"Embedded assistant"</code> |
| `themeShowcase.title` | <code>"Agent UI 主题"</code> | <code>"Agent UI themes"</code> |
| `themeShowcase.theme` | <code>"主题设置"</code> | <code>"Theme settings"</code> |
| `themeShowcase.light` | <code>"明亮"</code> | <code>"Light"</code> |
| `themeShowcase.dark` | <code>"深色"</code> | <code>"Dark"</code> |
| `themeShowcase.violet` | <code>"紫色"</code> | <code>"Violet"</code> |
| `themeShowcase.welcome` | <code>"欢迎"</code> | <code>"Welcome"</code> |
| `themeShowcase.welcomeText` | <code>"探索三种官方主题下的相同会话。"</code> | <code>"Explore the same conversation in three official theme presets."</code> |
| `themeShowcase.user` | <code>"展示一下主题的效果。"</code> | <code>"Show me how the theme looks."</code> |
| `themeShowcase.assistant` | <code>"每个界面都使用语义化 Token。"</code> | <code>"Every surface consumes semantic tokens."</code> |
| `themeShowcase.composer` | <code>"发送消息以运行思考和工具 Mock 场景…"</code> | <code>"Send a message to run the reasoning and tool Mock scenario…"</code> |
| `themeShowcase.send` | <code>"发送"</code> | <code>"Send"</code> |
| `themeShowcase.stop` | <code>"停止"</code> | <code>"Stop"</code> |
| `themeShowcase.primary` | <code>"主要操作"</code> | <code>"Primary action"</code> |
| `themeShowcase.secondary` | <code>"次要操作"</code> | <code>"Secondary action"</code> |
| `themeShowcase.dialog` | <code>"对话框"</code> | <code>"Dialog"</code> |
| `themeShowcase.popover` | <code>"浮层"</code> | <code>"Popover"</code> |
| `themeShowcase.close` | <code>"关闭"</code> | <code>"Close"</code> |
| `themeShowcase.dialogText` | <code>"此对话框通过作用域内的 Portal 继承当前主题。"</code> | <code>"This dialog inherits the selected theme through the scoped portal."</code> |
| `themeShowcase.popoverText` | <code>"浮层背景、边框、文字和焦点使用语义化 Token。"</code> | <code>"Popover surface, border, text and focus use semantic tokens."</code> |
| `themeShowcase.success` | <code>"成功"</code> | <code>"Success"</code> |
| `themeShowcase.warning` | <code>"警告"</code> | <code>"Warning"</code> |
| `themeShowcase.error` | <code>"错误"</code> | <code>"Error"</code> |
| `themeShowcase.tokens` | <code>"图表调色板"</code> | <code>"Chart palette"</code> |
| `themeShowcase.threadList` | <code>"会话列表"</code> | <code>"Thread list"</code> |
| `themeShowcase.newChat` | <code>"新建会话"</code> | <code>"New chat"</code> |
| `themeShowcase.threadOne` | <code>"主题探索"</code> | <code>"Theme exploration"</code> |
| `themeShowcase.threadTwo` | <code>"设计评审"</code> | <code>"Design review"</code> |
| `themeShowcase.source` | <code>"shadcn 主题文档"</code> | <code>"shadcn theme documentation"</code> |
| `themeShowcase.tool` | <code>"搜索文件"</code> | <code>"Search files"</code> |
| `themeShowcase.activeTool` | <code>"正在搜索文件"</code> | <code>"Searching files"</code> |
| `themeShowcase.query` | <code>"主题 Token"</code> | <code>"Theme tokens"</code> |
| `themeShowcase.reasoning` | <code>"思考"</code> | <code>"Reasoning"</code> |
| `themeShowcase.reasoningText` | <code>"使用上游调色板，并保持产品扩展简洁。"</code> | <code>"Use the upstream palette and keep product extensions thin."</code> |
| `themeShowcase.stopped` | <code>"生成已停止"</code> | <code>"Generation stopped"</code> |
| `themeShowcase.live` | <code>"实时 Mock 会话"</code> | <code>"Live Mock conversation"</code> |
| `themeShowcase.samples` | <code>"消息示例"</code> | <code>"Message samples"</code> |
| `themeShowcase.mention` | <code>"设计团队"</code> | <code>"Design team"</code> |
| `themeShowcase.command` | <code>"总结"</code> | <code>"Summarize"</code> |
| `themeShowcase.request` | <code>"&#123;&#92;"query&#92;":&#92;"theme&#92;"&#125;"</code> | <code>"&#123;&#92;"query&#92;":&#92;"theme&#92;"&#125;"</code> |
| `themeShowcase.result` | <code>"&#123;&#92;"tokens&#92;":32&#125;"</code> | <code>"&#123;&#92;"tokens&#92;":32&#125;"</code> |
| `composerTriggerDemo.localeKey` | <code>"zh-CN"</code> | <code>"en-US"</code> |
| `composerTriggerDemo.personOne` | <code>"张三"</code> | <code>"Zhang San"</code> |
| `composerTriggerDemo.personTwo` | <code>"张晓"</code> | <code>"Zhang Xiao"</code> |
| `composerTriggerDemo.personThree` | <code>"李四"</code> | <code>"Li Si"</code> |
| `composerTriggerDemo.departmentOne` | <code>"产品部 · 产品经理"</code> | <code>"Product · Product manager"</code> |
| `composerTriggerDemo.departmentTwo` | <code>"研发部 · 工程师"</code> | <code>"Engineering · Engineer"</code> |
| `composerTriggerDemo.departmentThree` | <code>"设计部 · 设计师"</code> | <code>"Design · Designer"</code> |
| `composerTriggerDemo.summarize` | <code>"总结"</code> | <code>"Summarize"</code> |

<!-- locale-reference:end -->

## 验证

运行工程的类型检查与构建，再切换中英文及浅色、深色等已有主题，检查输入、弹层、焦点、长文本和窄屏。业务页面的其他组件也应保持正常。
