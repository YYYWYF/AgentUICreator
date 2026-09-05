# Agent UI Plugin Creator 最终设计与启动计划

> 文档状态：Canonical。本文合并原始启动设计、当前代码实现、DeepSeek Harness Creator/Cordis 机制评估，以及 Creator 控制面复核结论。若专题实施细节与本文冲突，以本文和仓库根目录 `AGENTS.md` 为准。
>
> 配套实施文档：[Creator 开发控制面实施计划](./creator-control-plane-implementation-plan.md)

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

## 3.5 Creator 是开发控制面，不是生产运行时

Creator 负责：

```text
观察目标项目
理解用户意图
修改 AppUIModel 与 UI Plugin 源码
验证修改
反馈证据
```

Creator 不进入生成应用的生产依赖。项目观察、语义化修改、撤销、澄清、诊断收集和完成门禁都属于开发控制面；确定性渲染、AG-UI Client、Plugin Runtime 和 Plugin 实现属于生成项目。

不要为了提升 Creator 的开发体验，把动态 Package Runner、任意运行时源码加载器或 Creator 私有协议带入最终应用。

---

## 3.6 Inspect first，按需渐进展开

每次 Creator run 开始时，Harness 注入一个有大小上限的项目摘要，至少包含：

```text
AppUIModel hash 与本次 mutation revision
Layout Tree / Slot 摘要
PluginInstance、enabled 状态与挂载位置
生产 Registry 选择结果
未选择的 Plugin 资产与开发期 Catalog
目标项目 UI 技术栈与版本
最近一次验证和运行时诊断是否仍匹配当前 revision
```

摘要只负责导航，不代替真实项目文件。Creator 需要精确信息时，通过 `inspect_app_ui_model`、`inspect_ui_plugin`、`inspect_runtime_errors` 等工具渐进查询，不把整个项目或全部插件源码重复注入上下文。

这借鉴 DeepSeek Harness 的 progressive Inspect，但项目文件、AppUIModel、Plugin Contract 和目标项目依赖仍是本项目的事实源。

---

## 3.7 AppUIModel 使用语义化事务修改

Plugin 源码继续由通用 Coding Agent 在权限范围内编辑；AppUIModel 的组合关系优先通过领域操作修改，不再主要依赖模型对 JSON 做字符串级编辑。

一次语义操作必须：

1. 由 Creator Host 校验当前 run 中已观察到的 `appUIModelHash`，并持有当前项目的事务锁；
2. 在内存中应用一个或一组组合操作；
3. 完整解析 AppUIModel 并检查跨字段关系；
4. 重新计算由 AppUIModel 派生的生产 Registry；
5. 在落盘前生成 AppUIModel 与 Registry 的结构化 diff；
6. 以临时文件和原子 rename 写入，任何一步失败都恢复修改前内容；
7. 成功后递增当前 run 的 mutation revision，并返回新的 hash。

`mutationRevision` 是完成门禁在一个 run 内使用的证据序号；`appUIModelHash` 是 AppUIModel 文件精确字节内容的 hash，用作跨 run 和外部编辑的乐观并发令牌，也供验证与运行时诊断关联同一模型版本。Plugin 等其他文件分别使用自己的 observed content hash。revision 与 hash 不能互相替代。

---

## 3.8 移除、停用与删除源码必须分开

用户意图按以下语义解释：

| 用户意图 | AppUIModel | Registry | Plugin 源码 |
| --- | --- | --- | --- |
| 暂时隐藏、先不要显示 | 删除 `mount` 并设为 `enabled: false` | 保留 | 保留 |
| 移除这个功能 | 删除 `mount` 和 `pluginInstances` 条目 | 最后一个实例移除后自动退出 | 保留 |
| 替换这个功能 | 新实例就位后移除旧实例 | 根据最终实例集合自动更新 | 新旧源码都保留 |
| 连插件代码一起删除 | 先检查引用，再执行受限删除 | 自动更新 | 仅在用户已明确授权时删除 |

