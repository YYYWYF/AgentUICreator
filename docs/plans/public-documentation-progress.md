# 对外文档写作进度

更新日期：2026-10-23。范围：`website/docs/` 的用户文档，首页另计。

## 当前交付

**原计划 136 篇及新增的「插件开发」「Agent 参数与配置」均已有文字初稿，共 138 篇，覆盖 8 个主章节（Creator 下另含 Mock 联调）。** 插件包含 39 个界面专页；5 篇配置说明已归入应用接入或定制，并提供直接侧栏入口。本轮不制作截图；各篇已写明后续需要的画面，已有入门截图继续保留。

正文覆盖使用步骤、必要配置/参数、示例代码、可见结果、失败处理和相关链接。没有把静态构建、Mock 或已有截图说成全部功能验收。

「插件开发」采用简短说明与五个独立小例子，介绍运行操作、服务、事件、数据展示和子插件组合；其余能力提供简短说明及深入阅读入口。「自定义 Plugin 定义参考」保留完整字段与约束供按需查阅。未增加综合示例或将业务接入写成框架自动提供。

能力型配置改由「Agent 参数与配置」集中介绍。已对照实际 `AgentProps` 区分可直接传入的参数和仍使用项目配置文件的默认主题、历史地址、命令来源，没有为文档新增或假设不存在的组件属性。

## 本轮用户确认的范围

- 文档围绕用户真正能感知和操作的功能。安装工具、选择工程、修改页面、连接 Agent、使用 Plugin、部署、更新与排障是正文主线。
- 用户已确认以独立 Operator 的新工程结构核对事实，但对外不讲 Creator 内部进程、侧车协议、事务 API 或分包工作方式。普通用户仍按 Creator 安装与启动步骤使用。
- 原计划的 Operator/Bootstrap/Catalog 内部 API 专章移出对外文档，替换为 `guide/validation-results.md`（检查结果与错误状态），总数仍为 136。Creator 集成 API 页改为实际开发环境接入选项。
- 保留维护者完成接入/定制必需的 React、Web Component、AppUIModel、Plugin 参数和业务服务合同，不复制整套内部类型或框架实现。

Creator 手册保留界面开发与模拟联调两条主线，侧栏以启动配置、工程任务、结果会话和 Mock 联调四个并列主题组织，避免分组套分组。通用诊断归故障排查；全部详细页面均有直接入口。

Agent 前端手册以能力概览开篇，详细页面按「对话交互」「执行过程」「结果与体验」分组；概览说明成品交互、接入前提及 AG-UI 的作用，全部原有页面仍可从侧栏访问。

应用接入与部署围绕生产前端的页面集成、应用配置、业务服务和构建发布，公开参数与类型保留在同章参考分组。四篇 Creator 工具入口与 Windows/内网开发环境说明已归回 Creator 的环境与工程分组；应用内网部署说明归入生产部署页。

独立「开发参考」菜单已撤下，12 篇文章按主题归入 Creator、应用接入、定制和插件开发；原文保留并更新链接，API 与参数在各自主题下可直接访问。

全站结构复查已完成：138 篇文章各有一个直接侧栏入口，导航最多一层分组；角色边界、重复内容与迁移清单见[目录审查记录](./public-documentation-structure-review.md)。后续使用 `pnpm --filter @za38.03/agent-ui-docs check:docs --built` 检查目录覆盖、链接、锚点和生成侧栏。

## 章节覆盖

| 章节 | 文字初稿 | 截图 |
| --- | ---: | --- |
| 开始使用 | 7 | 已标注画面需求，本轮不制作 |
| 使用 Creator | 21 | 已标注画面需求，本轮不制作 |
| 使用 Agent 前端 | 10 | 已标注画面需求，本轮不制作 |
| Plugin 选用与开发 | 43 | 已标注画面需求，本轮不制作 |
| 应用接入与部署 | 20 | 已标注画面需求，本轮不制作 |
| 定制与扩展 | 15 | 已标注画面需求，本轮不制作 |
| 使用 Creator · Mock Agent | 4 | 已标注画面需求，本轮不制作 |
| 版本与更新 | 9 | 已标注画面需求，本轮不制作 |
| 故障排查 | 9 | 已标注画面需求，本轮不制作 |

## 逐篇入口

以下均已写正文，不使用空占位页。截图与真实业务/平台验收分别记录。

