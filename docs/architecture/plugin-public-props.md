# 官方插件公开 props 约定与逐项核对

面向使用者的逐项属性、类型、默认行为与嵌套配置，分别列在[各插件文档](../../website/docs/plugins/index.md)的“手动开发 → 属性”中。本页保留设计约定与核对摘要。

本表记录 46 个官方插件的公开属性约定。完整展示组件采用常见 React 组件库的用法；不把内部标签或封装层当作用户配置模型。此约定不引入 Ant Design 依赖，也不要求所有插件使用同一个 UI Library。

- 常用外观直接使用 `className`、`style`，内容和行为使用可理解的属性。
- 折叠区域统一 `expanded`、`defaultExpanded`、`onExpandedChange`。底层公开组合部件保留其原生 `open` API。
- 不再把整个组件的参数藏进 rootProps、adapterProps、listProps、progressProps 等实现包装对象。
- inputProps、searchProps、buttonProps 等仅用于真实、独立的子组件；多表面组件保留分别定制的能力。
- 只有细部样式需要分区时才使用 `classNames`、`styles`；优先 renderers、children 或公开子组件，不逐个暴露内部 HTML 标签。
- AppUIModel 不保存这些 React props。统一 locale、Host 服务、作用域、审批、中断、输入和会话 Runtime 的既有职责保持不变。
- 当前公开 API 使用统一属性形式；不保留第二套根属性别名。已有应用层的调用迁移是独立代码修改，npm 更新不自动重写用户文件。
- 类型与运行转发都需验证。Windows 与浏览器视觉验收单独记录，React API 的静态检查不替代真实运行验证。

| 插件 | 核对结果 |
| --- | --- |
| `composer` | 直接 rows、maxLength、submitMode、className、style、onSubmit；保留 inputProps、dropzoneProps 和组合节点。 |
| `copy-action` | 已直接接受按钮属性；保留 tooltip、children 和点击默认动作。 |
| `reload-action` | 已直接接受按钮属性；保留 tooltip、children 和重试生命周期。 |
| `feedback-actions` | 两个独立按钮：likeButtonProps、dislikeButtonProps；保留本地化标签和评价 Runtime。 |
| `export-markdown-action` | 常用按钮属性直接传入；菜单版本保留 menuLabel、menuItemProps。 |
| `reasoning` | 直接 expanded、defaultExpanded、onExpandedChange 与整体样式；保留公开子组件组合。 |
| `tool-group` | 直接 expanded、defaultExpanded、onExpandedChange 与整体样式；保留按钮和内容组件。 |
| `add-attachment-action` | 已直接接受按钮属性；保留 multiple 与附件 Runtime。 |
| `dictation-action` | 直接 startText、stopText、className、style、disabled；独立按钮为 startButtonProps、stopButtonProps。 |
| `submit-action` | 直接 sendText、cancelText、className、style、disabled；独立按钮为 sendButtonProps、cancelButtonProps。 |
| `response-footer` | 直接整体样式；保留真正独立的 actionBarProps、branchPickerProps 与 actions 内容。 |
| `conversation-suggestions` | 直接 items、sendOnSelect、clearComposer 和整体样式；文字样式用 classNames/styles，按钮用 buttonProps。 |
| `thinking-indicator` | 直接 label、className、style；保留推导可见性策略。 |
| `tool-timeline` | 直接展开状态、restingLabel、activeLabel、visibleSteps 与整体样式；去掉已无效的二层详情参数。 |
| `tool-fallback` | 直接展开状态与整体样式；详情、参数、结果、错误、审批作为真实组件保留组合入口。 |
| `transient-assistant-messages` | 直接整体样式；正文通过 classNames/styles.text 定制；保留 renderMessage。 |
| `agent-status-message` | 直接 label、elapsed、state 与整体样式；保留数据投影、fallback 和 renderStatus。 |
| `agent-plan-message` | 直接 title、steps、activeIndex 与整体样式；保留消息解析和 renderPlan。 |
| `job-progress-message` | 直接 title、进度展示参数和整体样式；运行状态与中止仍来自既有 Host。 |
| `generated-file-message` | 直接 filename、mimeType、data、sourceType 与整体样式；保留 renderFile。 |
| `chart-message` | 直接 title、整体样式、formatValue、renderItem/renderChart；细部样式改用语义 classNames/styles。 |
| `source-citations-message` | 直接整体样式；保留有区分联合类型保护的 sourceProps 与渲染回调。 |
| `retrieval-chunks` | 直接 visibleCount、query、chunks、searching、labels 与整体样式；保留 renderer。 |
| `web-search` | 直接 visibleResults、cycle、query、results、searching、labels 与整体样式；保留 renderer。 |
| `conversation-thread-list` | 直接 showSearch、showArchived、searchProps、itemProps、components、整体样式；保留 Host 会话服务。 |
| `conversation-new` | 直接 showLabel、disabled 与整体样式；新建按钮为 buttonProps，保留导航行为。 |
| `conversation-quote` | 直接 quoteText、dismissText；预览与选择工具栏是两个独立表面，保留 previewProps、toolbarProps 和 renderers。 |
| `agent-identity` | 直接 name、logo、description、整体样式；图片保留 logoProps，文字样式用 classNames/styles。 |
| `auth-account` | 直接 signOutText、整体样式；独立组件为 buttonProps、menuProps、signOutButtonProps。 |
| `auth-gate` | 直接 title、submitText、整体样式；独立组件为 formProps、accountInputProps、passwordInputProps、submitButtonProps。 |
| `conversation-command-source` | 无展示根节点；保留既有 Host/Provider 绑定与 children，不人为添加外观参数。 |
| `conversation-data-source` | 无展示根节点；保留既有 Host/Provider 绑定与 children，不人为添加外观参数。 |
| `conversation-service` | 无展示根节点；保留既有 Host/Provider 绑定与 children，不人为添加外观参数。 |
| `conversation-surface` | 直接 autoFocus、labels、welcome、suggestions、composer、整体样式；语义 Slot 仍优先，Adapter 为完整替换入口。 |
| `lexical-composer-input` | 已直接继承原生输入与编辑器公开属性；保留输入与中文 composition 行为。 |
| `lexical-edit-composer` | 已直接继承编辑区公开属性；保留编辑提交和取消生命周期。 |
| `locale-provider` | 无展示根节点；保留既有 Host/Provider 绑定与 children，不人为添加外观参数。 |
| `mention-trigger` | 已直接继承提及组件公开属性；labels 是统一 locale 的部分覆盖。 |
| `slash-command-trigger` | 已直接继承命令组件公开属性；labels 是统一 locale 的部分覆盖。 |
| `task-group` | 已直接继承任务组公开属性；保留 renderGroup。 |
| `theme-provider` | 无展示根节点；保留既有 Host/Provider 绑定与 children，不人为添加外观参数。 |
| `theme-switch` | 直接整体样式、disabled；保留 selectProps；不改变主题选择归属。 |
| `context-retrieval-message` | 直接 title、expanded、defaultExpanded、onExpandedChange、整体样式；保留 renderContent。 |
| `locale-switch` | 直接整体样式、disabled；保留 selectProps；使用现有唯一语言服务。 |
| `ask-user-question` | 直接 submitText、整体样式；labels 为统一文案域的部分覆盖；保留问答协议与历史只读。 |
| `tool-result` | 继承工具详情 API；整体样式作用于完整结果卡片；保留 renderPart、resolveFile、resultOnly。 |
