# 开发文档

**需要自己编写业务联动、自定义组件或插件时，从这里开始。**&#x4F60;可以直接修改生成工程，也可以与 Creator 配合开发；应用的运行和部署不需要启动 Creator。

**接自己的接口，先看[业务服务接入总览](/development/service-integration.md)。** 本组按功能列出具体修改文件、默认请求／响应、非标准格式的适配位置和完整接线。语音转写服务与一号通登录标为开发中；当前登录由外部系统完成，再传入请求头和用户信息。

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

| 我想做什么                    | 从这里开始                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| 找到要修改的文件                 | [工程结构与修改入口](/development/project-structure.md)                                                        |
| 把助理放进已有页面                | [React](/development/react.md)、[Vue](/development/vue.md)、[HTML 与其他框架](/development/web-component.md) |
| 设置地址、主题、语言或打开已有会话        | [Agent 配置示例](/development/agent-options.md)、[完整属性表](/development/react-host-api.md)                   |
| 让业务按钮打开助理、发送消息、停止运行或新建会话 | [用业务页面控制 Agent](/development/react-host-control.md)、[会话方法](/development/react-host-api.md#会话方法)       |
| 指定助手发送、打开历史或控制后台 Thread  | [多助手与后台 Thread](/development/multiple-agents.md#从业务页面控制指定助手)                                          |
| 在回复期间排队发送后续问题            | [消息排队](/development/message-queue.md)                                                                 |
| 接收 Agent 通知、读取运行状态       | [状态与事件](/development/react-host-api.md#状态与事件)、[业务事件](/development/react-host-api.md#订阅-agent-业务事件)    |
| 手动修改已有插件的样式、文案、结构或业务逻辑   | [完整插件修改教程](/development/component-customization.md)                                                   |
| 选择主题、修改品牌色或组件样式          | [主题与样式](/development/theme-and-styling.md)                                                            |
| 切换语言、修改欢迎语或按钮文字          | [语言与文案](/development/localization.md)                                                                 |
| 查找可覆盖的文案键和默认翻译           | [文案字段参考](/development/locale-reference.md)                                                            |
| 改变区域大小、位置与插件顺序           | [布局与插件组合](/development/layout-and-composition.md)                                                     |
| 设置响应式抽屉、Stack 或 Sidebar  | [高级布局](/development/layout-and-composition.md#高级布局字段与示例)                                              |
| 修改悬浮入口、外框、展开收起与容器        | [自定义 Shell](/development/shell-customization.md)                                                      |
| 修改已有工具结果或图表的样式与展示结构      | [已有结果的渲染定制](/development/component-customization.md#已有结果的渲染定制)                                        |
| 将自定义 AG-UI 事件显示为消息卡片     | [自定义事件与消息渲染](/development/custom-ag-ui-events.md)                                                     |
| 接入上传、语音或评价接口             | [业务服务接入](/development/service-integration.md)                                                         |
| 接自己的历史、搜索候选或命令服务         | [服务接入总览](/development/service-integration.md)                                                         |
| 把当前页面数据给 Agent，或接收业务通知   | [业务上下文与通知](/development/business-context.md)                                                          |
| 让 Agent 调用页面已有方法         | [前端工具接入](/development/frontend-tools.md)                                                              |
| 新增一个可独立启停的界面功能           | [创建自定义插件](/development/create-plugin.md)、[插件接口](/development/plugin-api.md)                           |

## 常用 API

- [Agent API](/development/react-host-api.md)：属性、方法、Hooks、状态与事件。
- [Web Component API](/development/web-component-api.md)：配置、更新行为与事件。
- [插件 API](/development/plugin-api.md)：插件定义、组件、状态、操作与服务接口。

先使用项目组件入口中的公开属性、组合和渲染接口。需要维护官方组件内部实现时，再了解[源码接管](/development/source-takeover.md)及后续更新方式。