### 开始使用

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [开始使用](../../website/docs/start/index.md) |
| 文字初稿已写 | [阅读网站与 AI 文档](../../website/docs/start/read-documentation.md) |
| 文字初稿已写 | [安装并启动 Creator](../../website/docs/start/install-creator.md) |
| 文字初稿已写 | [把助理放到页面中](../../website/docs/start/first-agent-ui.md) |
| 文字初稿已写 | [创建助理界面](../../website/docs/start/project-modes.md) |
| 文字初稿已写 | [认识生成的文件](../../website/docs/start/generated-files.md) |
| 文字初稿已写 | [用 AI 修改界面](../../website/docs/start/ai-assisted.md) |

### 使用 Creator

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [界面开发](../../website/docs/guide/index.md) |
| 文字初稿已写 | [打开、切换与关闭工程](../../website/docs/guide/project-selection.md) |
| 文字初稿已写 | [配置 Creator 使用的模型](../../website/docs/guide/model-configuration.md) |
| 文字初稿已写 | [提问、检查工程与先做方案](../../website/docs/guide/ask-and-inspect.md) |
| 文字初稿已写 | [通过对话修改界面](../../website/docs/guide/request-changes.md) |
| 文字初稿已写 | [回答澄清与确认变更](../../website/docs/guide/confirmations.md) |
| 文字初稿已写 | [查看执行进度与停止任务](../../website/docs/guide/progress-and-cancel.md) |
| 文字初稿已写 | [理解修改结果与验证回执](../../website/docs/guide/receipts-and-validation.md) |
| 文字初稿已写 | [撤销与重新应用修改](../../website/docs/guide/undo-redo.md) |
| 文字初稿已写 | [管理 Creator 会话](../../website/docs/guide/conversation-lifecycle.md) |
| 文字初稿已写 | [Creator 快捷命令](../../website/docs/guide/commands.md) |
| 文字初稿已写 | [查看预览与接入指引](../../website/docs/guide/preview-and-integration.md) |
| 文字初稿已写 | [Creator 设置与界面语言](../../website/docs/guide/settings-and-language.md) |
| 文字初稿已写 | [在 Vite 页面接入 Creator](../../website/docs/guide/creator-dock-vite.md) |
| 文字初稿已写 | [在 Rsbuild 或 Webpack 页面接入 Creator](../../website/docs/guide/creator-dock-rsbuild-webpack.md) |
| 文字初稿已写 | [独立运行 Creator](../../website/docs/guide/creator-standalone.md) |
| 文字初稿已写 | [Windows 与内网开发环境](../../website/docs/guide/windows-and-offline.md) |
| 文字初稿已写 | [Creator CLI 参数](../../website/docs/guide/cli.md) |
| 文字初稿已写 | [配置文件与环境变量](../../website/docs/guide/configuration.md) |
| 文字初稿已写 | [Creator 开发环境接入选项](../../website/docs/guide/creator-integration-api.md) |
| 文字初稿已写 | [检查结果与错误状态](../../website/docs/guide/validation-results.md) |

### 使用 Agent 前端

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [前端能力概览](../../website/docs/agent-ui/index.md) |
| 文字初稿已写 | [发送消息与阅读回复](../../website/docs/agent-ui/messages.md) |
| 文字初稿已写 | [停止、重新生成与编辑消息](../../website/docs/agent-ui/stop-retry-edit.md) |
| 文字初稿已写 | [新建、查找与切换会话](../../website/docs/agent-ui/history.md) |
| 文字初稿已写 | [运行状态、排队与恢复](../../website/docs/agent-ui/run-lifecycle.md) |
| 文字初稿已写 | [附件、语音、引用与快捷输入](../../website/docs/agent-ui/input-features.md) |
| 文字初稿已写 | [阅读思考、工具与任务进度](../../website/docs/agent-ui/reasoning-and-tools.md) |
| 文字初稿已写 | [回答问题与处理审批](../../website/docs/agent-ui/approval-and-questions.md) |
| 文字初稿已写 | [引用来源、文件、图表与回复操作](../../website/docs/agent-ui/results-and-actions.md) |
| 文字初稿已写 | [语言、主题与账号入口](../../website/docs/agent-ui/appearance-and-account.md) |

