# Agent UI Plugin Creator 启动计划

## 1. 项目目标

本项目是一个 **Agent 前端 UI Plugin Creator**。

用户通过和内部 Creator Agent 对话，完成：

* 创建 UI Plugin
* 修改 UI Plugin
* 调整前端布局
* 调整 Plugin 位置和组合
* 调整样式和交互
* 基于 AG-UI 数据构建 Agent 前端

最终 Build 出一个：

> 可独立运行、可部署、能够通过 API 连接一个主 Agent Runtime，并消费 AG-UI 协议的 Agent Frontend。

本项目不开发：

* Tool Plugin
* Skill Plugin
* Runtime Plugin
* Model Plugin
* Agent Backend
* 多 Page 应用系统

---

# 2. 核心架构

整体结构固定为：

```text
User
  │
  ▼
Creator Agent
  │
  │ 修改
  ▼
AppUIModel + UI Plugin Source
  │
  ▼
UI Plugin Runtime
  │
  ▼
Agent Frontend
  │
  │ API / AG-UI
  ▼
Main Agent Runtime
```

Creator Agent 是一个：

> 面向 UI Plugin 开发场景特化的通用 Coding Agent。

不要实现成固定工作流。

推荐：

```text
DeepAgents
+
Creator Prompt
+
UI Skills
+
UI Development Tools
```

---

# 3. 核心设计原则

后续实现始终遵守下面几条。

## 3.1 Creator 不直接操作 DOM

Creator 修改：

```text
AppUIModel
UI Plugin Source
```

UI Runtime 负责将这些内容确定性渲染出来。

---

## 3.2 Layout 与 Plugin 分离

布局属于：

```text
AppUIModel
```

业务 UI 属于：

```text
UI Plugin
```

例如：

```text
“右边区域改宽一点”
```

应优先修改 Layout。

而：

```text
“文件预览增加 Markdown 渲染”
```

应修改 UI Plugin。

---

## 3.3 UI Runtime 尽量稳定

Creator 默认允许修改：

```text
/project/app-ui
/project/plugins
```

Creator 默认不能修改：

```text
/framework
/runtime
```

Runtime 边界由 Sandbox / Tool 权限保证，不只依赖 Prompt。

---

## 3.4 一个应用只连接一个 Agent Runtime

结构：

```text
Agent Frontend
      │
      │ API
      ▼
Main Agent Runtime
```

不设计多 Agent Runtime 路由。

---

# 4. AppUIModel

整个前端组合关系只使用一个统一模型。

不要再分别维护互相重复的：

```text
layout.json
composition.json
slot-graph.json
plugin-graph.json
```

Runtime 统一读取：

```ts
interface AppUIModel {
  version: string

  root: LayoutNode

  pluginInstances: Record<string, PluginInstance>

  settings?: {
    theme?: string
  }
}
```

第一版可以持久化为：

```text
app-ui.json
```

---

# 5. LayoutNode

Layout 使用树模型。

第一版定义：

```ts
type LayoutNode =
  | RowNode
  | ColumnNode
  | StackNode
  | PanelNode
  | SlotNode
```

---

## Row

横向布局。

```ts
interface RowNode {
  type: "row"

  id: string

  children: LayoutNode[]

  gap?: number

  sizes?: Array<number | string>
}
```

例如：

```text
┌──────────────┬──────────────┐
│              │              │
│    Chat      │   Preview    │
│              │              │
└──────────────┴──────────────┘
```

---

## Column

纵向布局。

```ts
interface ColumnNode {
  type: "column"

  id: string

  children: LayoutNode[]

  gap?: number

  sizes?: Array<number | string>
}
```

---

## Stack

同一区域中的叠层 / Tabs / Overlay 容器。

第一版可以先只支持基础 Stack。

```ts
interface StackNode {
  type: "stack"

  id: string

  children: LayoutNode[]

  active?: string
}
```

---

## Panel

负责视觉容器和尺寸。

