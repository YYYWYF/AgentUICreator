---
title: "自定义 Plugin 定义参考"
---

# 自定义 Plugin 定义参考

本页说明项目中 `UIPluginDefinition`、manifest、生命周期与组件上下文的合同。开发能力及使用场景先阅读[插件开发](./development)；本页用于查找具体声明与约束。类型从生成项目的 `framework/contracts/ui-plugin` 导入，以当前工程版本为准。

## 插件定义

项目中的插件由 manifest、组件和导出定义构成。定义通过项目既有注册流程发现，实例通过 AppUIModel 启用和组合。创建步骤见[创建自定义插件](./create-plugin)。

| 字段 | 必需 | 作用与约束 |
| --- | --- | --- |
| `manifest` | 是 | `UIPluginManifest`，描述身份、组合与数据使用。外部 JSON 通过 `parseUIPluginManifest` 校验。 |
| `Component` | 是 | 接收 `UIPluginComponentProps` 的 React 组件。服务或命名 renderer 插件可返回 `null`。 |
| `setup` | 否 | 实例激活时调用，返回 `void` 或同步清理函数。不能返回 Promise。 |
| `provides` | 否 | 服务名列表，声明本实例可提供的服务；在 setup 中实际注册。 |
| `inject` | 否 | 必需服务名列表。服务未提供时实例保持 pending。 |
| `optionalInject` | 否 | 可选服务名列表，不阻止激活；消费端处理服务缺失。 |
| `toolkit` | 否 | 按准确工具名映射 `ConversationToolkitEntry`，配置工具或人工交互展示，不提供前端业务执行授权。 |
| `dataMessageUIs` | 否 | `defineDataMessageUI` 创建的命名 renderer 列表，由当前实例激活状态控制注册。 |
| `RailAction` | 否 | 复用当前实例上下文的侧栏快捷组件。 |

`pluginId` 对应定义身份，实例 `id` 对应一次组合。允许复用实现不代表可以重复注册同名服务、工具 UI 或数据消息 UI；设计多实例时应明确共享服务和命名 renderer 的唯一提供者。

## Manifest

| 字段 | 用途与约束 |
| --- | --- |
| `id` / `name` / `description` / `version` | 必需的插件元数据。`id` 保持稳定，不按界面语言变化。 |
| `capabilities` | 语义组合能力列表，供父 Slot 的接受条件匹配；不是执行权限列表。 |
| `requiresRenderScope` | 声明必须在运行实体 scope 中渲染，不能放到普通静态位置。 |
| `slots.children` | 当前插件开放的子 Slot 定义，详见下表。 |
| `data.messages` / `data.state` | 声明消息或共享状态使用，不自动创建订阅、存储或写入接口。 |
| `data.messageUI` | 声明无需普通界面挂载的数据消息 UI 能力；实际 renderer 仍由定义注册。 |
| `data.events` | 消费的应用事件名称；每个名称都须由应用事件 schema 注册。 |
| `sidebar.icon` / `sidebar.labels` | 项目支持的侧栏图标及 `en-US` / `zh-CN` 标签。 |
| `layout.width` | `narrow` 或 `wide` 的宽度要求，用于布局适配诊断。 |
| `application.gate` | 应用进入条件的服务名及可选优先级，需要配套 Gate 服务和基础依赖。 |
| `authoring` | 描述用途、建议位置与尺寸等开发元数据，帮助选择和组合；不代替运行实现。 |

`authoring` 若存在，需要非空 `intents`，还可声明 `visualRole`、`defaultPlacement` 和 `recommendedSize`。`defaultPlacement` 支持相对既有插件的位置或父插件语义 Slot；它是位置建议，不是强制移动当前布局。`cleanup.removeWhenUnused` 仅适用于明确可移除的功能服务基础设施，不用于删除普通业务代码。

Manifest 使用严格 schema。未知字段、重复 capability、重复事件或无效 Slot 定义需要修正；不能通过添加任意 JSON 字段给组件传参。

## 子 Slot 声明与组件入口

`manifest.slots.children` 以本地 Slot 名为键，每项支持：

| 字段 | 说明 |
| --- | --- |
| `description` | 必需，说明该位置承载的语义内容。 |
| `cardinality` | 必需，`one` 或 `many`。 |
| `mode` | `content` 或 `renderer`，省略表示普通内容；renderer 必须为 `one`。 |
| `optional` | 声明是否允许缺少该位置的内容。 |
| `accepts.anyOfCapabilities` | 限制子插件至少具备其中一个 capability。 |

组件收到的 `UIPluginComponentProps` 提供：

| 入口 | 说明 |
| --- | --- |
| `renderSlot(localSlotName, fallback?, options?)` | 输出普通子内容。`options.sizing` 为 `content` / `fill`，`options.layout` 为 `stack` / `inline`。 |
| `renderScopedSlot(localSlotName, scope, fallback?)` | 在当前实体上下文中输出 renderer。`scope` 为只读的 `{ kind, value }`。 |
| `usePluginRenderScope<T>()` | 从项目 `runtime/plugins` 导入，读取当前 renderer scope，无 scope 时为 `null`。 |

Slot 声明、实例组合与组件渲染必须相互对应。保留 fallback；改变样式和微小 DOM 使用 React props 或组合。AppUIModel 保存布局与语义组合，不保存组件函数或 renderer。

## Setup 上下文

