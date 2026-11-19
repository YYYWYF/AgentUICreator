---
title: "插件 API"
---

# 插件 API

本页按开发任务查找插件接口、参数和示例。创建文件与注册见[创建自定义插件](./create-plugin)，修改已有组件见[手动修改插件](./component-customization)。

先从速查表选择要用的能力，再展开对应条目。从其他插件取数或调用操作，见[插件联动与取数](./plugin-interaction)。

## 按开发需求查接口 {#公共能力速查}

| 开发需求 | 公共接口 | 使用位置与前提 |
| --- | --- | --- |
| 发送消息、停止、新建会话、提交审批 | [插件操作](#会话操作与实例信息)：`usePluginActions()`、`setup.actions` | 已启用插件的组件或 `setup` |
| 获取当前插件实例 | `usePluginInstance()`、`setup.instance` | 读取实例 ID、插件 ID、启用状态 |
| 读取消息、共享状态、运行与审批状态 | [会话状态](#读取会话状态)：`useAgentMessages()`、`useAgentState()`、`useAgentRun()` 等 | 已有 `AgentRuntimeProvider` 下的组件 |
| 复用或提供业务服务 | [服务接口](#服务共享与状态订阅)：`usePluginService()`、`usePluginServiceSnapshot()`、`setup.services` | 在插件定义中声明提供或消费的服务 |
| 打开工作台侧栏、切换或关闭内容 | [工作台侧栏服务](/plugins/workbench-panel#服务方法与状态)：`open(id)`、`activate(id)`、`close(id)`、`collapse()` | 工作台中启用 `workbench-panel`；调用方声明 `agent-ui.workbench-panel` 依赖 |
| 接收 Agent 返回的业务事件 | [事件接口](#订阅业务事件)：`usePluginEvents()`、`setup.events.subscribe()` | 项目注册事件 Schema，插件声明消费权限 |
| 组合子插件或替换消息展示 | [子插槽](#组件与子插槽)：`renderSlot()`、`renderScopedSlot()` | 在 manifest 中声明对应子插件的显示位置和接受的能力 |
| 自定义消息卡片和工具结果 | [展示注册](#消息与工具结果展示)：`dataMessageUIs`、`toolkit` | 注册到现有会话，保留数据名称和工具名称 |
| 复用输入框、附件与语音按钮 | [会话组件](#复用会话组件与输入能力)：公开组件、`useConversationComposer()` | 当前 Conversation 的上下文中 |
| 跟随主题与语言 | [样式与文案](#主题与多语言)：项目主题变量、`useAgentUILocale()` | 使用项目统一主题和 locale |
| 让 Agent 调用页面方法或交互组件 | [前端工具](#前端工具与宿主页面联动)：`toolkit` | 注册 `frontend + execute` 或 `human + render` |

这些能力复用应用已有的 Runtime 和 AG-UI 连接。生成工程已经提供所需上下文；把组件移到普通业务页面时，要检查该位置是否仍在对应 Provider 内。服务依赖声明不会自动创建服务，附件等业务服务也需要沿用项目配置。

## 声明插件与管理生命周期 {#声明插件与管理生命周期}

类型、定义和 setup 是插件的基础入口。按正在编写的文件查阅。

<span id="类型入口"></span>

编写插件定义时，从 `@za38.03/agent-ui-plugins/contracts` 导入 `UIPluginDefinition`；定义对象的实际字段见下表。组件内需要的 Hook 在相应示例中直接导入，状态与服务仍来自已有 Agent。


<details class="dev-guide-details" id="插件定义">
<summary>UIPluginDefinition：定义字段与实例身份</summary>

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

</details>

<details class="dev-guide-details" id="setup-上下文">
<summary>setup：服务注册、订阅与清理</summary>

| 成员 | 用途 |
| --- | --- |
| `instance` | 当前实例的 `id`、`pluginId`、`enabled` 和可选挂载信息 |
| `actions.sendMessage(input, options?)` | 发送字符串或 `AgentUserInput`；可通过 `{ ctx: { ... } }` 附带业务参数，返回 `Promise<void>` |
| `actions.abortRun()` | 请求停止当前运行 |
| `actions.startNewConversation()` | 新建并切换会话，返回 `Promise<void>` |
| `actions.resumeInterrupts(responses)` | 提交审批或补充信息，返回 `Promise<void>` |
| `services.get(name)` | 获取服务，缺失时返回 undefined |
| `services.provide(name, value)` | 注册服务，返回取消注册函数 |
| `events.subscribe(name, listener)` | 订阅业务事件，返回取消订阅函数 |

`setup` 是同步生命周期，清理函数也同步返回。把外部订阅和资源清理放进返回函数中，处理停用、切换和卸载。服务消费沿用项目既有 `usePluginService` / `usePluginServiceSnapshot` 接口。

</details>

## 组合组件与展示消息 {#组合组件与展示消息}

组件属性、子插槽和 renderer 都在项目代码中配置。

<details class="dev-guide-details" id="组件原生属性">
<summary>组件原生属性</summary>

组件继承某个 HTML 元素或根组件属性时，可使用其类型允许的属性：

- 样式与标识：`className`、`style`、`id`。
- 语义、无障碍与数据标记：`role`、`aria-*`、`data-*`。
- 行为：对应的事件回调。

具体继承对象、排除项和单独定义的属性见对应插件说明；完整类型以项目实际安装版本为准。

这些属性设置在项目插件入口的 JSX 中，不写入 `app-ui.json`。根组件属性不会自动传给内部输入框、按钮或自定义子组件，需使用相应的嵌套属性或直接配置子组件。

</details>

<details class="dev-guide-details" id="组件与子插槽">
<summary>renderSlot 与 renderScopedSlot：组合子插件</summary>

`renderSlot` 和 `renderScopedSlot` 由插件运行环境通过 `UIPluginComponentProps` 提供。修改已有插件时保留其原有调用；没有子插槽的组件通常无需使用它们。

| 方法 | 参数 | 返回 / 用途 |
| --- | --- | --- |
| `renderSlot(name, fallback?, options?)` | 本地插槽名、可选默认内容、`{ layout?: 'stack' \| 'inline', sizing?: 'content' \| 'fill' }` | `ReactNode`，渲染配置的子插件 |
| `renderScopedSlot(name, scope, fallback?)` | 插槽名、`{ kind, value }`、可选默认内容 | `ReactNode`，在当前消息或工具的上下文中渲染对应插件 |

| 场景 | 使用方法 |
| --- | --- |
| 普通内容，例如一组操作按钮 | `renderSlot` |
| 当前消息或工具的数据展示，例如某次工具调用详情 | `renderScopedSlot` |

使用规则：

- `scope.kind` 标识数据类型，`scope.value` 存放数据；新增数据类型仍使用同一个函数。
- `fallback` 是没有可用子插件时显示的备用内容。
- 声明为 `mode: "renderer"` 的插槽使用 `renderScopedSlot`；普通内容位置使用 `renderSlot`。运行环境会检查插槽类型。

`name` 是 manifest 中声明的本地插槽名。`renderSlot` 的可选 `options` 为：

| 字段 | 可选值与作用 |
| --- | --- |
| `layout` | `stack` 竖排，`inline` 横排。 |
| `sizing` | `content` 按内容占用空间，`fill` 填满可用区域。 |

两个字段均可省略。

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

在 `app-ui.json` 的插件实例中，通过 `slots.actions` 配置具有 `ticket-action` 能力的子插件。

- `cardinality` 可为 `one` 或 `many`。
- `mode: "renderer"` 的插槽必须为 `one`，组件还需提供相应渲染上下文。

</details>

<details class="dev-guide-details" id="消息与工具结果展示">
<summary>dataMessageUIs 与 toolkit：注册消息和工具结果展示</summary>

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

注册这个消息插件时：

1. 与 Agent 约定消息名称 `ticket_chart`，不要翻译该名称，也不要重复注册已有的 `chart`。
2. 按展示组件契约校验、转换业务数据，再传给组件；保留现有 npm 样式导入。
3. 仅负责消息注册的插件，在 manifest 声明 `capabilities: ['headless']` 和 `data: { messageUI: true }`。
4. 通过 AppUIModel 的 `applicationPlugins` 启用，并更新插件注册表。

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

将 `ticketToolkit` 赋给插件定义的 `toolkit`；工具名称与后端约定一致。该入口只注册展示，不注册或执行后端工具。修改已有工具 UI 时，保留已有的 `interaction` 配置、审批回调和运行状态参数。完整示例及验证场景见[已有结果的渲染定制](./component-customization#已有结果的渲染定制)。

</details>

<details class="dev-guide-details" id="复用会话组件与输入能力">
<summary>复用输入框、附件、听写和发送能力</summary>

从 `@za38.03/agent-ui-plugins` 导入公开组件，使用明确的 props 和 renderer 扩展。按钮图标用 `icon`，列表和工具详情使用各自的 renderer；仅 Runtime 分组内容与原生编辑器扩展保留必要的 `children`。例如，自定义输入区内继续使用现有的附件、听写和发送按钮：

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

附件默认转 Base64，听写默认依赖受支持的浏览器语音识别，评价默认保留当前界面的选择。上传和反馈保存分别通过 `Agent attachments`、`Agent feedback` 接入，见[附件上传服务](./attachment-upload)和[回复评价服务](./feedback-service)；业务语音转写服务仍标为开发中。

</details>

<details class="dev-guide-details" id="主题与多语言">
<summary>跟随项目主题，读取或新增双语文案</summary>

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

业务文案在项目共享消息模块中维护，跟随当前界面语言切换。复用已有领域时保留原有键；协议名、服务名、插件 ID 和消息名保持原值。样式覆盖见[主题与样式](./theme-and-styling)，文案配置与检查方式见[语言与文案](./localization)。

</details>

## 操作会话与接入业务数据 {#操作会话与接入业务数据}

按发送、读取、共享服务或订阅事件选择入口。

<details class="dev-guide-details" id="会话操作与实例信息">
<summary>usePluginActions 与 usePluginInstance：操作当前会话</summary>

React 组件从 `@za38.03/agent-ui-plugins` 取得：

- `usePluginActions()`：返回上表中的 `actions`。
- `usePluginInstance()`：返回 `instance`。

它们由现有插件实例上下文提供，不作为 `Component` 的额外参数传入。

例如 `await actions.sendMessage('分析订单', { ctx: { orderId: 'O-1042' } })`，后端从 `forwardedProps.ctx` 读取参数。更多示例见[业务参数 ctx](./business-context#业务参数-ctx)。

以下示例放在 `plugins/ticket-actions/index.tsx`，发送一条项目文案中配置的工单分析请求：

```tsx
import { useState } from 'react';
import { usePluginActions, usePluginInstance, useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { useAgentRun } from '@za38.03/agent-ui-runtime';
import { getProjectMessages } from '../../application/i18n/messages';

export function TicketActions() {
  const actions = usePluginActions();
  const instance = usePluginInstance();
  const run = useAgentRun();
  const labels = getProjectMessages(useAgentUILocaleCode()).ticketActions;
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

使用前完成以下接入：

- **文案**：按[主题与多语言](#主题与多语言)创建 `application/i18n/messages.ts`，加入 `ticketActions`；已有文件时合并该领域。`useAgentUILocaleCode()` 读取应用已有语言。
- **异步操作**：处理失败，并在运行或等待审批时控制按钮可用性。
- **审批回复**：`resumeInterrupts()` 接收 `AgentInterruptResponse[]`。沿用项目已有的审批数据与表单校验，不用普通消息替代审批回复。

</details>

<details class="dev-guide-details" id="读取会话状态">
<summary>会话、消息、运行状态与审批 Hook</summary>

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

</details>

<span id="服务共享与状态订阅"></span>

<details class="dev-guide-details" id="内置领域-hook">
<summary>使用项目已有的会话、认证、主题与语言服务</summary>

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

按用途选择公开导入入口：

| 用途 | 入口 |
| --- | --- |
| 读取主题 | `@za38.03/agent-ui-runtime/ui` |
| 读取语言、文案和使用通用服务 Hook | `@za38.03/agent-ui-plugins` |
| 主题服务标识与类型 | Runtime 的 `ui/services/agent-ui-theme` 子路径 |
| 语言服务标识与类型 | Runtime 的 `ui/services/agent-ui-locale` 子路径 |

例如，在会话列表插件组件中分别读取状态和取得刷新操作：

```tsx
import { useConversations } from '../../services/hooks/useConversations';
import { useConversationActions } from '../../services/hooks/useConversationActions';

// 在组件内调用
const { snapshot, serviceAvailable } = useConversations();
const { refresh } = useConversationActions();
```

`useConversations()` 只需要已有的 Plugin 服务上下文，不读取 assistant-ui 操作上下文。会话操作 Hook 通过现有会话运行环境完成切换和数据保存，不会创建另一个会话。主题、语言服务缺失时，`usePluginService()` 返回 `undefined`，切换组件自行降级。

这些项目 Hook 仅在文件缺失时初始化，已有定制文件会保留。自行调整文件位置时，同时更新组件中的相对导入路径。

</details>

<details class="dev-guide-details" id="自定义服务">
<summary>共享业务状态：依赖声明、服务实现与订阅</summary>

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

</details>

Agent 可通过以下 AG-UI 事件通知当前工单的变化。前端的类型注册、订阅和验证方法见下方步骤：

```jsonl
{"type":"CUSTOM","name":"app.ticket.selected","value":{"ticketId":"T-1042"}}
```

<details class="dev-guide-details" id="订阅业务事件">
<summary>接收 Agent 业务事件：类型、注册、订阅与验证</summary>

下面以“Agent 选中工单后，插件更新当前选择”为例。只需显示消息卡片时，使用[自定义消息渲染](./custom-ag-ui-events)，无需配置这里的实时订阅。

<span id="1-定义允许接收的数据"></span>

**1. 定义允许接收的数据**

新建 `src/agent-ui/application/business-events.ts`。示例使用 Zod 4，项目未安装时先通过自己的包管理器添加 `zod@^4`：

```ts
import { z } from 'zod';

export const businessEventSchemas = {
  'app.ticket.selected': z.object({ ticketId: z.string().min(1) }),
};
```

<span id="2-传给现有-agent"></span>

**2. 传给现有 Agent**

在挂载 `Agent` 的业务页面中合并已有配置。以下路径假设页面位于 `src/`；合并对象放在组件外，保留项目原有事件：

```tsx
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';
import { businessEventSchemas } from './agent-ui/application/business-events';

const appEventSchemas = { ...agentUIProject.appEventSchemas, ...businessEventSchemas };

// 在原来的 Agent 上增加此属性，其他配置继续保留。
<Agent appEventSchemas={appEventSchemas} />;
```

<span id="3-声明并订阅事件"></span>

**3. 声明并订阅事件**

在消费插件已有的 `manifest.json` 中追加事件名，保留其他字段：

```json
{ "data": { "events": ["app.ticket.selected"] } }
```

以下代码沿用[自定义服务](#自定义服务)中的工单选择服务。消费插件的 `definition.ts` 还需声明 `inject: ['tickets.selection']`，并把下面的函数绑定到已有 `setup`：

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

返回的取消函数会在插件停用或卸载时执行。已有 `setup` 时合并其清理函数。若改在 React 组件中使用 `usePluginEvents()`，就在 `useEffect` 中订阅并返回取消函数；选择一种方式即可。

<span id="4-发送与检查"></span>

**4. 发送与检查**

让 Agent 在现有 AG-UI 响应流中返回上方的 `app.ticket.selected` 事件。

确认当前工单变为 `T-1042`。再把 `ticketId` 改成空字符串或数字，订阅回调不应执行；核对事件名与 `value` 是否符合第 1 步的定义。Schema 未注册时，声明订阅的插件无法正常启用。

这条链路只接收实时通知，不重放历史。需要刷新后保留的选择，交给业务服务保存；仅写 TypeScript 泛型不会校验收到的数据。

</details>

## 连接宿主页面与前端工具 {#前端工具与宿主页面联动}

| 需求 | `Agent toolkit` 中的配置 |
| --- | --- |
| Agent 调用页面方法 | `type: 'frontend'`、`execute` 和可选 `render`。 |
| 组件收集用户输入 | `type: 'human'` 和 `render`。 |

已有项目工具来源继续保留执行许可，展示也通过 `toolkit` 配置。完整示例见[前端工具与页面操作](./frontend-tools#宿主页面操作接入)。

插件外的业务页面在同一个 `AgentUIProvider` 下使用：

- `useAgentUI()`：执行 Host 会话方法，操作时要求 `status === 'ready'`。
- `useAgentUIState()`：读取状态。
- `useAgentUIEvent()`：订阅会话事件。
- `useAgentUIAppEvent()`：订阅业务事件。

完整方法与 Hooks 见 [Host API](./react-host-api#会话方法)。

## 按当前任务复用已有上下文 {#公共-hook-与上下文}

插件组件可以操作同一 Agent 的草稿、会话和业务服务。按目标进入对应示例，导入路径与必要参数在各示例中给出：

| 现在要实现的操作 | 使用位置与数据来源 | 具体示例 |
| --- | --- | --- |
| 卡片把问题和业务 ID 放进草稿 | 已有插件中的 `useComposer()`；正文与 JSON 分开写入 | [订单卡片填入](../plugins/composer#example-3) |
| 操作区随输入更新，发送或停止 | 当前 Conversation 中的 `useConversationComposer()`；保留等待审批检查 | [草稿状态与操作](../plugins/composer#example-4) |
| 保存或导出整次回答 | 回复页脚内读取当前版本的完整文字与消息 ID | [保存回答](../plugins/response-footer#收藏或保存整次回答) |
| 获取当前消息、运行或业务状态 | 已有 Runtime 的响应式 Hook | [状态读取](#读取会话状态) |
| 两个插件共享业务选择 | 在定义中声明同一服务；用快照 Hook 订阅更新 | [共享工单选择](#服务共享与状态订阅) |
| 在消息卡片打开侧栏，并同步选中状态 | 同一 Agent 的现有面板服务 | [打开与订阅侧栏](../plugins/workbench-panel#hook) |
| 自定义工具交互或回答问卷 | 当前 renderer 提供参数、结果和提交回调 | [工具调用数据](../plugins/tool-fallback#当前工具调用的数据与操作)、[交互工具](./frontend-tools#2-在组件中提交结果) |
| 从普通业务页面控制指定助手 | 共享 Provider 下的 Host / 助手集合 | [Host 方法](./react-host-api#会话方法)、[多个助手](./multiple-agents#从业务页面控制指定助手) |

### 为项目包装组件保留准确参数 {#组件定义与类型的区别}

包装已有组件时，可以用 `ComponentProps<typeof Component>` 接收其完整公开属性，再增加项目自己的参数。类型在实际转发中使用，而不是另抄一份接口：

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalComposer } from '@za38.03/agent-ui-plugins';

export function LimitedComposer({ limit, ...props }:
  ComponentProps<typeof ConversationCanonicalComposer> & { limit: number }) {
  return <ConversationCanonicalComposer {...props}
    maxLength={Math.min(limit, props.maxLength ?? limit)} />;
}
```

`limit` 由项目传入正整数。当前输入框原本有更小上限时继续保留，否则使用项目上限；其他组合与行为继续转发。完整属性、默认值和回调结果在各插件的属性表中说明。

插件入口另有 `renderSlot` / `renderScopedSlot` 时，也保留现有转发；展示组件的属性不会自动启用插件定义中的 `setup` 或消息注册。项目 `services/hooks/*` 是本地文件，可能与 npm Hook 同名但签名不同，见[会话操作的导入区别](../plugins/conversation-service#hook)。

### 在现有实现中使用支持入口 {#已接管实现使用的支持入口}

已经接管的实现可能从 `/composer-support` 或 `/plugin-support` 导入底层组合部件。这些部件使用当前安装版本的原生参数；完整卡片还可能在内部转换状态，不能把其通用 props 无条件展开给每个部件。更改结果展示时可先用[保留审批的结果组合](../plugins/tool-fallback#自定义工具内容顺序)，编辑引用标签可用[Lexical 展示替换](../plugins/lexical-composer-input#conversationcomposerdirectivechipprops)。

普通业务插件的服务和操作使用前面的具体示例，保持原有 Provider 与 Thread。只有需要改变实现代码时，才按[源码接管流程](./source-takeover)处理。