```ts
interface PanelNode {
  type: "panel"

  id: string

  child: LayoutNode

  width?: number | string
  height?: number | string

  minWidth?: number
  maxWidth?: number

  resizable?: boolean
}
```

---

## Slot

Plugin 的挂载位置。

```ts
interface SlotNode {
  type: "slot"

  id: string

  slotId: string

  pluginInstanceIds: string[]
}
```

Slot 本身不负责业务逻辑。

---

# 6. PluginInstance

Plugin 源码和 Plugin 实例必须分开。

例如：

```text
FilePreviewPlugin
```

是 Plugin Definition。

而：

```text
右侧文件预览
```

是 Plugin Instance。

定义：

```ts
interface PluginInstance {
  id: string

  pluginId: string

  enabled: boolean

  props?: Record<string, unknown>
}
```

例如：

```json
{
  "id": "file-preview-right",
  "pluginId": "file-preview",
  "enabled": true,
  "props": {
    "showHeader": true
  }
}
```

未来同一个 Plugin 可以创建多个实例。

---

# 7. UI Plugin Definition

每个 UI Plugin 使用固定目录：

```text
plugins/
└── file-preview/
    ├── manifest.json
    ├── index.tsx
    └── styles.css
```

Manifest：

```ts
interface UIPluginManifest {
  id: string

  name: string

  description: string

  version: string

  capabilities?: string[]

  data?: {
    messages?: boolean
    state?: boolean
  }
}
```

第一版不要让 Plugin Manifest 自己声明 Layout。

Plugin 放在哪里由 AppUIModel 决定。

---

# 8. UI Plugin Context

Plugin 通过统一 Context 获取运行数据。

第一版：

```ts
interface UIPluginContext {
  messages: AGUIMessage[]

  state: unknown

  instance: PluginInstance

  actions: UIPluginActions
}
```

Actions 第一版保持少量：

```ts
interface UIPluginActions {
  sendMessage(input: string): Promise<void>

  updateInstanceProps(
    props: Record<string, unknown>
  ): void
}
```

不要过早加入大量 Runtime API。

---

# 9. UI Runtime

UI Runtime 负责：

```text
读取 AppUIModel
      ↓
解析 Layout Tree
      ↓
找到 Slot
      ↓
解析 PluginInstance
      ↓
加载 Plugin Definition
      ↓
注入 UIPluginContext
      ↓
Render
```

Runtime 不负责：

```text
AI 判断需求
AI 生成 Plugin
AI 修改 Layout
```

这些属于 Creator Agent。

---

# 10. Plugin Registry

建立统一 Plugin Registry。

```ts
interface PluginRegistry {
  register(plugin: UIPluginDefinition): void

  get(pluginId: string): UIPluginDefinition | undefined

  list(): UIPluginDefinition[]
}
```

UI Runtime 只从 Registry 加载 Plugin。

不要直接根据文件路径动态 import 任意源码。

---

# 11. AG-UI 接入

Frontend 只连接一个主 Agent Runtime。

建议抽象：

```ts
interface AgentConnectionConfig {
  endpoint: string
}
```

数据流：

```text
Agent Backend
      │
     AG-UI
      │
      ▼
@ag-ui/client
      │
      ▼
messages / state
      │
      ▼
UI Plugin Runtime
      │
      ▼
UI Plugins
```

UI Plugin 优先消费：

```text
messages
state
```

而不是直接绑定大量底层 Event Hook。

---

# 12. Creator Agent

Creator Agent 第一版使用通用 Coding Agent Harness。

推荐以 DeepAgents 为底座。

不要实现：

```text
需求分类 Node
↓
Layout Node
↓
Plugin Node
↓
Build Node
```

Creator Runtime 应保持：

```text
User
 ↓
LLM
 ↓
Tool
 ↓
Observation
 ↓
LLM
 ↓
...
```

由模型自主决定下一步。

---

# 13. Creator Agent Prompt

System Prompt 只负责确定角色和边界。

核心内容：

