# 开发文档

**需要自己编写业务联动、自定义组件或插件时，从这里开始。**&#x4F60;可以直接修改生成工程，也可以与 Creator 配合开发；应用的运行和部署不需要启动 Creator。

本组按[要完成的开发任务](#开发任务索引)组织入口：接入应用、数据与服务接入、插件扩展、界面定制、应用控制与联动、API 与字段参考。了解某个官方插件的功能、数据格式和属性时，进入[插件文档](/plugins/index.md)。

如果只是调整文案、主题、布局或启停功能，先到[使用 Creator](/guide/index.md)描述需求即可，无需先阅读本章。复杂需求同样可以交给 Creator 分析和实现。

## 第一次手动开发

1. 先按[开始使用](/start/index.md)初始化工程，再按 [React](/development/react.md)、[Vue](/development/vue.md) 或 [HTML](/development/web-component.md) 挂载。看到输入框、按钮和样式后，再接业务接口。
2. 按[连接 AG-UI 服务](/development/connect-agent.md)完成一次发送、流式回复和停止；还没有后端时，先用 [Mock](/mock/index.md)验证界面。
3. 按需接入历史、上传等[业务服务](/development/service-integration.md)，或从[手动修改插件](/development/component-customization.md)开始定制。各篇是可选任务，不需要全部实现。

教程默认 Agent UI 源码在 `src/agent-ui/`，业务挂载页为 `src/AssistantPage.tsx`。初始化选择其他目录时，替换对应路径。标为“局部片段”的代码只合入现有文件；标为“完整文件”的代码才适合在无定制的新工程中直接替换。

## 常用名称

| 名称         | 在页面中指什么                                   |
| ---------- | ----------------------------------------- |
| 助手（Agent）  | 一个可独立对话的助手；多个助手用不同 `agentId` 区分。          |
| 会话（Thread） | 一段聊天记录，用 `threadId` 标识；切换工作流或收起面板仍可使用原会话。 |
| 运行（Run）    | 一次请求及其输出；同一会话可以先后进行多次运行。                  |
| 插件（Plugin） | 输入框、操作按钮、消息卡片或前端服务。启用插件不等于后端已提供相应数据。      |
| 外壳（Shell）  | 助手最外层的容器，负责悬浮入口、尺寸和展开收起。                  |

## 开发任务索引

### 接入应用

找到工程入口，把 Agent UI 挂载到业务页面，再连接 AG-UI 服务完成一次对话。

| 我想做什么               | 从这里开始                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| 找到要修改的文件            | [工程结构与修改入口](/development/project-structure.md)                                                        |
| 把助手放进已有页面           | [React](/development/react.md)、[Vue](/development/vue.md)、[HTML 与其他框架](/development/web-component.md) |
| 配置对话地址，验证发送、流式回复与停止 | [连接 AG-UI 服务](/development/connect-agent.md)                                                          |
| 设置地址、主题、语言或打开已有会话   | [Agent 配置示例](/development/agent-options.md)                                                           |

### 数据与服务接入

接自己的接口时，先看[业务服务接入总览](/development/service-integration.md)，再按具体服务修改请求、响应映射或项目数据源。

| 我想做什么              | 从这里开始                                         |
| ------------------ | --------------------------------------------- |
| 加载、管理和恢复历史会话       | [历史会话服务](/development/history-backend.md)     |
| 在同一会话中显示不同专家的名称与头像 | [消息发言者与专家切换](/development/message-speaker.md) |
| 上传附件，接入预览与下载       | [附件上传服务](/development/attachment-upload.md)   |
| 接自己的语音转写接口         | [语音转写服务（开发中）](/development/speech-to-text.md) |
| 保存用户对回复的评价         | [回复评价服务](/development/feedback-service.md)    |
| 接入登录凭据与用户信息        | [一号通登录（开发中）](/development/auth-service.md)    |
| 接自己的搜索候选或快捷命令服务    | [提及搜索与快捷命令](/development/composer-sources.md) |

语音转写服务与一号通登录标为开发中；当前登录由外部系统完成，再传入请求头和用户信息。

### 插件扩展

增加新的界面能力，连接插件数据与操作，或维护已接管的插件实现。

| 我想做什么                      | 从这里开始                                             |
| -------------------------- | ------------------------------------------------- |
| 新增一个可独立启停的界面功能             | [创建自定义插件](/development/create-plugin.md)          |
| 从插件取数、共享业务选择或调用其他插件        | [插件联动与取数](/development/plugin-interaction.md)     |
| 处理自定义 AG-UI 事件，或将事件显示为消息卡片 | [自定义事件与消息渲染](/development/custom-ag-ui-events.md) |
| 接管官方组件的实现并维护后续更新           | [源码接管与更新参考](/development/source-takeover.md)      |
| 按使用的插件引入组件与样式              | [插件按需打包](/development/plugin-bundling.md)         |

### 界面定制

调整现有界面的布局、容器、组件展示、主题与文案。先使用项目组件入口中的公开属性、组合和渲染接口。

| 我想做什么                   | 从这里开始                                                          |
| ----------------------- | -------------------------------------------------------------- |
| 改变区域大小、位置与插件顺序          | [布局与插件组合](/development/layout-and-composition.md)              |
| 设置响应式抽屉、Stack 或 Sidebar | [高级布局](/development/layout-and-composition.md#高级布局字段与示例)       |
| 修改悬浮入口、外框、展开收起与容器       | [自定义 Shell](/development/shell-customization.md)               |
| 修改已有组件的样式、文案、结构或业务逻辑    | [手动修改插件](/development/component-customization.md)              |
| 修改已有工具结果或图表的样式与展示结构     | [已有结果的渲染定制](/development/component-customization.md#已有结果的渲染定制) |
| 选择主题、修改品牌色或组件样式         | [主题与样式](/development/theme-and-styling.md)                     |
| 切换语言、修改欢迎语或按钮文字         | [语言与文案](/development/localization.md)                          |

### 应用控制与联动

让业务页面控制助手行为，组合多个助手或工作流，并传递业务数据、连接页面操作。

| 我想做什么                    | 从这里开始                                                      |
| ------------------------ | ---------------------------------------------------------- |
| 让业务按钮打开助手、发送消息、停止运行或新建会话 | [用业务页面控制 Agent](/development/react-host-control.md)        |
| 组合多个助手，或在同一助手中切换工作流      | [多 Agent 与工作流入口](/development/multiple-agents.md)          |
| 指定助手发送、打开历史或控制后台 Thread  | [控制指定助手与后台任务](/development/multiple-agents.md#控制指定助手与后台任务) |
| 给 Agent 传业务参数            | [给 Agent 传递业务参数](/development/business-context.md)         |
| 让 Agent 调用页面已有方法         | [前端工具接入](/development/frontend-tools.md)                   |

### API 与字段参考 \{#常用-api}

查找具体属性、方法、事件、公共插件接口或可覆盖的文案字段。

| 我想查什么                    | 从这里开始                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent 属性、方法、Hooks、状态与事件  | [Agent API](/development/react-host-api.md)                                                                                                      |
| 会话操作、运行状态与业务事件           | [会话方法](/development/react-host-api.md#会话方法)、[状态与事件](/development/react-host-api.md#状态与事件)、[业务事件订阅](/development/react-host-api.md#订阅-agent-业务事件) |
| Web Component 配置、更新行为与事件 | [Web Component API](/development/web-component-api.md)                                                                                           |
| 插件定义、组件、状态、操作与服务接口       | [公共插件 API](/development/plugin-api.md)                                                                                                           |
| 可覆盖的文案键和默认翻译             | [文案字段参考](/development/locale-reference.md)                                                                                                       |