默认的“移除”绝不等于删除源码。删除源码只能通过受限领域工具执行，不能开放任意文件删除；若当前请求没有明确授权，Creator 必须先使用同一 run 内的澄清工具。

---

## 3.9 观察后写入与安全撤销

对通用文件编辑启用 read-before-edit 与内容 hash 检查：已有文件未被当前 run 观察时不得覆盖；文件在读取后被外部修改时，写入以 stale-version 冲突失败并要求重新读取。

每次有修改的 run 保存受控范围内的 before 内容、after hash 和验证 revision。撤销时只有所有目标文件仍等于记录的 after hash，才允许整体恢复；任一文件之后被用户或其他任务修改，撤销必须整体拒绝并报告冲突。

不得使用 `git checkout -- app-ui plugins`、`git reset` 或 stash 作为 Creator 撤销实现，因为它们会覆盖不属于当前 run 的用户改动。

---

## 3.10 完成证据必须与当前 revision 一致

项目快照、验证结果、运行时诊断和最终回执都必须携带其对应的 mutation revision 与 AppUIModel hash。旧 revision 的成功结果只能展示为历史信息，不能作为当前修改已完成的证据。

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
  version: "2"

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

本阶段 `SlotNode` 只表示 Layout Tree 中存在一个可渲染位置。它不保存 Plugin instance id，也不保存运行时 contribution。

```ts
interface SlotNode {
  type: "slot"

  id: string

  slotId: string
}
```

运行时由独立 `SlotRegistry` 保存 `SlotContribution`。贡献的注册和清理必须进入现有 `PluginServiceRuntime` activation / cleanup 生命周期。Plugin Manifest 可以静态声明 child Slot；child Slot 随 Owner contribution 出现和消失，但此阶段仍不实现 `renderSlot()`、slot kind、slot scope 或动态 `ctx.slots.declare()`。

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

  mount?: {
    slotId: string
    order?: number
  }

  props?: Record<string, unknown>
}
```

例如：

```json
{
  "id": "file-preview-right",
  "pluginId": "file-preview",
  "enabled": true,
  "mount": {
    "slotId": "file-preview"
  },
  "props": {
    "showHeader": true
  }
}
```

未来同一个 Plugin 可以创建多个实例。

`mount.slotId` 可以指向 Layout Slot，也可以指向从 Layout Slot 出发、经 reachable Owner Plugin 声明的 child Slot。跨 Manifest 的组合合法性由独立 validator 使用纯 `PluginSlotCatalog` 做 fixed-point reachability 计算，不由 AppUIModel shape parser 依赖 Runtime Registry。`enabled` 不影响结构合法性；无 Layout root 路径的孤儿 mount、rootless cycle、重复 child owner，以及 Layout/child Slot 重名都必须拒绝。

---

# 7. UI Plugin Definition

每个 UI Plugin 使用固定目录：

```text
plugins/
└── file-preview/
    ├── manifest.json
    ├── definition.ts
    ├── index.tsx
    └── styles.css
```

`styles.css` 是可选文件。`manifest.json` 与 `definition.ts` 是可进入生产 Registry 的 Plugin 资产最小入口。`definition.ts` 必须提供默认导出的 `UIPluginDefinition`，可以同时保留有意义的 named export：

```ts
export const filePreviewPlugin: UIPluginDefinition = {
  manifest,
  Component: FilePreviewPlugin,
}

export default filePreviewPlugin
```

默认导出是 Registry 生成契约，不要求不同 Plugin 共享 Creator 的 UI 依赖或具体 UI Library。

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

基础 Runtime Contract：

```ts
interface UIPluginContext<TState = unknown> {
  conversation: AgentConversation

  messages: AgentMessage[]

  state: TState

  run: AgentRunState

  instance: PluginInstance

  actions: UIPluginActions

}
```

Actions 第一版保持少量：

```ts
interface UIPluginActions {
  sendMessage(input: string | AgentUserInput): Promise<void>

  startNewConversation(): Promise<void>