```text
You are the Creator Agent for an Agent UI development platform.

You help users build and modify an Agent frontend through natural language.

You work with:

- AppUIModel
- UI layout
- UI Plugins
- Plugin instances
- frontend styles
- frontend interactions
- AG-UI messages/state

Prefer changing AppUIModel when the request is purely structural or layout-related.

Modify or create UI Plugin code when custom UI behavior is required.

You may inspect and modify the project inside the allowed project sandbox.

Do not modify the framework or UI runtime unless explicitly permitted.

Do not develop Agent Tools, Skills, Models, or Runtime Plugins.
```

不要把全部开发规则塞进 System Prompt。

---

# 14. Creator Skills

建立：

```text
skills/
├── app-ui-model/
├── ui-plugin-development/
├── ag-ui-frontend/
├── ui-layout/
└── ui-debugging/
```

---

## app-ui-model

说明：

```text
AppUIModel
LayoutNode
PluginInstance
Slot
```

以及什么时候应该只修改模型。

---

## ui-plugin-development

说明：

```text
Plugin Manifest
Plugin Context
Plugin 目录规范
Component 规范
Plugin 创建方式
```

---

## ag-ui-frontend

说明：

```text
messages
state
Tool Message
Assistant Message
User Message
Agent State
```

以及前端如何消费。

---

## ui-layout

说明：

```text
Row
Column
Stack
Panel
Slot
```

以及布局修改原则。

---

## ui-debugging

说明：

```text
TypeScript
Runtime Error
HMR
Build Error
Plugin Load Error
```

---

# 15. Creator Tools

第一版提供通用 Coding Agent 工具：

```text
read_file
edit_file
write_file
search_code
list_directory
run_command
```

再增加专项工具：

```text
inspect_app_ui_model
update_app_ui_model

list_ui_plugins
inspect_ui_plugin

inspect_runtime_errors

run_typecheck
run_build
```

Creator 可以自主选择工具。

不要在 Runtime 中强制调用顺序。

---

# 16. 项目目录

第一版建议：

```text
project/
│
├── app-ui/
│   └── app-ui.json
│
├── plugins/
│   ├── chat/
│   │   ├── manifest.json
│   │   ├── index.tsx
│   │   └── styles.css
│   │
│   └── ...
│
├── creator/
│   ├── prompt/
│   ├── skills/
│   └── tools/
│
├── runtime/
│
├── framework/
│
└── build/
```

权限：

```text
Creator 可写：

app-ui/*
plugins/*

Creator 可读：

runtime/*
framework/*

Creator 默认不可写：

runtime/*
framework/*
```

---

# 17. 第一阶段实施顺序

## Phase 1：定义核心类型

先实现：

```text
AppUIModel
LayoutNode
PluginInstance
UIPluginManifest
UIPluginContext
```

并加入 Schema 校验。

建议使用：

```text
TypeScript
+
Zod
```

验收：

能够从 JSON 读取并校验 AppUIModel。

---

# 18. Phase 2：实现 Layout Renderer

实现：

```text
Row
Column
Panel
Slot
```

Stack 可以稍后补。

输入：

```text
AppUIModel
```

输出真实 React Layout。

验收：

下面模型可以正确渲染：

```text
Row
├── Slot(chat)
└── Panel
    └── Slot(file-preview)
```

---

# 19. Phase 3：实现 Plugin Runtime

完成：

```text
Plugin Registry
Plugin Loading
PluginInstance
UIPluginContext
Slot Rendering
```

先手写两个 Plugin：

```text
Chat Plugin
File Preview Plugin
```

验收：

同一个 AppUIModel 能正确把两个 Plugin 渲染到不同 Slot。

---

# 20. Phase 4：接入 AG-UI

接入：

```text
@ag-ui/client
```

将：

```text
messages
state
```

注入 UIPluginContext。

验收：

Chat Plugin 能通过真实或 Mock AG-UI 数据展示 Agent 消息。

---

# 21. Phase 5：开发态 HMR

使用现有前端构建能力，例如 Vite。

完成：

```text
修改 Plugin
      ↓
保存
      ↓
HMR
      ↓
Preview 更新
```