| `UIPluginSetupContext` 成员 | 合同 |
| --- | --- |
| `instance` | 当前解析后的插件实例信息。 |
| `actions` | `sendMessage`、`abortRun`、`startNewConversation`、`resumeInterrupts`，操作当前共享运行。 |
| `events` | `subscribe(name, listener)`，返回取消订阅函数；只能订阅已声明的应用事件。 |
| `services.get(name)` | 读取声明在 `inject` / `optionalInject` 中的依赖，缺失时返回 `undefined`。 |
| `services.provide(name, value)` | 注册声明在 `provides` 中的服务，返回撤销函数；重复提供同名服务会失败。 |

setup 是普通生命周期函数，不能在其中调用 React hooks。需要在渲染期读取数据的组件使用 hooks；setup 使用收到的上下文。Gate 或基础服务可能早于会话工作区激活，不能假定此时已存在可用的会话组件上下文。

清理函数负责释放业务订阅、异步任务、计时器与外部资源。运行层撤销其管理的服务及事件作用域。服务有依赖关系时由激活机制解析，不能依赖文件扫描或布局顺序；依赖循环无法通过调整 JSX 顺序解决。

## 可观察服务与组件消费

`UIPluginObservableService<TSnapshot>` 包含 `getSnapshot(): TSnapshot` 与 `subscribe(listener): () => void`。数据变化后更新快照并通知；没有变化时保持引用稳定。

组件从项目 `runtime/plugins` 导入 `usePluginService<T>(name)` 和 `usePluginServiceSnapshot(service, fallback)`。前者感知注册变化，后者订阅服务内部数据。访问服务前在定义中声明依赖，选用可选服务时处理 `undefined`。服务名使用小写点分格式，不将翻译文案作为名称。

`UIPluginServiceMap` 允许项目通过 TypeScript 模块扩展关联服务名与类型。类型声明和运行注册分别完成；增加接口字段不会自动提供服务。

## 状态、操作与事件

从项目 `runtime/context` 导入 `usePluginInstance`、`usePluginActions`、`usePluginEvents`，以及 `useAgentConversation`、`useAgentMessages`、`useAgentState`、`useAgentRun`、`useAgentExecutions`、`useAgentInterrupts` 和 `useAgentRuntimeSnapshot`。各入口的数据范围见[开发能力总览](./development)。

运行操作中的 `sendMessage` 接收字符串或 `AgentUserInput`，返回 Promise；`resumeInterrupts` 接收 `AgentInterruptResponse[]` 并返回 Promise；`startNewConversation` 返回 Promise；`abortRun` 返回 `void`。中断答复包含 `interruptId`、`status: 'resolved' | 'cancelled'` 和可选 `payload`、`metadata`。后台实际恢复支持与 payload 合同仍由应用和 Agent 约定。

插件事件为单向订阅接口，没有通用 emit。事件 schema 归应用 `agent-contract/agent-events.ts`；manifest 只声明消费列表。`subscribeAppEvent` 提供已注册事件的类型化订阅，运行时校验仍由应用 schema 完成。监听返回 Promise 时需处理业务异步生命周期，避免旧会话结果写入新会话。

## 工具与数据消息注册

`ConversationToolkitEntry` 的 `type` 为 `backend` 或 `human`，`display` 为 `standalone`，`render` 为展示组件。人工交互条目还需要 `description` 与 `parameters`；可选 `interaction.type` 为 `normal` / `interrupt` / `command`，沿用对应的现有交互合同。工具 UI 不提供前端 execute 授权；真实前端动作通过[前端工具](../integration/frontend-tools)接入。

`defineDataMessageUI<TData>` 从 Plugins 公开根入口导入，接收准确 `name` 和 `render`。renderer 的 props 为 `{ data: TData }`；泛型不进行运行时 payload 校验。命名 renderer 不能重复注册，缺失名称或冲突会阻止有效组合。工具名、事件名与数据消息名分别管理，不因名称相同而共享语义。

只提供服务或渲染注册时，`Component` 可返回 `null`，仍须保留实际定义字段和有效实例。不要仅导出空组件后期待框架自动发现业务行为。

## 应用 Gate

`application.gate.service` 指向本插件提供的可观察服务，快照为 `{ status, message? }`，状态为 `checking`、`blocked`、`ready` 或 `error`；可选 `priority` 决定 Gate 顺序。`UIApplicationGateService` 继承可观察服务合同。

Gate 不挂载到普通布局 Slot、不声明子 Slot，依赖必须满足应用基础层的组合要求。它是应用展示与启动控制，不代替后端鉴权，也不通过普通 `capabilities: ['app-gate']` 声明。状态改变由应用生命周期处理，组件可通过项目 `runtime/plugins` 的 `useApplicationLifecycle()` 读取整体阶段。

## 属性、语言与验证

组件 props、children 和 renderer 通过项目 JSX 配置；公开属性通常可以直接定制，无需接管实现。组件文案使用统一 locale，保留上下文与服务绑定。源码接管后的修改入口见[插件文件结构](./development)。

重复 ID、服务缺失、命名 renderer 冲突、非法事件和不支持的组合分别验证。历史回放、线程切换或组件重挂载不触发业务副作用；前端工具执行与卡片展示分别验收。完整检查见[验证定制](../customization/test-customizations)。

> 截图待补：自定义组件加入现有页面、停用后移除以及对应局部文件变化。
