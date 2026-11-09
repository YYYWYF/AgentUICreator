# 什么是 Agent UI

**Agent UI 是一套用插件搭建 Agent 前端的方案。** 你可以把会话列表、消息输入、工具记录、图表等能力组合起来，做成自己产品中的 AI 助理，再用 Creator 通过自然语言调整界面。

最终得到的是**你工程里的前端代码和组件**：放进业务页面，连接自己的 Agent 服务，随产品一起构建、部署和运行。

## 插件就在界面里

把一个助理界面拆开看，很多区域都由插件提供。大的插件还可以组合小的插件，例如会话界面中有输入框，输入框里又有附件、发送等按钮。

<div className="agent-ui-overview-diagram">

![插件位置示意：业务页面中放入 Agent UI；左侧是会话列表，右侧的会话界面组合工具记录、图表、回复操作栏和输入框，发送按钮又位于输入框内部。](/images/overview/plugin-map.svg)

</div>

上图是组合关系示意，图表等能力可按需启用。实际界面也可以是右下角展开的悬浮助手，或嵌在页面侧栏中的助理。**整体容器、悬浮入口和展开收起由项目外壳负责，里面的功能由插件组合。**

| 界面中的部分  | 对应插件示例                                                               | 作用                  |
| ------- | -------------------------------------------------------------------- | ------------------- |
| 左侧历史列表  | [会话列表](/plugins/conversation-thread-list.md)                         | 查找、切换和管理会话          |
| 对话主体    | [会话界面](/plugins/conversation-surface.md)                             | 承载消息和会话交互，组合其他插件    |
| 底部输入区   | [消息输入](/plugins/composer.md)、[发送与停止](/plugins/submit-action.md)      | 编辑消息、发送请求、停止回复      |
| 回复中的内容  | [工具调用分组](/plugins/tool-group.md)、[图表展示](/plugins/chart-message.md)   | 展示 Agent 返回的执行过程和结果 |
| 回复下方的操作 | [回复操作栏](/plugins/response-footer.md)、[回复复制](/plugins/copy-action.md) | 在一轮回复结束后提供复制等操作     |

还有一些插件在背后提供会话、主题、语言等共享服务，不直接占据一块界面。完整能力见[插件功能概览](/plugins/index.md)。

## 插件怎么协作

你可以把它理解为：**布局决定放在哪里，插件负责具体功能，Runtime 把它们组织起来。** Runtime 是随前端一起运行的基础能力，负责插件的启停、插槽组合，以及共享会话状态和服务的接入。

<div className="agent-ui-overview-diagram">

![协作示意：app-ui.json 定义布局与插件组合，项目插件入口配置组件表现；两者交给同一个前端 Runtime，由它组织会话列表、输入框和图表等插件，并让插件使用共享会话状态与服务。](/images/overview/plugin-composition.svg)

</div>

**插槽（Slot）就是为某类内容预留的位置**，比如输入区、回复下方的操作区。布局和插件可以提供插槽，Runtime 按组合配置把选中的插件放进去；调整顺序、替换或停用插件，就能改变界面组合。

插件通过共享的会话状态和服务协作。例如，切换会话后，对话区显示当前会话；发送消息后，输入区显示运行状态，消息区持续更新回复。它们共用同一套会话和 Agent 连接。

以默认源码位置 `src/agent-ui/` 为例，几个主要修改入口是：

```text
src/agent-ui/
├── app-ui.json          ← 布局、插件位置、顺序和启停（AppUIModel）
├── plugins/             ← 每个插件在当前工程中的定制入口
│   └── composer/
│       └── index.tsx    ← 例如调整输入框的属性、样式和组件组合
└── application/shell/   ← 工作台、悬浮面板或嵌入式容器的外壳
```

官方插件默认从 npm 包引入实现，你的工程保留自己的定制入口。**改布局看 `app-ui.json`，改组件表现看 `plugins/`，改整体容器看 `application/shell/`。** 这些修改可以交给 Creator，也可以自己编辑代码。具体组件属性和渲染逻辑写在项目代码中，详细说明见[工程结构与修改入口](/development/project-structure.md)。

## 从搭建到运行

**开发时，用 Creator 创建和修改界面；上线后，由前端应用直接连接业务 Agent 服务。** Creator 的工作是改工程代码，生成的 Runtime 和插件随应用一起发布。

<div className="agent-ui-overview-diagram">

![从开发到运行：开发者向 Creator 描述需求，Creator 修改前端工程，工程通过自己的构建流程部署。运行时，用户操作 Agent UI，前端内的 Runtime 和插件通过 AG-UI 与一个业务 Agent 服务通信；Creator 只参与开发。](/images/overview/development-to-runtime.svg)

</div>

一次对话可以这样理解：

1. 用户在输入框输入问题，点击发送。
2. 前端 Runtime 向配置好的业务 Agent 接口提交请求。
3. Agent 服务通过 **AG-UI** 持续返回回复、工具执行情况、状态或结果数据。AG-UI 是前后端交流这些信息的协议。
4. Runtime 更新会话，相关插件把数据呈现为文字、工具记录、图表等内容，并响应用户后续操作。

图表、进度等插件需要服务返回相应的数据；启用插件后，再按[插件显示条件与 AG-UI 数据](/plugins/ag-ui-data.md)接入。开发时还没有业务服务，可以先用 [Mock 服务](/mock/index.md)体验预设场景。

## 最后，你会得到什么

你会得到一个**可定制、可独立部署的 Agent 前端**。在 React 工程里，它以 `Agent` 组件接入业务页面；Vue 或 HTML 页面可通过 Web Component 嵌入。它可以是完整工作台、悬浮助手，也可以是页面中的一个助理区域。

![悬浮球式助理：从业务页面右下角展开对话面板。](/images/agent-ui/layout-assistant-hd.png)

工程使用自己的开发、检查和构建命令。部署后，用户打开产品页面即可使用助理，运行所需的 Runtime、插件和样式已随前端交付，**无需启动 Creator**。业务 Agent 服务负责处理请求和返回结果，Agent UI 负责前端呈现与交互。

接下来，按[开始使用](/start/index.md)创建第一个 Agent UI。