### Plugin 展示与使用

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [Plugin 总览与选用](../../website/docs/plugins/index.md) |
| 文字初稿已写 | [插件开发](../../website/docs/plugins/development.md) |
| 文字初稿已写 | [输入消息（composer）](../../website/docs/plugins/composer.mdx) |
| 文字初稿已写 | [复制回复（copy-action）](../../website/docs/plugins/copy-action.mdx) |
| 文字初稿已写 | [重新生成回复（reload-action）](../../website/docs/plugins/reload-action.mdx) |
| 文字初稿已写 | [评价回复（feedback-actions）](../../website/docs/plugins/feedback-actions.mdx) |
| 文字初稿已写 | [导出回复（export-markdown-action）](../../website/docs/plugins/export-markdown-action.mdx) |
| 文字初稿已写 | [查看思考过程（reasoning）](../../website/docs/plugins/reasoning.mdx) |
| 文字初稿已写 | [查看一组工具调用（tool-group）](../../website/docs/plugins/tool-group.mdx) |
| 文字初稿已写 | [添加附件（add-attachment-action）](../../website/docs/plugins/add-attachment-action.mdx) |
| 文字初稿已写 | [语音输入（dictation-action）](../../website/docs/plugins/dictation-action.mdx) |
| 文字初稿已写 | [发送与停止（submit-action）](../../website/docs/plugins/submit-action.mdx) |
| 文字初稿已写 | [使用回复底部操作（response-footer）](../../website/docs/plugins/response-footer.mdx) |
| 文字初稿已写 | [使用开场建议（conversation-suggestions）](../../website/docs/plugins/conversation-suggestions.mdx) |
| 文字初稿已写 | [查看等待提示（thinking-indicator）](../../website/docs/plugins/thinking-indicator.mdx) |
| 文字初稿已写 | [查看工具进度（tool-timeline）](../../website/docs/plugins/tool-timeline.mdx) |
| 文字初稿已写 | [查看通用工具与审批（tool-fallback）](../../website/docs/plugins/tool-fallback.mdx) |
| 文字初稿已写 | [显示临时通知（transient-assistant-messages）](../../website/docs/plugins/transient-assistant-messages.mdx) |
| 文字初稿已写 | [查看 Agent 状态（agent-status-message）](../../website/docs/plugins/agent-status-message.mdx) |
| 文字初稿已写 | [查看执行计划（agent-plan-message）](../../website/docs/plugins/agent-plan-message.mdx) |
| 文字初稿已写 | [查看任务进度（job-progress-message）](../../website/docs/plugins/job-progress-message.mdx) |
| 文字初稿已写 | [获取生成文件（generated-file-message）](../../website/docs/plugins/generated-file-message.mdx) |
| 文字初稿已写 | [查看图表（chart-message）](../../website/docs/plugins/chart-message.mdx) |
| 文字初稿已写 | [查看引用来源（source-citations-message）](../../website/docs/plugins/source-citations-message.mdx) |
| 文字初稿已写 | [查看文档检索片段（retrieval-chunks）](../../website/docs/plugins/retrieval-chunks.mdx) |
| 文字初稿已写 | [查看网页搜索结果（web-search）](../../website/docs/plugins/web-search.mdx) |
| 文字初稿已写 | [查找与切换会话（conversation-thread-list）](../../website/docs/plugins/conversation-thread-list.mdx) |
| 文字初稿已写 | [新建会话（conversation-new）](../../website/docs/plugins/conversation-new.mdx) |
| 文字初稿已写 | [引用消息（conversation-quote）](../../website/docs/plugins/conversation-quote.mdx) |
| 文字初稿已写 | [显示 Agent 名称与头像（agent-identity）](../../website/docs/plugins/agent-identity.mdx) |
| 文字初稿已写 | [查看账号与登录操作（auth-account）](../../website/docs/plugins/auth-account.mdx) |
| 文字初稿已写 | [显示登录门禁（auth-gate）](../../website/docs/plugins/auth-gate.mdx) |
| 文字初稿已写 | [显示完整对话区（conversation-surface）](../../website/docs/plugins/conversation-surface.mdx) |
| 文字初稿已写 | [使用带提及标签的输入框（lexical-composer-input）](../../website/docs/plugins/lexical-composer-input.mdx) |
| 文字初稿已写 | [编辑带提及标签的消息（lexical-edit-composer）](../../website/docs/plugins/lexical-edit-composer.mdx) |
| 文字初稿已写 | [输入 @ 搜索对象（mention-trigger）](../../website/docs/plugins/mention-trigger.mdx) |
| 文字初稿已写 | [输入 / 使用命令（slash-command-trigger）](../../website/docs/plugins/slash-command-trigger.mdx) |
| 文字初稿已写 | [查看子任务（task-group）](../../website/docs/plugins/task-group.mdx) |
| 文字初稿已写 | [切换主题（theme-switch）](../../website/docs/plugins/theme-switch.mdx) |
| 文字初稿已写 | [查看上下文检索结果（context-retrieval-message）](../../website/docs/plugins/context-retrieval-message.mdx) |
| 文字初稿已写 | [切换界面语言（locale-switch）](../../website/docs/plugins/locale-switch.mdx) |
| 文字初稿已写 | [自定义 Plugin 定义参考](../../website/docs/plugins/plugin-contract.md) |
| 文字初稿已写 | [创建和注册自定义 UI Plugin](../../website/docs/plugins/create-plugin.md) |