  abortRun(): void

  updateInstanceProps(
    props: Record<string, unknown>
  ): void
}
```

`conversation`、`messages`、`state` 与 `run` 由 Agent Runtime 提供稳定、协议无关的前端状态。AG-UI 的 `threadId`、`runId` 和 Event 类型只允许存在于 `@agent-ui/runtime-agui`；Plugin 不直接订阅底层 Run Event。

不要过早加入大量 Runtime API。

## 8.1 Plugin Services

当 UI Plugin 之间存在真实逻辑依赖时，使用具名 Plugin Service，而不是把业务专用函数继续扩进 `UIPluginContext.actions`。

沿用 DeepSeek Harness 的 Service seam / concrete provider 分层：稳定的 Service name、类型与行为合同属于能力所有者，放在具体 Provider Plugin 目录之外；具体 Plugin 只负责在生命周期内提供实现。Consumer 只导入稳定 seam 并声明 `inject`，不得导入 Provider 源码。对于生成项目内由多个 Plugin 共享的第一方能力，可使用独立的 `services/*` 目录；这不代表把该能力提升为 UI Runtime 核心 API。

```text
services/conversations.ts            # stable service seam
plugins/antd-x-conversations/        # concrete provider
plugins/antd-x-message-list/         # optional consumer
plugins/antd-x-run-timeline/         # optional consumer
```

```ts
interface UIPluginDefinition {
  manifest: UIPluginManifest
  inject?: readonly string[]
  setup?: (context: UIPluginSetupContext) => void | (() => void)
  Component: ComponentType<UIPluginComponentProps>
}
```

提供方在实例生命周期的 `setup` 中注册函数或对象：

```ts
setup({ services }) {
  services.provide("agent-ui.theme", {
    setMode(mode) {},
    toggle() {}
  })
}
```

消费方通过 `inject` 声明硬依赖，并在组件内读取：

```ts
inject: ["agent-ui.theme"]

const theme = context.services.get("agent-ui.theme")
theme?.toggle()
```

如果能力只是增强而不是运行前提，省略 `inject`，只在使用处探测：

```ts
const conversations = context.services.get("agent-ui.conversations")
const messages = conversations
  ? context.messages.filter(conversations.includesMessage)
  : context.messages
```

约束：

- `manifest.capabilities` 仍是描述性元数据，不承担运行时函数调用。
- 硬依赖未满足时，Plugin Instance 保持 pending；可选能力只在使用处调用 `services.get()` 探测。
- 服务名在一个 Agent Frontend 内是具名命名空间；重复提供必须确定性失败。
- 服务归提供它的 Plugin Instance 所有；实例禁用、替换或移除时，服务和 setup disposer 一起清理。
- 服务消失时，硬依赖消费者必须失效；服务恢复后以新的激活身份重新挂载，不能继续持有已卸载提供者。
- 依赖解析不得依赖 AppUIModel 对象顺序或 Layout 中的视觉顺序。
- 服务用于直接调用共享能力；广播事件如未来需要，应建立独立事件机制，不混入 Service Contract。
- Consumer 与 Provider 通过同一个稳定 Service name 关联，不通过具体 Plugin id 或源码路径关联。
- 独立 seam 可以进入 Consumer Bundle，但不得反向导入具体 Provider；未选择 Provider 时，其组件、样式和实现源码不应因 Consumer 的 import graph 被带入产物。

`startNewConversation()` 属于 Agent Runtime 的通用会话动作，不属于历史会话 Plugin Service。HTTP Runtime 必须切换到新的 AG-UI `threadId` 并清空消息/状态上下文；按钮 Plugin 只调用该 Action，不得自行创建或持有 Agent Client。

这个机制借鉴 DeepSeek Harness / Cordis 的 `provide`、`inject`、`get` 与 fiber-owned lifecycle 语义，但只实现适合当前确定性 React UI Plugin Runtime 的最小子集，不引入 Cordis 依赖。

---

# 9. UI Runtime

UI Runtime 负责：

```text
读取 AppUIModel
      ↓
解析 Layout Tree
      ↓
PluginServiceRuntime 激活 enabled 且有 mount 的实例，或 headless 实例
      ↓
在同一 activation 生命周期注册 SlotContribution
      ↓
Layout SlotNode 按 slotId 查询 SlotRegistry
      ↓
按 order、instanceId 稳定排序并解析 PluginInstance / Plugin Definition
      ↓
注入 UIPluginContext 并 Render
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

生成项目的生产 Registry 必须显式导入当前选择的 Plugin definitions，不得为了方便而展开包含全部模板的 catalog/barrel。Catalog 可以用于开发期发现与预览，但不能成为生产 import graph 的根；否则从 AppUIModel 移除实例并不能让未选择 Plugin 的组件、样式和实现离开 Bundle。

## 10.1 Registry 是 AppUIModel 的确定性派生物

生产 Registry 不再由 Creator 手工维护 import 与数组条目，而由目标项目自己的生成器根据以下输入生成：

```text
AppUIModel.pluginInstances 中出现的 pluginId
        +
plugins/*/manifest.json
        +
