# 官方插件公开 props 约定与逐项核对

面向使用者的逐项属性、类型、默认行为与嵌套配置，分别列在[各插件文档](../../website/docs/plugins/index.md)的“属性”与“开发 API”中。本页保留设计约定与核对摘要。

本表记录 49 个官方插件的公开属性约定。完整展示组件采用常见 React 组件库的用法；不把内部标签或封装层当作用户配置模型。此约定不引入 Ant Design 依赖，也不要求所有插件使用同一个 UI Library。

- 常用外观直接使用 `className`、`style`，内容和行为使用可理解的属性。
- 折叠区域统一 `expanded`、`defaultExpanded`、`onExpandedChange`。底层公开组合部件保留其原生 `open` API。
- 不再把整个组件的参数藏进 rootProps、adapterProps、listProps、progressProps 等实现包装对象。
- inputProps、searchProps、buttonProps 等仅用于真实、独立的子组件；多表面组件保留分别定制的能力。
- 只有细部样式需要分区时才使用 `classNames`、`styles`；内容使用有明确用途的 `icon`、`options` 或 renderer，不提供任意替换整体内容的 `children`，不逐个暴露内部 HTML 标签。
- 仅 `reasoning`、`tool-group` 的 Runtime 分组内容和 `lexical-composer-input` 的原生编辑器扩展保留顶层 `children`。底层组合部件继续遵循原生 React 组合契约；这不代表普通插件配置支持通用 `children`。
- AppUIModel 不保存这些 React props。统一 locale、Host 服务、作用域、审批、中断、输入和会话 Runtime 的既有职责保持不变。
- 状态、计划、任务进度、文件和搜索插件使用会话投影的数据与运行状态，不提供重复覆盖；独立展示组件接收渲染数据，项目定制使用 renderer。
- 不暴露 React key 重置、测量缓存、动画协调与实验参数；无效属性直接移除。Composer 的 rows、maxLength、submitMode、autoFocus 仅在根属性设置，输入值由会话管理。
- 当前公开 API 使用统一属性形式；不保留第二套根属性别名。已有应用层的调用迁移是独立代码修改，npm 更新不自动重写用户文件。
- 类型与运行转发都需验证。Windows 与浏览器视觉验收单独记录，React API 的静态检查不替代真实运行验证。