### 应用接入与部署

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [应用接入与部署](../../website/docs/integration/index.md) |
| 文字初稿已写 | [在 React 工程中接入 Agent UI](../../website/docs/integration/react.md) |
| 文字初稿已写 | [Agent 参数与配置](../../website/docs/integration/agent-options.md) |
| 文字初稿已写 | [从业务页面控制 Agent](../../website/docs/integration/react-host-control.md) |
| 文字初稿已写 | [在 Vue 工程中接入](../../website/docs/integration/vue.md) |
| 文字初稿已写 | [在 HTML 和其他宿主中嵌入](../../website/docs/integration/web-component.md) |
| 文字初稿已写 | [连接 AG-UI 服务](../../website/docs/integration/connect-agent.md) |
| 文字初稿已写 | [请求认证与网络部署](../../website/docs/integration/authentication-and-network.md) |
| 文字初稿已写 | [接入历史会话服务](../../website/docs/integration/history-backend.md) |
| 文字初稿已写 | [独立构建与生产部署](../../website/docs/integration/production-build.md) |
| 文字初稿已写 | [依赖包与入口](../../website/docs/integration/package-entries.md) |
| 文字初稿已写 | [React Host API](../../website/docs/integration/react-host-api.md) |
| 文字初稿已写 | [对话接入与适配参数](../../website/docs/integration/runtime-api.md) |
| 文字初稿已写 | [Web Component API](../../website/docs/integration/web-component-api.md) |
| 文字初稿已写 | [前端消费的 AG-UI 与扩展契约](../../website/docs/integration/ag-ui-contracts.md) |
| 配置旧入口，未列入插件导航 | [配置历史服务地址](../../website/docs/integration/history-endpoint.mdx) |
| 配置旧入口，未列入插件导航 | [配置会话与恢复](../../website/docs/integration/conversation-binding.mdx) |
| 配置旧入口，未列入插件导航 | [设置界面语言](../../website/docs/integration/locale-configuration.mdx) |
| 文字初稿已写 | [接入前端工具与自定义工具 UI](../../website/docs/integration/frontend-tools.md) |
| 文字初稿已写 | [接入附件、语音与反馈适配器](../../website/docs/integration/attachments-dictation-feedback.md) |

### 定制与扩展

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [选择合适的定制层](../../website/docs/customization/index.md) |
| 文字初稿已写 | [布局、语义 Slot 与 Plugin 组合](../../website/docs/customization/layout-and-composition.md) |
| 文字初稿已写 | [使用公开 Props、children 与 renderer 定制](../../website/docs/customization/application-layer.md) |
| 文字初稿已写 | [定制品牌、样式与主题](../../website/docs/customization/themes.md) |
| 文字初稿已写 | [定制语言与文案](../../website/docs/customization/localization.md) |
| 文字初稿已写 | [自定义 @ 来源和应用 / 命令](../../website/docs/customization/mention-and-commands.md) |
| 文字初稿已写 | [消费共享状态与应用事件](../../website/docs/customization/state-and-events.md) |
| 文字初稿已写 | [自定义工具、数据消息与结构化结果](../../website/docs/customization/custom-renderers.md) |
| 文字初稿已写 | [可选 Generative UI 接入](../../website/docs/customization/generative-ui.md) |
| 文字初稿已写 | [把某个 Plugin 实现交给项目维护](../../website/docs/customization/source-takeover.md) |
| 文字初稿已写 | [验证定制与自定义 Plugin](../../website/docs/customization/test-customizations.md) |
| 文字初稿已写 | [AppUIModel 布局与组合参数](../../website/docs/customization/app-ui-model.md) |
| 文字初稿已写 | [可选输入、图表与测试能力](../../website/docs/customization/testing-and-optional-entries.md) |
| 配置旧入口，未列入插件导航 | [配置应用命令来源](../../website/docs/customization/command-source.mdx) |
| 配置旧入口，未列入插件导航 | [设置主题](../../website/docs/customization/default-theme.mdx) |

### 使用 Creator · Mock Agent

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [模拟联调](../../website/docs/guide/mock/index.md) |
| 文字初稿已写 | [选择内置演示场景](../../website/docs/guide/mock/builtin-scenarios.md) |
| 文字初稿已写 | [使用本地 JSONL 回放](../../website/docs/guide/mock/local-recordings.md) |
| 文字初稿已写 | [编写自己的 Mock 场景](../../website/docs/guide/mock/author-scenarios.md) |