对应目录 definition.ts 的默认导出契约
        ↓
plugins/registry.generated.ts
```

`plugins/index.ts` 只稳定地转出生成结果，应用代码仍从统一入口获取 `pluginDefinitions`。

选择规则：

- 只要 PluginInstance 仍存在，其 `pluginId` 就进入生产 Registry；`enabled` 或是否挂载不影响选择。
- 因此暂时隐藏的实例保留 definition，headless Plugin 也通过其 PluginInstance 被选择。
- 当某个 `pluginId` 的最后一个实例被移除时，它才退出生产 Registry 和生产 Bundle。
- 未被选择的 Plugin 源码目录是合法开发资产，不是孤儿错误，也不进入生产 import graph。
- 开发期 Catalog 只用于发现、预览和复制模板，不得被生成 Registry 引用。
- Catalog 与 `_shared` 等非 Plugin 目录必须由目标项目配置显式声明，扫描器不得靠目录命名规则猜测或静默忽略未知目录。

生成器必须：

- 对 Plugin id 去重并输出稳定顺序；
- 检查重复 manifest id、缺少 manifest、缺少 definition、无默认导出及引用不存在；
- 输出带“generated, do not edit”说明的显式静态 import；
- 位于目标项目中，并可在没有 Creator package 和 Workbench 时独立运行；
- 提供纯计算入口，使验证器可以在内存中计算期望内容。

生成是显式修改动作，不是验证动作。Creator 的 AppUIModel 事务在同一次受控提交中同步生成 Registry；人工直接修改 AppUIModel 后可运行目标项目自己的 `generate:registry`。`registry.generated.ts` 是需要提交的目标项目源码，使干净 checkout 无需先运行 Creator 或 codegen 就能构建。`verify:ui` 只比较磁盘内容与内存期望结果并报告 stale Registry，绝不能在验证期间写文件；`typecheck` 和 `build` 也不得隐式改写 Registry。

这仍然满足生产 Registry 的静态 import 约束；它消除的是模型重复 bookkeeping，不是把加载链改成运行时动态发现。

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
messages / state / run state
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
run state
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

这里借鉴 DeepSeek Harness Creator/Cordis 的是“通用 Agent + 可观察控制面”，不是动态 Package 生命周期本身：

- 先读取紧凑目录，再精确 Inspect；
- 先观察文件版本，再修改；
- 把停用、运行、更新和永久删除表达为不同操作；
- 仅在检查项目仍无法消除的用户侧歧义上提问；
- 将运行时失败作为下一步可读诊断返回给 Agent。

不要把这些能力串成不可跳过的 Workflow。Creator 仍然根据用户请求和项目状态自主决定需要哪些工具。

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

Inspect the compact project snapshot first. Query exact model, Plugin, or
runtime details only when needed. Resolve discoverable facts from the project;
ask at most one concise question only for user-owned ambiguity that inspection
cannot answer.

Modify or create UI Plugin code when custom UI behavior is required.

Treat hiding, removing an instance, replacing a feature, and deleting Plugin
source as different operations. Never delete Plugin source for an ordinary
remove request.

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
Plugin definition 默认导出约定
停用 / 移除实例 / 删除源码语义
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

保留通用 Coding Agent 工具：

```text
read_file
edit_file
write_file
search_code
list_directory
run_command
```

增加只读观察工具：

```text
inspect_ui_project
inspect_app_ui_model
list_ui_plugins
inspect_ui_plugin
inspect_runtime_errors
run_typecheck
run_build
```

`inspect_ui_project` 返回有大小上限的项目摘要；其余工具按需返回精确信息。最近验证结果和运行时错误必须明确标记是否匹配当前 revision。

增加 AppUIModel 语义修改操作：

```text
add_instance
update_instance_props
set_instance_enabled
mount_instance
unmount_instance
move_instance
replace_instance
remove_instance

