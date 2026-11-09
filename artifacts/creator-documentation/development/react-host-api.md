# React 页面参数与方法

`AgentUIProvider` 让业务组件与助理共享同一个会话。业务组件通过 `useAgentUI()` 发送消息、停止生成或新建会话，通过状态和事件 Hooks 更新页面。接入步骤、截图和完整代码见[业务页面与 Agent 联动](/development/react-host-control.md)。

## Provider 属性表

`AgentUIProvider` 从 `@za38.03/agent-ui-runtime` 导入。

| 属性         | 类型                     | 用途                                 |
| ---------- | ---------------------- | ---------------------------------- |
| `children` | `ReactNode`            | 必填。包含需要联动的业务组件和一个 Agent。           |
| `user`     | `AgentUIUser` 或 `null` | 可选。共享展示资料；Agent 的显式 `user` 可覆盖继承值。 |

## Agent 属性表

服务地址、主题、语言和适配器等**配置始终传给 `<Agent />`**，有外层 Provider 时也一样。下表说明各属性的用途，以及不传入时的行为。

| 属性                                                       | 类型                                                      | 省略时 / 用途                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `frontendTools`                                          | `AgentFrontendToolSource`                               | 可选。提供宿主页面允许 Agent 调用的操作，与项目已有工具合并。                                                                              |
| `endpoint`                                               | `string`                                                | 指定 AG-UI 地址，默认 `/agent`。Creator 开发预览期间使用面板选择的连接。                                                                |
| `getRunContext`                                          | `ConversationRunContextGetter`                          | 可选。每次请求（包括审批恢复）同步读取业务数据，返回 AG-UI `context` 条目；示例见[传入业务上下文](/development/agent-options.md#传入业务上下文)。              |
| `theme`                                                  | `AgentUITheme`                                          | 可传 `light`、`dark`、`violet`；不传时使用内置紫色主题并允许内置切换。传入后由业务页面控制。                                                       |
| `onThemeChange`                                          | `(theme: AgentUITheme) => void`                         | 可选。用户切换主题时调用；业务页面在回调中更新 `theme`。                                                                                |
| `locale`                                                 | `AgentUILocaleCode`                                     | 默认中文；当前支持 `zh-CN`、`en-US`，不发给 AG-UI。                                                                            |
| `defaultLocale`                                          | `AgentUILocaleCode`                                     | 设置初始语言并允许内置切换；默认 `zh-CN`。`locale` 用于页面控制当前语言。                                                                   |
| `onLocaleChange`                                         | `(locale: AgentUILocaleCode) => void`                   | 可选。用户切换语言时调用；业务页面在回调中更新 `locale`。                                                                               |
| `user`                                                   | `AgentUser` 或 `null`                                    | 省略时继承外层 Provider 的展示资料；两者都省略时显示项目登录服务（`auth.session`）中的用户资料；null 显示未登录状态。可含 `userId`、`userName`、`avatar`，不用于认证。 |
| `initialThreadId`                                        | `string`                                                | 不传则新建会话；传入时初始化打开已有会话，修改此值不会直接切换当前会话。                                                                            |
| `transientMessages`                                      | `ConversationRuntimeProviderProps['transientMessages']` | 可选。在页面内显示临时提示，不写入历史记录，也不发送给 Agent。                                                                              |
| `appEventSchemas`                                        | `AgentProps['appEventSchemas']`                         | 注册业务事件名和 payload Schema，见[自定义事件](/development/custom-ag-ui-events.md)。                                          |
| `locales`                                                | `AgentProps['locales']`                                 | 中英文文案覆盖。                                                                                                        |
| `assistantPanelWidth`                                    | `number`                                                | 悬浮助理宽度，受视口限制。                                                                                                   |
| `enableMessageQueue`                                     | `boolean`                                               | 默认 false；启用内存中的后续消息队列。                                                                                          |
| `attachments`、`dictation`、`feedback`                     | 对应 `ConversationRuntimeProviderProps` 字段                | 上传、转写、反馈接口配置；传 false 可关闭对应能力。                                                                                   |
| `attachmentAdapter`、`dictationAdapter`、`feedbackAdapter` | 对应 `ConversationRuntimeProviderProps` 字段                | 自定义业务适配器，优先于对应通用配置。                                                                                             |
| `conversationDataSource`                                 | `AgentProps['conversationDataSource']`                  | 历史数据源；保留对应插件启用，见[历史服务](/development/history-backend.md)。                                                        |
| `toolkit`、`frontendToolUIs`                              | 对应 `ConversationRuntimeProviderProps` 字段                | 项目额外的工具展示配置。                                                                                                    |
| `integrations`                                           | `ComponentType<{ children: ReactNode }>`                | 额外集成包装组件，保留已生成的 integration。                                                                                    |
| `onError`                                                | `ConversationRuntimeProviderProps['onError']`           | 可选。应用或 Agent 运行出错时调用；业务代码调用异步方法时，还需用 try/catch 处理报错。                                                            |

业务服务的 URL、鉴权和适配代码放在项目实现中，可自行编写，也可以交给 Creator 接入或修改。见[附件、语音与评价服务](/development/attachments-dictation-feedback.md)。

面板开关及保持会话的方法见[业务页面联动](/development/react-host-control.md)。

### 运行上下文回调

`ConversationRunContextGetter` 从 `@za38.03/agent-ui-runtime` 导入，也可通过 `ConversationRuntimeProviderProps['getRunContext']` 获取类型。直接使用 `ConversationRuntimeProvider` 时，传入同名属性。

```ts
type ConversationRunContextGetter = (input: {
  readonly messages: readonly Message[];
  readonly runConfig: { readonly custom?: Record<string, unknown> } | undefined;
}) => readonly { description: string; value: string }[];
```

`Message` 是 AG-UI 消息类型。回调读取当前页面的数据并同步返回数组，数组可以为空。它不管理业务状态，也不会订阅或推送状态变化。读取失败会通过 `onError` 报告，当前请求继续发送，不会因这个错误将整个运行标记为失败。配置方法和使用边界见[传入业务上下文](/development/agent-options.md#传入业务上下文)。

欢迎语、示例问题与默认按钮文案统一使用 `locales`，项目默认值位于 `application/locales.ts`。结构与数量在项目组件和 `project-config.tsx` 中定制，见[Agent 参数与配置](/development/agent-options.md)。

## 会话方法

`const host = useAgentUI()` 返回 `AgentUIHost`，其中包含以下方法。`sendMessage()`、`abortRun()`、`startNewConversation()` 和 `resumeInterrupts()` **必须在 `host.getSnapshot().status === 'ready'` 时调用**。读取状态和添加监听不受此限制。

| 方法                            | 参数                                                                                        | 返回                            | 说明                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| `sendMessage(input)`          | `string` 或 `AgentUserInput`                                                               | `Promise<void>`               | 向当前会话发送消息；返回的 Promise 完成后，仍需检查运行状态以确认结果。           |
| `abortRun()`                  | 无                                                                                         | `void`                        | 请求停止当前运行，保留当前会话和面板。                                |
| `startNewConversation()`      | 无                                                                                         | `Promise<void>`               | 创建并切换到新会话；后续发送需等待此调用完成。                            |
| `resumeInterrupts(responses)` | `AgentInterruptResponse[]`                                                                | `Promise<void>`               | Agent 暂停等待审批或补充信息时，提交用户的处理结果并继续执行。                 |
| `getSnapshot()`               | 无                                                                                         | `AgentUIHostSnapshot<TState>` | 读取当前是否就绪，以及会话、消息和运行状态；未就绪时 `runtime` 可能为 null。     |
| `subscribe(listener)`         | `() => void`                                                                              | `() => void`                  | 状态变化时执行回调，回调中用 `getSnapshot()` 读取新状态。调用返回的函数可停止监听。 |
| `on(event, listener)`         | `K extends keyof AgentUIEventMap<TState>`、`(payload: AgentUIEventMap<TState>[K]) => void` | `() => void`                  | 指定事件发生时执行回调，事件与数据见下表。返回函数用于停止监听。                   |

### 输入参数结构

```ts
// 类型从 @za38.03/agent-ui-core 导入
interface AgentUserInput {
  content: string | AgentInputPart[];
}
interface AgentInterruptResponse {
  interruptId: string;
  status: 'resolved' | 'cancelled';
  payload?: unknown;
  metadata?: Record<string, unknown>;
}
```

`AgentInputPart` 支持文本及 image/audio/video/document 媒体。文本项为 `{ type: 'text', text: '...' }`；媒体项包含 `source`（data 或 url）和可选 `name`。实际可发送的媒体类型取决于 Agent 服务的支持情况。完整附件流程见[附件、语音与评价](/development/attachments-dictation-feedback.md)。`payload` 用于填写审批结果或补充信息，字段必须符合当前请求的 `responseSchema` 和业务约定。

## Hooks 与界面组件

| API                                | 参数 / 返回                           | 使用说明                                                                           |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `useAgentUI<TState>()`             | 返回 `AgentUIHost<TState>`          | 在 Provider 子组件中使用，外层没有 Provider 时会报错。                                          |
| `useOptionalAgentUI<TState>()`     | 返回 `AgentUIHost<TState>` 或 `null` | 外层没有 Provider 时返回 null，适用于需要同时支持独立使用和页面联动的组件；从 `@za38.03/agent-ui-runtime` 导入。 |
| `useAgentUIState(selector)`        | `(snapshot) => T`，返回 `T`          | 读取指定字段，并在其变化时更新组件。回调应返回字段值或已有对象，不要每次创建新对象。                                     |
| `useAgentUIEvent(event, listener)` | 事件名和回调，返回 void                    | 指定事件发生时调用回调；组件移除时自动停止监听。                                                       |
| `useAgentUIUser()`                 | 返回展示资料、null 或 undefined           | 读取 Provider 传入的用户名和头像等资料；登录认证需另外配置。                                            |
| `<Agent />`                        | `AgentProps`                      | 启动项目会话并在当前位置显示助理，自动复用外层 Provider；独立使用时建立内部上下文。                                 |

## 状态与事件

`getSnapshot()` 返回两种状态：`status` 表示前端会话是否已就绪，`runtime.run.status` 表示 Agent 当前是否正在执行任务。

| `status`       | 含义 / 页面处理                              |
| -------------- | -------------------------------------- |
| `initializing` | 会话正在初始化，发送、停止等按钮应保持禁用。                 |
| `ready`        | 前端会话已就绪，可以调用会话方法；Agent 服务是否可用仍需在请求时确认。 |
| `blocked`      | 应用暂不允许进入会话，例如需要先登录；按页面提示完成处理。          |
| `error`        | 前端会话初始化或应用配置出错，需先处理页面显示的错误。            |

`runtime.run.status` 的取值为：`idle`（空闲）、`running`（正在执行）、`awaiting-input`（等待用户处理）、`error`（执行出错）。业务页面可据此控制发送、停止、审批等按钮。

| 事件              | 数据内容                | 触发含义                            |
| --------------- | ------------------- | ------------------------------- |
| `ready`         | `{ threadId }`      | 前端会话就绪时触发，重新建立连接后可能再次触发。        |
| `status-change` | `{ status }`        | 前端会话的就绪状态发生变化。                  |
| `thread-change` | `{ threadId }`      | 当前会话 ID 改变，首次建立会话时也可能触发。        |
| `run-start`     | `{ threadId, run }` | Agent 开始执行，运行状态变为 `running`。    |
| `run-end`       | `{ threadId, run }` | Agent 停止执行，可能已完成、暂停等待用户、被取消或出错。 |

React 组件通常使用 `useAgentUIState()` 或 `useAgentUIEvent()`，由 Hook 自动管理监听。

## 错误处理

| 错误码                          | 含义 / 处理                                            |
| ---------------------------- | -------------------------------------------------- |
| `AGENT_UI_NOT_READY`         | 会话尚未就绪就调用了操作方法。就绪前禁用操作按钮，调用处同时捕获错误。                |
| `AGENT_UI_SESSION_ENDED`     | Agent 或 Provider 被移除，或连接切换，尚未完成的消息发送、审批或补充信息提交被终止。 |
| `AGENT_UI_PROVIDER_MISSING`  | 调用 Hook 或使用 Outlet 的组件没有放在 Provider 内。             |
| `AGENT_UI_MULTIPLE_SURFACES` | 同一 Provider 内放了多个 Agent 或 Outlet；只保留一个。            |

判断回答结果时，结合 `runtime.run.status`、`runtime.run.error` 和待处理请求；Promise 完成或 `run-end` 不能单独证明成功。

方法、错误处理及面板开关示例见[业务页面联动](/development/react-host-control.md)。

## 订阅 Agent 业务事件

`useAgentUIAppEvent` 和 `AgentUIAppEventListener` 从 `@za38.03/agent-ui-runtime` 导入。在共享的 `AgentUIProvider` 下使用，订阅组件可以与 Agent 并列放置，不需要进入 Agent 内部的会话 Provider。

```tsx
import { useAgentUIAppEvent } from '@za38.03/agent-ui-runtime';

export function TicketSelection({ onSelect }: {
  onSelect: (ticketId: string) => void;
}) {
  useAgentUIAppEvent('app.ticket.selected', event => {
    const data = event.payload;
    if (data && typeof data === 'object' &&
        'ticketId' in data && typeof data.ticketId === 'string') {
      onSelect(data.ticketId);
    }
  });
  return null;
}
```

在业务页面的共享 Provider 中同时渲染 `<TicketSelection onSelect={...} />` 和 `<Agent />`。

**`useAgentUIEvent` 订阅生命周期，`useAgentUIAppEvent` 订阅业务事件。** 业务事件返回 `{ name, payload, producer }`，保留主 Agent 或 SubAgent 的来源；它不是原始 AG-UI wire event。宿主按自己的业务约定校验 payload，泛型仅提供 TypeScript 类型，不会执行数据校验。

需要在普通回调中管理监听时，使用 `host.onAppEvent(name, listener)`；返回函数用于取消订阅。可在会话就绪前订阅；只接收当前就绪会话的实时事件，不重放历史。切换会话时自动连接新来源，组件移除时 Hook 自动取消监听。不要在宿主启动、停止或重新连接底层事件流。

## 提供宿主页面操作

`AgentProps.frontendTools` 接收 npm 公开的 `AgentFrontendToolSource`。使用 Runtime 的 `createAgentUIFrontendTools()` 可以直接从页面方法创建该来源，完整示例见[宿主页面操作接入](/development/frontend-tools.md#宿主页面操作接入)。它与生成项目已有工具合并，不会替换原有工具。

### 外壳定制

初始化选择哪种展示形态，工程的 `application/shell/` 就只生成对应的组件和样式：悬浮助理为 `AssistantShell.tsx` 与 `assistant-shell.css`，嵌入式为 `EmbeddedShell.tsx` 与 `embedded-shell.css`，平台式为 `PlatformShell.tsx` 与 `platform-shell.css`。不会生成另外两种外壳或 `ModeShell`。修改图标、位置、动画或展开收起行为时，直接编辑这些项目文件，无需接管 Plugin 源码。初始化文件静态导出所选组件为 `ProjectShell`，`application/project-config.tsx` 通过 `Shell: ProjectShell` 连接 Runtime；面板宽度仍可通过 `assistantPanelWidth` 传入。

收起面板时保留子树挂载，只隐藏面板，以保持会话和 Plugin 服务运行。模板仅负责初始化，后续 npm 升级不会覆盖用户外壳。既有本地外壳无需迁移；使用旧 npm 内置外壳的工程升级时，需要显式添加并绑定项目 Shell，未绑定时 Runtime 内联显示内容。
