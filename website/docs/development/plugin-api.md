---
title: "插件开发接口"
---

# 插件开发接口

项目插件由能力声明、组件和可选的服务生命周期组成。创建文件与注册步骤见[创建自定义插件](./create-plugin)。修改已有官方插件外观时，先使用[组件公开属性](./component-customization)。

## 公共能力速查

| 开发需求 | 公共接口 | 使用位置与前提 |
| --- | --- | --- |
| 发送消息、停止、新建会话、提交审批 | [插件操作](#会话操作与实例信息)：`usePluginActions()`、`setup.actions` | 已启用插件的组件或 `setup` |
| 获取当前插件实例 | `usePluginInstance()`、`setup.instance` | 读取实例 ID、插件 ID、启用状态 |
| 读取消息、共享状态、运行与审批状态 | [会话状态](#读取会话状态)：`useAgentMessages()`、`useAgentState()`、`useAgentRun()` 等 | 已有 `AgentRuntimeProvider` 下的组件 |
| 复用或提供业务服务 | [服务接口](#服务共享与状态订阅)：`usePluginService()`、`usePluginServiceSnapshot()`、`setup.services` | 在插件定义中声明提供或消费的服务 |
| 接收 Agent 业务通知 | [事件接口](#订阅业务事件)：`usePluginEvents()`、`setup.events.subscribe()` | 项目注册事件 Schema，插件声明消费权限 |
| 组合子插件或替换消息展示 | [子插槽](#组件与子插槽)：`renderSlot()`、`renderScopedSlot()` | 在 manifest 中声明对应子插件的显示位置和接受的能力 |
| 自定义消息卡片和工具结果 | [展示注册](#消息与工具结果展示)：`dataMessageUIs`、`toolkit` | 注册到现有会话，保留数据名称和工具名称 |
| 复用输入框、附件与语音按钮 | [会话组件](#复用会话组件与输入能力)：公开组件、`useConversationComposer()` | 当前 Conversation 的上下文中 |
| 跟随主题与语言 | [样式与文案](#主题与多语言)：项目主题变量、`useAgentUILocale()` | 使用项目统一主题和 locale |
| 让 Agent 调用页面方法 | [前端工具](#前端工具与宿主页面联动)：`createAgentUIFrontendTools()` | 通过项目或宿主组件的 `frontendTools` 属性传入 |

这些能力复用应用已有的 Runtime 和 AG-UI 连接。生成工程已经提供所需上下文；把组件移到普通业务页面时，要检查该位置是否仍在对应 Provider 内。服务依赖声明不会自动创建服务，附件等业务服务也需要沿用项目配置。

## 类型入口

```ts
import type {
  UIPluginDefinition,
  UIPluginComponentProps,
  UIPluginSetupContext,
} from '@za38.03/agent-ui-plugins/contracts';
```

新工程直接从 npm 公开入口导入这些类型。历史工程可能仍通过本地 `framework/contracts/ui-plugin` 转发；先检查现有导入。

运行时函数从以下公开入口导入；不要从包内部目录导入：

```ts
import {
  usePluginActions,
  usePluginInstance,
  usePluginEvents,
  usePluginService,
  usePluginServiceSnapshot,
} from '@za38.03/agent-ui-plugins';
import {
  useAgentState,
  useAgentRun,
} from '@za38.03/agent-ui-runtime';
```

## 插件定义

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `manifest` | `UIPluginManifest` | 必填，声明 ID、名称、版本、能力和子插槽 |
| `Component` | `ComponentType<UIPluginComponentProps>` | 必填，显示插件；只负责消息注册的插件可返回 null |
| `setup` | `(context: UIPluginSetupContext) => void \| (() => void)` | 可选，实例启用期间注册服务或订阅；返回清理函数 |
| `provides` | `readonly string[]` | 声明实例提供的服务 |
| `inject` | `readonly string[]` | 声明必须存在的服务，缺失时无法启用 |
| `optionalInject` | `readonly string[]` | 可选服务，不阻止启用 |
| `toolkit` | `ConversationToolkit` | 注册后端工具结果的展示，工具执行仍由原会话负责 |
| `dataMessageUIs` | `readonly DataMessageUIDefinition<never>[]` | 注册具名数据消息的展示 |
| `RailAction` | `ComponentType<UIPluginComponentProps>` | 可选，侧栏快捷操作 |

`manifest.id` 是插件身份；`app-ui.json` 中的实例 `id` 是这一次使用的身份，二者不同。`manifest` 的必填项为 `id`、`name`、`description`、`version`。

## 组件原生属性

组件属性继承某个 HTML 元素或根组件时，可使用其类型允许的 `className`、`style`、`id`、`role`、`aria-*`、`data-*` 和事件回调。具体继承对象、排除项和单独定义的属性见对应插件的属性说明；完整类型以项目实际安装版本为准。

这些属性设置在项目插件入口的 JSX 中，不写入 `app-ui.json`。根组件属性不会自动传给内部输入框、按钮或自定义子组件，需使用相应的嵌套属性或直接配置子组件。

## 组件与子插槽

`renderSlot` 和 `renderScopedSlot` 由插件运行环境通过 `UIPluginComponentProps` 提供。修改已有插件时保留其原有调用；没有子插槽的组件通常无需使用它们。

| 方法 | 参数 | 返回 / 用途 |
| --- | --- | --- |
| `renderSlot(name, fallback?, options?)` | 本地插槽名、可选默认内容、`{ layout?: 'stack' \| 'inline', sizing?: 'content' \| 'fill' }` | `ReactNode`，渲染配置的子插件 |
| `renderScopedSlot(name, scope, fallback?)` | 插槽名、`{ kind, value }`、可选默认内容 | `ReactNode`，在当前消息或工具的上下文中渲染对应插件 |

`renderSlot` 用于普通内容位置，例如一组操作按钮；`renderScopedSlot` 用于需要当前对象数据的展示位置，例如某次工具调用的详情。后者的 `scope.kind` 标识数据类型，`scope.value` 存放数据；新增数据类型仍使用同一个函数。`fallback` 是没有可用子插件时显示的备用内容。运行环境会检查插槽类型，声明为 `mode: "renderer"` 的位置使用 `renderScopedSlot`，普通内容位置使用 `renderSlot`。

`name` 是 manifest 中声明的本地插槽名。`renderSlot` 的可选 `options` 控制排列和大小：`layout` 为竖排 `stack` 或横排 `inline`，`sizing` 为按内容占用空间 `content` 或填满可用区域 `fill`；两个字段均可省略。

开放一个普通操作区的组件示例：

```tsx
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';

export function TicketCard({ renderSlot }: UIPluginComponentProps) {
  return <section>{renderSlot('actions', null, { layout: 'inline' })}</section>;
}
```

在这个插件的 `manifest.slots.children` 中声明同名插槽：

```json
{
  "actions": {
    "description": "Ticket actions",
    "cardinality": "many",
    "optional": true,
    "accepts": { "anyOfCapabilities": ["ticket-action"] }
  }
}
```

随后在 `app-ui.json` 的插件实例中，通过 `slots.actions` 配置具有 `ticket-action` 能力的子插件。`cardinality` 为 `one` 或 `many`；`mode: "renderer"` 的插槽必须为 `one`，组件还需提供相应渲染上下文。

## setup 上下文

| 成员 | 用途 |
| --- | --- |
| `instance` | 当前实例的 `id`、`pluginId`、`enabled` 和可选挂载信息 |
| `actions.sendMessage(input)` | 发送字符串或 `AgentUserInput`，返回 `Promise<void>` |
| `actions.abortRun()` | 请求停止当前运行 |
| `actions.startNewConversation()` | 新建并切换会话，返回 `Promise<void>` |
| `actions.resumeInterrupts(responses)` | 提交审批或补充信息，返回 `Promise<void>` |
| `services.get(name)` | 获取服务，缺失时返回 undefined |
| `services.provide(name, value)` | 注册服务，返回取消注册函数 |
| `events.subscribe(name, listener)` | 订阅业务事件，返回取消订阅函数 |

`setup` 是同步生命周期，清理函数也同步返回。把外部订阅和资源清理放进返回函数中，处理停用、切换和卸载。服务消费沿用项目既有 `usePluginService` / `usePluginServiceSnapshot` 接口。

## 会话操作与实例信息

React 组件从 `@za38.03/agent-ui-plugins` 使用 `usePluginActions()` 和 `usePluginInstance()`，分别取得上表中的 `actions` 和 `instance`。它们由现有插件实例上下文提供；不作为 `Component` 的额外参数传入。

以下示例放在 `plugins/ticket-actions/index.tsx`，发送一条项目文案中配置的工单分析请求：

```tsx
import { useState } from 'react';
import { usePluginActions, usePluginInstance } from '@za38.03/agent-ui-plugins';
import { useAgentRun } from '@za38.03/agent-ui-runtime';
import { useTicketActionsMessages } from '../../services/ticket-messages';

export function TicketActions() {
  const actions = usePluginActions();
  const instance = usePluginInstance();
  const run = useAgentRun();
  const labels = useTicketActionsMessages();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send() {
    setPending(true);
    setFailed(false);
    try {
      await actions.sendMessage(labels.prompt);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <div data-plugin-instance={instance.id}>
    <button type="button"
      disabled={pending || run.status === 'running' || run.status === 'awaiting-input'}
      onClick={() => { void send(); }}>
      {labels.send}
    </button>
    {failed && <p role="alert">{labels.failed}</p>}
  </div>;
}
```

先按[主题与多语言](#主题与多语言)加入示例的 `ticketActions` 文案，并在插件定义中声明 locale 服务依赖。异步操作需处理失败，并在运行或等待审批时控制按钮可用性。`resumeInterrupts()` 接收 `AgentInterruptResponse[]`；沿用项目已有的审批数据与表单校验，不用普通消息替代审批回复。

## 读取会话状态

以下 Hook 从 `@za38.03/agent-ui-runtime` 导入，订阅已有 Runtime 的变化：

| Hook | 读取内容 |
| --- | --- |
| `useAgentConversation()` | 当前会话信息 |
| `useAgentMessages()` | 当前会话消息 |
| `useAgentState<TState>()` | Agent 共享业务状态，类型沿用项目的 `AppAgentState` |
| `useAgentRun()` | 运行状态，如 `idle`、`running`、`awaiting-input`、`error` |
| `useAgentExecutions()` | 当前用户轮次的执行链，包含续跑阶段，不是持久化历史 |
| `useAgentInterrupts()` | 当前待处理的审批或补充输入 |
| `useAgentRuntimeSnapshot<TState>()` | 完整 Runtime 快照，确实需要多个字段时使用 |

例如，读取 Agent 已经写入共享状态的选中文件：

```tsx
import { useAgentState } from '@za38.03/agent-ui-runtime';
interface AppAgentState { selectedFile?: string }

export function SelectedFile() {
  const state = useAgentState<AppAgentState>();
  return state.selectedFile ? <output>{state.selectedFile}</output> : null;
}
```

泛型只提供类型检查，不会创建后端数据或校验网络内容。新增状态字段时同步项目状态契约。组件根据已有状态渲染即可，不自行解释原始 SSE 或启动另一条事件流。

## 服务共享与状态订阅

### 内置领域 Hook

会话与认证使用领域 Hook 统一处理服务接入和状态订阅。主题、语言保留读取 Hook；少数切换插件直接获取既有服务。

| 领域 | 读取 | 操作 |
| --- | --- | --- |
| 会话 | `useConversations()` 返回 `snapshot`、`serviceAvailable` | `useConversationActions()` 提供刷新、选择、删除、重命名、归档、恢复归档和独立详情读取 |
| 认证 | `useAuthSession()` 返回 `snapshot`、`serviceAvailable` | 同一 Hook 的 `session` 提供登录、退出 |
| 主题 | `useAgentUITheme()` 返回当前主题 | `usePluginService(AGENT_UI_THEME_SERVICE)` 获取服务并调用 `setTheme()` |
| 语言 | `useAgentUILocaleCode()` 读取语言；`useAgentUILocale(namespace)` 读取文案 | `usePluginService(AGENT_UI_LOCALE_SERVICE)` 获取服务并调用 `setLocale()` |

会话与认证 Hook 统一放在项目 `services/hooks/`，通过相对路径导入：

```text
services/
  hooks/
    useConversations.ts
    useConversationActions.ts
    useAuthSession.ts
```

这些 Hook 是服务的 React 访问层；服务契约和实现不反向依赖 Hook。仅用于插件内部交互的 Hook 仍放在对应插件目录。

主题读取从 `@za38.03/agent-ui-runtime/ui` 导入；语言值、文案和通用服务 Hook 从 `@za38.03/agent-ui-plugins` 导入。主题、语言服务的标识与类型分别从 Runtime 的公开 `ui/services/agent-ui-theme`、`ui/services/agent-ui-locale` 子路径导入。

例如，在会话列表插件组件中分别读取状态和取得刷新操作：

```tsx
import { useConversations } from '../../services/hooks/useConversations';
import { useConversationActions } from '../../services/hooks/useConversationActions';

// 在组件内调用
const { snapshot, serviceAvailable } = useConversations();
const { refresh } = useConversationActions();
```

`useConversations()` 只需要已有的 Plugin 服务上下文，不读取 assistant-ui 操作上下文。会话操作 Hook 通过现有会话运行环境完成切换和数据保存，不会创建另一个会话。主题、语言服务缺失时，`usePluginService()` 返回 `undefined`，切换组件自行降级。

这些项目 Hook 仅在文件缺失时初始化。已有用户工程的定制文件和旧 `hooks/` 路径保持原样，不自动搬迁或删除；迁移时需一并修改应用层引用。

### 自定义服务

服务用于共享项目业务能力。插件定义中的依赖声明与消费接口如下：

| 接口或字段 | 行为 |
| --- | --- |
| `provides: ['tickets.selection']` | 声明本实例会提供的服务；在 `setup` 中调用 `services.provide()` 注册 |
| `inject: ['tickets.selection']` | 必需依赖；服务缺失时实例无法启用 |
| `optionalInject: ['tickets.selection']` | 可选依赖；缺失时组件自行降级 |
| `services.get<T>(name)` | `setup` 中读取已声明的 `inject` / `optionalInject` 服务 |
| `usePluginService<T>(name)` | 组件中读取已声明的服务；也可读取本实例 `provides` 的服务 |
| `usePluginServiceSnapshot(service, fallback)` | 订阅实现 `getSnapshot()` / `subscribe()` 的服务；缺失时返回 fallback |

例如，在生成目录的 `services/ticket-selection.ts` 中实现一个页面内的工单选择服务：

```ts
import type { UIPluginObservableService } from '@za38.03/agent-ui-plugins/contracts';

export interface TicketSelectionSnapshot {
  selectedId: string | null;
}

export interface TicketSelectionService
  extends UIPluginObservableService<TicketSelectionSnapshot> {
  select(id: string): void;
}

export function createTicketSelectionService(): TicketSelectionService {
  let snapshot: TicketSelectionSnapshot = { selectedId: null };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select(id) {
      if (snapshot.selectedId === id) return;
      snapshot = { selectedId: id };
      for (const listener of listeners) listener();
    },
  };
}
```

在消费插件的定义中加入 `optionalInject: ['tickets.selection']`，组件即可订阅：

```tsx
import { usePluginService, usePluginServiceSnapshot } from '@za38.03/agent-ui-plugins';
import type { TicketSelectionService, TicketSelectionSnapshot } from '../../services/ticket-selection';

const EMPTY_SELECTION: TicketSelectionSnapshot = { selectedId: null };

export function SelectedTicket() {
  const service = usePluginService<TicketSelectionService>('tickets.selection');
  const snapshot = usePluginServiceSnapshot(service, EMPTY_SELECTION);
  return snapshot.selectedId ? <output>{snapshot.selectedId}</output> : null;
}
```

服务实现的 `getSnapshot()` 在数据未变化时应返回同一个对象；数据变化后再替换快照并通知订阅者。`subscribe(listener)` 返回取消函数。fallback 也保持稳定，避免每次渲染新建对象。

提供方在自己的定义中加入 `provides: ['tickets.selection']` 和 `setup: setupTicketSelection`，通过 `setup` 注册上面的服务：

```ts
import type { UIPluginSetupContext } from '@za38.03/agent-ui-plugins/contracts';
import { createTicketSelectionService } from '../../services/ticket-selection';

export function setupTicketSelection({ services }: UIPluginSetupContext) {
  const selection = createTicketSelectionService();
  return services.provide('tickets.selection', selection);
}
```

提供方和消费方都需要在 AppUIModel 中启用。示例只保存在页面内，刷新后不会恢复；需要持久化时接入项目自己的数据源。若服务还持有连接或定时器，清理时同时释放这些资源。相同服务名只能有一个活动提供实例；不要给多个实例重复注册同名服务。也可通过扩展 `UIPluginServiceMap` 为服务名关联类型。

## 订阅业务事件

插件组件使用 `usePluginEvents()`，非 React 生命周期使用 `setup.events`。订阅前完成两处声明：

1. 通过 `<Agent appEventSchemas={schemas} />` 按需声明事件名和 payload Schema，例如 `'app.ticket.selected': z.object({ ticketId: z.string().min(1) })`，并从 `zod` 导入 `z`。保留已有事件。
2. 在消费插件的 manifest 中，将该事件名加入 `data.events`，例如 `"data": { "events": ["app.ticket.selected"] }`。保留其他已有字段。

以下生命周期示例复用上节的工单选择服务；消费插件定义还需加入 `inject: ['tickets.selection']`：

```ts
import type { UIPluginSetupContext } from '@za38.03/agent-ui-plugins/contracts';
import type { TicketSelectionService } from '../../services/ticket-selection';

export function setupTicketEvents({ events, services }: UIPluginSetupContext) {
  const selection = services.get<TicketSelectionService>('tickets.selection');
  if (!selection) throw new Error('TICKET_SELECTION_SERVICE_MISSING');
  return events.subscribe<{ ticketId: string }>('app.ticket.selected', event => {
    selection.select(event.payload.ticketId);
  });
}
```

将该函数作为消费插件定义的 `setup`。返回的取消函数会随实例停用或卸载执行。React 组件使用 `usePluginEvents()` 时，在组件顶层调用 Hook，再在 `useEffect` 中订阅并返回取消函数；与 `setup` 二选一，避免重复订阅。

业务事件是实时通知，不重放历史，也不是组件之间任意发布消息的总线。需要恢复的状态放入共享状态或业务服务；不要用业务事件代替运行生命周期。`events.subscribe<T>()` 的泛型只提供类型检查；运行时校验来自项目配置中注册的事件 Schema。

单个组件的实时投影可以使用本地状态，不必为了订阅创建 Service。例如，已注册并声明的 `app.ticket.selected` 可以在组件中按业务 ID 合并：

```tsx
import { useEffect, useState } from 'react';
import { usePluginEvents } from '@za38.03/agent-ui-plugins';

export function SelectedTickets() {
  const events = usePluginEvents();
  const [tickets, setTickets] = useState<Record<string, { ticketId: string }>>({});
  useEffect(() => events.subscribe<{ ticketId: string }>('app.ticket.selected', event => {
    setTickets(previous => ({ ...previous, [event.payload.ticketId]: event.payload }));
  }), [events]);
  return <ul>{Object.values(tickets).map(ticket => <li key={ticket.ticketId}>{ticket.ticketId}</li>)}</ul>;
}
```

Schema 模块属于项目代码；沿用已有位置，缺少时按实际生成目录新建并接入 `Agent.appEventSchemas`。`agent-contract/agent-events.ts` 是可选组织方式，目录不存在不代表能力缺失。保留用户明确给定的业务通知协议；业务任务的实时通知与标准 Activity、Tool、Run 进度不同，不能互相冒充，也不能据此承诺历史恢复。

## 消息与工具结果展示

通过 `dataMessageUIs` 注册具名消息展示。以下示例复用官方图表组件，先在新插件的 `index.tsx` 中定义展示项：

```tsx
import { CanonicalChartMessage, defineDataMessageUI } from '@za38.03/agent-ui-plugins';

export const ticketChartUI = defineDataMessageUI<unknown>({
  name: 'ticket_chart',
  render: props => <CanonicalChartMessage {...props} />,
});
```

再在 `definition.ts` 中注册：

```ts
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ticketChartUI } from './index';
import manifest from './manifest.json';

export const ticketChartPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  dataMessageUIs: [ticketChartUI],
  Component: () => null,
};

export default ticketChartPlugin;
```

`ticket_chart` 是与 Agent 约定的数据消息名称，不是翻译文案。数据结构需符合所用组件的契约，任意业务数据先校验、转换，再传给展示组件。保留项目现有的 npm 样式导入。只负责消息注册的插件，在 manifest 声明 `capabilities: ['headless']` 和 `data: { messageUI: true }`，并通过 AppUIModel 的 `applicationPlugins` 启用；创建目录后仍需更新插件注册表。不要同时重复注册已有的 `chart` 消息名称。

从 AG-UI `CUSTOM` 格式、数据解析到插件注册的完整示例见[自定义 AG-UI 事件与消息渲染](./custom-ag-ui-events)。该消息路径与 `events.subscribe()` 实时通知分开，业务事件 Schema 转换不会改写会话消息内容。

工具结果使用 `UIPluginDefinition.toolkit`，可通过公开的 `createConversationToolkit()` 创建。例如，复用标准工具卡片展示一个业务工具：

```tsx
import { createConversationToolkit, ConversationToolFallback } from '@za38.03/agent-ui-plugins';

export const ticketToolkit = createConversationToolkit({
  lookup_ticket: {
    type: 'backend',
    display: 'standalone',
    render: props => <ConversationToolFallback {...props} />,
  },
});
```

将 `ticketToolkit` 赋给插件定义的 `toolkit`；工具名称与后端约定一致。该入口只注册展示，不注册或执行后端工具。修改已有工具 UI 时，保留已有的 `interaction` 配置、审批回调和运行状态参数。完整示例及验证场景见[自定义结果展示](./custom-renderers)。

## 复用会话组件与输入能力

从 `@za38.03/agent-ui-plugins` 导入公开组件，使用它们的 props、children 和 renderer 扩展。例如，自定义输入区内继续使用现有的附件、听写和发送按钮：

```tsx
import {
  ConversationComposerAddAttachment,
  ConversationComposerDictate,
  ConversationComposerSend,
} from '@za38.03/agent-ui-plugins';

export function ComposerActions() {
  return <>
    <ConversationComposerAddAttachment />
    <ConversationComposerDictate />
    <ConversationComposerSend />
  </>;
}
```

此组件放入已有 Composer 的组合入口；这些按钮依赖当前会话与输入区上下文，不能任意放到独立业务页面。需要自己实现输入外观时，可使用 `useConversationComposer()`：

| 状态 / 方法 | 用途 |
| --- | --- |
| `text`、`setText(text)` | 读取和修改当前草稿 |
| `disabled`、`canSend`、`canCancel`、`isRunning` | 控制输入与操作可用性 |
| `send()`、`cancel()` | 发送草稿、取消运行 |
| `attachments`、`attachmentAccept`、`attachmentsEnabled` | 读取附件与可选文件类型 |
| `addAttachment(file)`、`removeAttachment(id)` | 操作附件，返回 Promise，调用方需处理失败 |

附件默认转 Base64，听写默认依赖受支持的浏览器语音识别，评价默认保留当前界面的选择。上传、服务端转写、反馈保存通过项目配置的 `conversationServices` 接入，复杂协议可按需创建自己的服务文件，见[附件、语音与评价服务](./attachments-dictation-feedback)。

## 主题与多语言

组件优先使用工程已有的 UI 库和公开样式属性，主题颜色沿用项目的 CSS 变量。官方文案通过 `@za38.03/agent-ui-plugins` 的 `useAgentUILocale()` 读取，项目通过 `Agent` 的 `locales` 属性覆盖需要修改的键。

官方命名空间和键由当前安装版本定义，`Agent.locales` 只能覆盖已有键。新增业务文案集中放到项目已有的共享消息模块；没有时可创建 `application/i18n/messages.ts`。按领域命名并保持双语字段一致，不在每个插件里创建国际化 Hook、语言条件或另一套语言状态：

```ts
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = {
  ticketActions: {
    send: '分析工单',
    prompt: '请分析当前工单并给出处理建议。',
    failed: '请求失败，请稍后重试。',
  },
};
const enUS: typeof zhCN = {
  ticketActions: {
    send: 'Analyze ticket',
    prompt: 'Analyze the current ticket and suggest next steps.',
    failed: 'The request failed. Please try again.',
  },
};
const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };
export function getProjectMessages(locale: AgentUILocaleCode) {
  return messages[locale];
}
```

组件读取统一语言上下文，再消费领域文案；纯展示函数通过参数接收文案：

```tsx
import { useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';

export function TicketActionLabel() {
  const labels = getProjectMessages(useAgentUILocaleCode()).ticketActions;
  return <span>{labels.send}</span>;
}
```

业务文案由项目维护，不扩展或改写 npm 字典，不增加独立语言状态。复用已有领域时保留原有键；协议名、服务名、插件 ID 和消息名保持原值。主题变量与检查方式见[样式与文案开发](./styling-and-localization)。

## 前端工具与宿主页面联动

让 Agent 调用页面现有方法时，使用 Runtime 公开的 `createAgentUIFrontendTools()`，通过项目 `<Agent frontendTools={tools} />` 接入。它与 `toolkit` 展示注册分开，具体参数校验、权限和取消处理见[前端工具与页面操作](./frontend-tools#宿主页面操作接入)。

需要在插件外的业务页面发送消息或读取状态时，使用同一个 `AgentUIProvider` 下的 `useAgentUI()`、`useAgentUIState()` 和 `useAgentUIEvent()`，见 [Host 会话方法与 Hooks](./react-host-api#会话方法)。Host 操作要求 `status === 'ready'`；业务事件使用 `useAgentUIAppEvent()`。复用已有 Provider 与连接，不要为插件创建另一套 Runtime 或 AG-UI 连接。