insert_layout_node
update_layout_node_props
move_layout_node
replace_layout_node
remove_layout_node
```

模型侧优先只暴露一个 `mutate_app_ui_model` 工具，上述名称作为其 discriminated operation types，避免让固定 Tool Catalog 膨胀。工具要求 `operations[]`；Creator Host 使用当前 run 中最近一次仍有效的权威观察 hash 作为 CAS token。模型可暂时提供 optional `appUIModelHash` 兼容旧轨迹，但它只能与 Host observation 做一致性校验，不能成为 mutation authority。需要多步共同满足不变量时，在一个调用中原子提交一组操作。不要提供接受任意完整 JSON 的 `update_layout` 作为语义工具替代品。

增加受控恢复和交互工具：

```text
undo_creator_run
ask_creator_user
delete_ui_plugin_source
```

- `undo_creator_run` 只能撤销由 after hash 证明未被后续修改的完整 run。
- `ask_creator_user` 在当前 Agent loop 内等待答案并继续，不把澄清伪装成最终答复；普通请求最多问一个简短问题。
- `delete_ui_plugin_source` 只允许删除 `plugins/<plugin-id>/`，先验证已无 AppUIModel 引用和跨 Plugin 源码引用，并要求当前用户请求已有明确授权或有效的澄清确认。

生产 Registry 由 AppUIModel 事务自动生成，因此不再向模型暴露 `register_plugin` / `unregister_plugin` bookkeeping 工具。

专项工具通过目标项目自带的 Project Control Adapter 使用目标项目自己的 Schema、Registry generator 和验证逻辑。Creator package 负责模型工具、权限、事务编排与回执，不在自身复制一份 AppUIModel 或 Plugin Contract；目标项目也不反向依赖 Creator。Adapter 使用固定入口和结构化 JSON 输入输出，不能退化成可由模型传入任意 shell 命令的执行器。

Creator 可以自主选择工具。

不要在 Runtime 中强制调用顺序。

---

# 16. 项目目录

第一版采用 pnpm workspace，把可发布的 Creator、独立目标前端和开发组合壳分开：

```text
workspace/
├── packages/
│   └── creator/                 # 可发布的开发工具
│       ├── src/                 # Agent、CLI、Vite 适配、Creator UI
│       ├── skills/
│       └── package.json
├── examples/
│   └── agent-frontend/          # 可独立构建、部署的目标应用
│       ├── app-ui/
│       ├── plugins/
│       ├── runtime/
│       ├── framework/
│       └── package.json
└── apps/
    └── creator-workbench/       # 仅开发时组合 Creator 与目标应用
```

Creator 通过显式 `projectRoot` 操作目标前端；目标前端不依赖 Creator package。CLI、Vite 适配器与 Creator UI 复用同一 Creator Core，但都不进入目标前端的生产 Bundle。

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
run state
```

注入 UIPluginContext。

验收：

Chat Plugin 能通过真实或 Mock AG-UI 数据展示 Agent 消息，并响应 running / error 状态。