验收：

修改 Plugin JSX 后不重新启动应用即可看到结果。

---

# 22. Phase 6：Creator Agent 基础版

接入 DeepAgents。

先给予：

```text
Filesystem
Search
Edit
Command
```

以及 Creator Prompt。

第一阶段只要求它能理解项目并修改：

```text
app-ui.json
```

例如用户说：

```text
“把右边区域改成 320px。”
```

Creator 能自行找到 AppUIModel 并修改。

---

# 23. Phase 7：Creator Skills

加入：

```text
app-ui-model
ui-layout
ui-plugin-development
ag-ui-frontend
ui-debugging
```

此时 Creator 开始正式理解项目规则。

验收：

用户说：

```text
“右边增加一个文件预览区域。”
```

Creator 能判断：

* 是否已有 Plugin
* 是否需要创建 PluginInstance
* 是否修改 Layout Tree
* 是否需要修改 Plugin Source

---

# 24. Phase 8：Creator 创建 UI Plugin

允许 Creator：

```text
创建 Plugin 目录
创建 manifest
创建 React Component
创建 style
修改 AppUIModel
```

验收需求：

```text
“增加一个工具调用详情面板。”
```

Creator 能：

```text
创建 UI Plugin
↓
读取 AG-UI messages
↓
创建 PluginInstance
↓
插入 Slot
↓
通过 TypeScript Check
↓
Preview 正常显示
```

---

# 25. Phase 9：错误修复闭环

Creator 能读取：

```text
TypeScript Error
Build Error
Runtime Error
Plugin Load Error
```

形成：

```text
修改
 ↓
运行
 ↓
错误
 ↓
Creator 继续修改
```

验收：

故意制造 Plugin TypeScript Error，Creator 可以自主修复。

---

# 26. Phase 10：Build

Build 固定：

```text
AppUIModel
Plugin Definitions
Plugin Instances
Frontend Assets
Agent Connection Config
```

输出：

```text
dist/
```

最终应用不依赖 Creator Agent。

生产结构：

```text
Browser
  │
  ▼
Agent Frontend
  │
  │ API / AG-UI
  ▼
Agent Backend
```

---

# 27. 第一版明确不做

不要实现：

```text
多 Page

多 Agent Runtime

Tool Plugin Creator

Skill Creator

Runtime Plugin Creator

Plugin Marketplace

生产环境动态安装 Plugin

复杂拖拽编辑器

Creator 自动视觉验收

远程 Plugin

多协议适配层
```

---

# 28. 第一版最终验收场景

用户打开 Creator：

```text
“现在界面只有聊天，
右边帮我增加一个工具调用详情面板。”
```

Creator 自主完成：

```text
读取当前 AppUIModel
↓
查看已有 Plugin
↓
发现不存在合适 Plugin
↓
读取 UI Plugin Skill
↓
创建 tool-detail Plugin
↓
消费 AG-UI messages
↓
修改 Layout Tree
↓
创建 PluginInstance
↓
运行 TypeScript Check
↓
Preview 更新
```

用户继续：

```text
“右边太宽了，缩小一点。”
```

Creator 只修改 AppUIModel。

用户继续：

```text
“参数默认收起来，失败时自动展开错误。”
```

Creator 修改 Plugin Source。

最终：

```text
Build
```

生成一个固定的 Agent Frontend。

---

# 29. 开发时必须始终遵守的核心原则

如果实现过程中出现设计选择，优先遵循：

```text
Creator Agent
负责理解和修改

AppUIModel
负责描述界面结构

UI Plugin
负责实现具体 UI 能力

UI Runtime
负责稳定、确定地渲染

AG-UI
负责连接 Agent 数据

Build
负责生成最终固定前端
```

最重要的一条：

> 不要把 Creator Agent 做成 Workflow，也不要让 Creator Agent 成为 UI Runtime 的一部分。

Creator 是开发者。

UI Runtime 是运行基础设施。

最终 Agent Frontend 不依赖 Creator。