### 版本与更新

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [使用更新中心](../../website/docs/updates/index.md) |
| 文字初稿已写 | [检查更新和阅读变化](../../website/docs/updates/check.md) |
| 文字初稿已写 | [确认并执行项目依赖升级](../../website/docs/updates/package-upgrade.md) |
| 文字初稿已写 | [同步已接管 Plugin 的实现](../../website/docs/updates/source-sync.md) |
| 文字初稿已写 | [处理升级失败与恢复](../../website/docs/updates/recovery.md) |
| 文字初稿已写 | [维护 Creator 与旧工程](../../website/docs/updates/creator-maintenance.md) |
| 文字初稿已写 | [更新记录](../../website/docs/updates/release-notes.md) |
| 文字初稿已写 | [兼容性与支持矩阵](../../website/docs/updates/compatibility.md) |
| 文字初稿已写 | [当前限制与可选能力](../../website/docs/updates/limitations.md) |


### 故障排查

| 状态 | 文章 |
| --- | --- |
| 文字初稿已写 | [问题定位入口](../../website/docs/troubleshooting/index.md) |
| 文字初稿已写 | [安装与启动问题](../../website/docs/troubleshooting/startup.md) |
| 文字初稿已写 | [Creator 入口不出现或连接失败](../../website/docs/troubleshooting/creator-connection.md) |
| 文字初稿已写 | [模型请求失败、任务停滞和取消](../../website/docs/troubleshooting/model-and-run.md) |
| 文字初稿已写 | [初始化失败、工程损坏和修改未生效](../../website/docs/troubleshooting/project-and-preview.md) |
| 文字初稿已写 | [Agent 不回复、历史或恢复失败](../../website/docs/troubleshooting/agent-and-history.md) |
| 文字初稿已写 | [Plugin、附件、语音或输入菜单不可用](../../website/docs/troubleshooting/plugins-and-input.md) |
| 文字初稿已写 | [更新、构建与部署失败](../../website/docs/troubleshooting/updates-and-build.md) |
| 文字初稿已写 | [查看诊断并定位问题](../../website/docs/troubleshooting/diagnostics.md) |


## 证据与检查

- 当前文字按项目源码、实际界面标签、公开参数和目录核对。版本历史为空时如实说明，不把工作区版本或 fixture 当作正式发行。
- 本轮未制作截图，未执行逐功能浏览器交互、真实 Agent、上传/识别服务或全平台安装验收。既有入门证据见 [验证记录](./getting-started-validation.md)。
- Windows 实际运行文档 typecheck、Rspress 静态构建、离线打包与 `docs:check` 均通过，文档资源测试 4/4。
- 原计划验收时核对 136 篇文章、391 处文内链接/既有图片引用、40 段 TS/JS 语法、5 段 JSON 和 5 行 JSONL，未发现缺失或语法错误；每篇均有截图需求。此检查不代表所有代码片段已在真实业务工程执行。
- 新增「插件开发」后，在 Windows 重新通过静态构建和离线打包校验，核对新文档 8 处本地链接及 2 段 TSX 语法，并确认导航与生成页面包含新章节。未将语法检查视为示例在业务工程中的运行验收。
- 补充开发能力后，再次通过 Windows 网站构建与离线校验；核对受影响页面 82 处本地链接、3 段代码语法，并对照源码确认 14 个 hooks 和 8 个合同类型。14 个能力章节已进入 HTML 与离线 Markdown，原文件结构指南仍保留。未新增综合插件示例或制作截图。
- 随后按用户反馈将开发入口简化为五个独立小例子，保留文件结构与其他能力速查。检查 23 处本地链接、6 段代码语法及引用锚点，重新通过 Windows 网站构建和离线校验；HTML 与离线 Markdown 均包含五个例子。完整字段仍留在定义参考中，未制作截图或宣称业务工程运行验收。
- 新增 Agent 配置文档前，离线包包含 138 篇 Markdown（137 篇正文加首页），共 149 个文档资源。已确认移除的内部 API 文章没有遗留在离线包中。
- 配置能力从插件导航移出后，核对 12 个实际 Agent 参数、111 处链接及 15 段代码语法，确认 39 个界面条目仍分为六个默认展开分类，配置旧地址仍可访问。同步修正 Host 联动示例，将配置传给生成项目的外层 Provider。网站及离线包校验通过；当前离线 Markdown 为 139 篇（138 篇正文加首页），共 150 个文档资源。
- 第一次打包因并行任务改变包元数据触发一致性保护，内容稳定后重新打包成功。