---

# 21. Phase 5：开发态 HMR

使用现有前端构建能力，例如 Vite。

完成：

```text
Vite Development Server
React Fast Refresh
Plugin Component / Definition 分离
```

开发链路：

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

HMR 先验证现有 Vite / React Fast Refresh 行为，再决定是否增加机制。至少分别验证：

```text
只修改 Plugin Component
修改 AppUIModel
新增 Plugin 并更新生成 Registry
移除最后一个 PluginInstance
```

记录每种变化是组件热更新、应用重渲染还是整页刷新，以及 Agent 会话、Plugin 局部状态和 Runtime 状态是否保留。只有复现了无法接受的状态丢失后，才增加最小的开发期 model/registry 更新通道；不得为了“真正热插拔”预先把生产加载链改成 `import.meta.glob` 或动态 Package Runner。

---

# 22. Phase 6：Creator Agent 基础版

接入 DeepAgents。

完成：

```text
DeepAgents Creator Factory
Creator System Prompt
Project-scoped Filesystem / Search / Edit
Allowlisted validation commands
```

Creator 作为独立开发态 Node package 存在，模型实例由工具宿主注入，不进入目标前端的 Vite 生产 Bundle。它既可由 CLI 运行，也可通过开发工作台的 Vite 适配器运行。

Creator Agent 控制面允许按阶段迁移到独立 Python sidecar，但不能把整个 Creator
npm package 或生成项目改造成 Python 应用。长期职责边界是：React Workbench、
Vite 集成和浏览器诊断 reporter 留在 TypeScript；模型、Agent loop、项目工具编排、
验证、完成策略、回执与运行态诊断存储归 Python。浏览器继续访问原有 AG-UI HTTP
路径，Vite 只负责项目级 Python 进程生命周期与透明流代理。

迁移期间必须保留 `typescript` / `python` 双运行时。Python 是默认控制面并默认使用
`domain-write`；TypeScript 仅作为显式 legacy fallback 保留。
第一阶段仅建立版本化合同、Python FastAPI health/echo sidecar、随机端口鉴权
handshake、流式代理和 diagnostics 代理；不得在 transport 稳定前迁移 Agent，
也不得静默 fallback。Project Control 继续调用目标项目固定的
`scripts/ui-project-control.ts` JSON 协议，AppUIModel mutation engine 不得在 Python
重复实现。

第二阶段只在显式 `CREATOR_PYTHON_AGENT_MODE=minimal` 下接入预初始化的
OpenAI-compatible `ChatOpenAI` 与 DeepAgents，用受限的 read/edit/grep 文件工具验证
MiMo 连续结构化工具调用。该历史阶段当时默认 Python 模式仍为 echo。该阶段不得迁移 Project
Control、Composition Fast Path、Snapshot、Validation、Completion、Skills 或业务
状态机；开发模式写入只允许 `plugins/**`，且不得修改生成 Registry 或 AppUIModel。
该历史阶段完成后，默认 mode 已翻转为 `domain-write`；`echo`、`minimal` 和
`domain-read` 继续作为显式测试/诊断模式。

```ts
const creator = createCreatorAgent({
  model,
  projectRoot,
})

await creator.invoke({
  messages: [{ role: "user", content: request }],
})
```

文件与命令边界：