| 插件 | 核对结果 |
| --- | --- |
| `composer` | 直接 rows、maxLength、submitMode、className、style、onSubmit；保留 inputProps、dropzoneProps 和组合节点。 |
| `copy-action` | 直接接受公开按钮属性和 icon；完成反馈由复制状态提供，提示文案由统一 locale 提供。 |
| `reload-action` | 直接接受公开按钮属性和 icon；提示文案由统一 locale 提供，保留重试生命周期。 |
| `feedback-actions` | 两个独立按钮：likeButtonProps、dislikeButtonProps；保留本地化标签和评价 Runtime。 |
| `export-markdown-action` | presentation 选择按钮或菜单，各自属性直接传入对应表面，icon 定制图标；文案沿用 locale。 |
| `reasoning` | 直接 expanded、defaultExpanded、onExpandedChange 与整体样式；运行标记由会话提供，保留公开子组件组合。 |
| `tool-group` | 直接 expanded、defaultExpanded、onExpandedChange 与整体样式；保留按钮和内容组件。 |
| `add-attachment-action` | 直接接受按钮属性与 icon；保留 multiple 与附件 Runtime。 |
| `dictation-action` | className、style、disabled；独立按钮为 startButtonProps、stopButtonProps；开始／停止文案沿用 locale。 |
| `submit-action` | className、style、disabled；独立按钮为 sendButtonProps、cancelButtonProps，发送按钮还支持 endpoint、onSendError；文案沿用 locale。 |
| `response-footer` | 直接整体样式；保留真正独立的 actionBarProps、branchPickerProps 与 actions 内容。 |
| `conversation-suggestions` | 直接 items、sendOnSelect、clearComposer 和整体样式；文字样式用 classNames/styles，按钮用 buttonProps，静态与会话建议均支持 renderSuggestion(item, defaultView)。 |
| `thinking-indicator` | 直接 label、className、style；保留推导可见性策略。 |
| `tool-timeline` | 直接展开状态、visibleSteps 与整体样式；摘要由会话投影，不接收无效 children。 |
| `transient-assistant-messages` | 直接整体样式；正文通过 classNames/styles.text 定制；保留 renderMessage。 |
| `agent-status-message` | 直接整体样式；label、elapsed、state 由工具投影，保留 fallback 和 renderStatus。 |
| `agent-plan-message` | 直接整体样式；title、steps、activeIndex 由消息投影，保留 renderPlan。 |
| `job-progress-message` | 直接整体样式与 renderProgress；任务数据、进度和完成结果由投影提供，运行状态与中止仍来自既有 Host。 |
| `generated-file-message` | 直接整体样式；文件属性由有效工具结果提供，保留 renderFile。 |
| `chart-message` | 标题来自图表数据；直接整体样式、formatValue、renderItem/renderChart；细部样式使用语义 classNames/styles。 |
| `source-citations-message` | 直接整体样式；保留有区分联合类型保护的 sourceProps 与渲染回调。 |
| `retrieval-chunks` | 直接 visibleCount 与整体样式；查询、片段和加载状态来自工具，文案使用统一 locale，保留 renderer。 |
| `web-search` | 直接 visibleResults 与整体样式；查询、结果和加载状态来自工具，文案使用统一 locale，保留 renderer。 |
| `conversation-thread-list` | 直接 showSearch、showArchived、searchProps、itemProps、components、整体样式；renderList(defaultList) 定制列表，保留 Host 会话服务。 |
| `navigation-menu` | `items` 为动作／视图项数组或默认项扩展函数；默认新建操作由 canonical Runtime 提供；`presentation` 支持 Sidebar 与图标工具栏，视图切换使用现有 Stack Service。 |
| `conversation-quote` | 通过 setData 提交引用数据，由 Composer 最终适配器组装请求；通过 renderPreview、renderToolbar 定制预览与工具栏；文案沿用统一 locale，无独立根样式属性。 |
| `agent-identity` | 直接 name、logo、description、整体样式；图片保留 logoProps，排除重复 src，文字样式用 classNames/styles。 |
| `auth-account` | 直接整体样式；独立组件为 buttonProps、menuProps、signOutButtonProps；退出文案使用 auth locale。 |
| `auth-gate` | 直接 title、整体样式；独立组件为 formProps、accountInputProps、passwordInputProps、submitButtonProps；按钮文案使用 auth locale，表单管理输入值。 |
| `conversation-command-source` | 无展示根节点与 children；保留既有 Host/Provider 绑定。 |
| `conversation-data-source` | 无展示根节点与 children；保留既有 Host/Provider 绑定。 |
| `conversation-service` | 无展示根节点与 children；保留既有 Host/Provider 绑定。 |
| `conversation-surface` | 直接 autoFocus、welcome、suggestions、composer、整体样式；欢迎文案由统一 locale 提供，无 labels prop。语义 Slot 仍优先，Adapter 为完整替换入口。 |
| `lexical-composer-input` | 已直接继承原生输入与编辑器公开属性；保留输入与中文 composition 行为。 |
| `lexical-edit-composer` | 已直接继承编辑区公开属性；保留编辑提交和取消生命周期。 |
| `locale-provider` | 无展示根节点与 children；保留既有 Host/Provider 绑定。 |
| `mention-trigger` | source、debounceMs、onSelect；保留正文引用并记录原始选中项，最终数据由 Composer requestAdapter 组装；文案使用统一 conversationTriggers locale。 |
| `slash-command-trigger` | source、onSelect；保留正文引用并记录原始选中项，最终数据由 Composer requestAdapter 组装；文案使用统一 conversationTriggers locale。 |
| `task-group` | 已直接继承任务组公开属性；保留 renderGroup。 |
| `theme-provider` | 无展示根节点与 children；保留既有 Host/Provider 绑定。 |
| `theme-switch` | 直接整体样式、disabled、options；标识统一用 selectProps.id；主题值与切换沿用既有服务。 |
| `context-retrieval-message` | 直接 title、expanded、defaultExpanded、onExpandedChange、整体样式；保留 renderContent。 |
| `locale-switch` | 直接整体样式、disabled、options；标识统一用 selectProps.id；使用现有唯一语言服务。 |
| `ask-user-question` | 接收工具调用数据与整体样式，文案通过 humanQuestion locale；保留问答协议与历史只读。 |
| `tool-result` | 唯一工具卡片插件；components 按 Header、Args、Approval、ApprovalCard、Result、Error 及媒体类型替换，注入专属数据和原有操作。renderToolCall 只接收独立的 header（名称、状态、入参）与 defaultView（无 header 的内容区）。完整 ApprovalCard 优先并绕过通用布局回调；结果组件不拥有调用 header。默认组合、resultOnly、样式及 resolveFile 保留；展示记录只保存实际观察到的审批来源，不重建 gate 或猜测旧历史。 |
| `skills` | `items`、`quickItemCount`、`disabled` 及根样式；通过 Service 保存选择，调用通用 `setData({ id, label })` 收集发送数据，默认生成的 Composer 应用层将其映射到 ctx，不暴露 ctx 或局部请求适配器。 |
| `skills-selection` | `disabled` 和根 `div` 属性；依赖 `conversation.skills` Service，读取选择并通过服务取消，不从 Composer 读取 UI 状态。 |
| `workbench-panel` | `items`、service、受控展开／选中／可见标签、回调、宽度和根样式；renderMain 提供主区域后备内容，main 插槽优先；关闭时保持内容挂载。 |
| `workbench-panel-actions` | 仅 `service`、`items` 与兼容的 Runtime 组合参数，不宣称原生 nav／按钮属性。 |