```text
/project/*
  读取 / 搜索

/project/app-ui/app-ui.json
  允许写入

其他文件
  禁止写入

Command
  仅允许固定的只读或验证命令
```

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
生成静态 Plugin Registry
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
生成显式静态 Registry
↓
通过 TypeScript Check
↓
Preview 正常显示
```

Creator 在这一阶段同时具备项目快照和 AppUIModel 事务工具。Plugin 源码仍由 Coding Agent 自主创建和修改；组合、挂载、停用、替换和实例移除通过语义工具执行。新 Plugin 的 `definition.ts` 使用默认导出契约，Registry 不再由模型手改。

完成边界由 Creator Harness 的 Verified Completion Gate 负责，不依赖模型自行声称成功：

```text
候选最终答复
↓
生成项目自己的 verify:ui + typecheck
↓
验证结果绑定当前 mutation revision
↓
同模型根据真实 Diff 和验证证据完成一次复核
↓
通过后才向用户发送最终答复与权威回执
```

`verify:ui` 属于生成项目，负责检查 AppUIModel、Plugin Registry、PluginInstance 与 Slot 挂载关系；它必须能在没有 Creator package 或 Workbench 的情况下独立运行。Creator 只在停止边界调用验证并反馈证据，不把 Agent 的自主工具选择改成固定 Workflow。

`verify:ui` 还必须检查生成 Registry 是否与当前 AppUIModel 一致，但保持严格只读。未选择的 Plugin 源码与开发期 Catalog 不属于错误；`mount === undefined` 表示没有普通 UI mount，headless Plugin 可在没有 mount 时继续激活。

如果当前 revision 未产生真实文件变化、验证失败、验证后又发生写入，或者复核未通过，Harness 必须拒绝候选答复并允许 Creator 继续修复。候选成功文本在完成门禁通过前不得进入 AG-UI 对话历史。

Creator Harness 必须把每次 run 的诊断链路以 JSONL 保存在目标项目本地的 `.agentuicreator/logs/`。日志至少包含用户请求、每次模型请求与原始返回、结构化工具调用及结果、Completion Gate 反馈、最终回执和异常；日志只用于开发诊断，不进入生成应用的生产 Bundle，也不得自动上传。`.agentuicreator` 内部应默认由本地 ignore 文件排除，避免把包含项目内容的诊断数据提交到版本库。

---

# 25. Phase 9：错误修复闭环

Creator 能读取：

```text
TypeScript Error
Build Error
Runtime Error
Plugin Load Error
```

开发期增加结构化运行时诊断桥：

```text
Plugin Error Boundary / setup 激活失败 / 明确标记的浏览器错误
        ↓
pluginId + instanceId + Slot 路径 + AppUIModel hash/revision
        ↓
Creator 开发服务器的有界诊断缓冲区
        ↓
inspect_runtime_errors
```

诊断桥是可选的开发能力，不成为生成应用的生产依赖。全局 console error 不能自动归因给某个 Plugin；只采集带来源标识或发生在受控 Plugin 边界内的错误，并进行大小限制、去重和过期清理。

目标 App / UI Runtime 只暴露可选的通用诊断 callback，不导入 Creator，也不知道 Creator endpoint。`apps/creator-workbench` 作为开发组合层把 Creator-owned reporter 传给目标 App；独立运行或生产构建时不传 reporter。这样运行时错误可以进入 Creator，又不让生成项目依赖 Creator runtime service。

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

再故意制造一个 typecheck 能通过但 Plugin 渲染失败的错误，Creator 可以通过 `inspect_runtime_errors` 找到准确实例和 revision，修复后旧诊断不再被当作当前错误。

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

DeepSeek/Cordis 动态 Package Runner

生产环境动态 Plugin discovery / import

强制每个请求先澄清再执行

把未选择的 Plugin 源码目录当成验证错误
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

用户继续：

```text
“这个详情面板先不要显示。”
```

Creator 删除实例的 `mount` 并设为 disabled，保留 Plugin 源码和 Registry 选择。

用户继续：

```text
“把这个功能移除，但代码留着。”
```

Creator 删除 PluginInstance；如果这是最后一个实例，生成 Registry 自动移除其静态 import，源码目录仍然保留。

用户继续：

```text
“把刚才这次修改撤销。”
```

Creator 只在相关文件仍匹配该 run 的 after hash 时整体恢复；有后续编辑时拒绝覆盖并报告冲突。

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

Creator 控制面的最终原则：

> 让 Agent 准确观察项目、语义化修改组合、可恢复地操作用户资产，并用当前 revision 的验证和运行时证据证明结果；不要用额外运行时复杂度弥补开发控制面的缺失。
