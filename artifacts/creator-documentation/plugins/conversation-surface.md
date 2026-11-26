# 会话界面（conversation-surface）

## 功能与效果


![会话展示界面](/images/plugins/conversation-surface.png)

会话中的消息和输入区共享当前 Thread；输入插件继续通过原有插槽组合。

组合消息、欢迎内容、建议和输入区，复用已有 Conversation 生命周期。

## 数据来源与显示条件


### 输入区与会话作用域

Composer 和它的附件、引用、提及、技能及发送入口需要使用同一个 Agent 与 Conversation 上下文。会话界面把当前消息、输入区及其语义插槽放在这个作用域内；它本身不向 `pluginData` 再提供一份业务数据。

调整会话容器或输入区位置时，保留项目现有的 Composer 插槽与 `renderSlot` 组合。这样 @ 与 / 继续写入可见输入框，技能和引用继续参与同一次发送。不要为了改布局再创建一个独立 Runtime 或第二份 Composer。

其他业务插件如何读写和订阅同一草稿，见 [Composer hooks](/plugins/composer.md#hook)；各插件提供的数据格式从 [Composer 联动入口](/plugins/composer.md#与哪些插件共享输入和发送)进入对应页面。切换 Thread 后使用新作用域的草稿；异步回调中保存的旧句柄仍绑定原 Thread，不会自动改为当前会话。

### 显示条件与数据来源 \{#显示条件与数据来源}

会话界面由已有 Runtime 的消息、运行状态和子插件组成。以下是一次普通回复的完整事件顺序。`threadId`、`runId` 使用当前请求值，三条文字事件共用 `messageId`；每行按[共用 SSE 格式](/plugins/ag-ui-data.md#共用的-sse-格式)发送：

```jsonl
{"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}
{"type":"TEXT_MESSAGE_START","messageId":"answer-1","role":"assistant"}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-1","delta":"以下是查询结果。"}
{"type":"TEXT_MESSAGE_END","messageId":"answer-1"}
{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","outcome":{"type":"success"}}
```

工具、思考和自定义卡片使用[各自事件](/plugins/ag-ui-data.md#按展示内容找事件)，历史消息由[会话数据源](/plugins/conversation-data-source.md)加载。启用会话界面不会自动启用所有内容插件；无对应渲染器时不会凭事件名称创建新插件。


## 常见定制





### 容器适配 \{#让会话填满业务容器}


容器高度由业务页面提供。保留现有 Adapter 和插槽转发，外层使用 flex 布局时允许内容收缩。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalConversationSurfacePlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationSurfacePlugin>) {
  return <CanonicalConversationSurfacePlugin {...props}
    style={{ ...props.style, height: "100%", minHeight: 0, borderRadius: 12 }} />;
}
```


### 关闭自动聚焦 \{#关闭自动聚焦}

打开对话区域后，光标留在业务页面原来的位置。欢迎文案在 application/locales.ts 的 conversation 域中配置；空 welcomeDescription 隐藏说明。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalConversationSurfacePlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationSurfacePlugin>) {
  return <CanonicalConversationSurfacePlugin {...props}
    autoFocus={false} />;
}
```

### 显示发言者头像与名称

助手回复会显示该条消息提供的头像和名称。缺少或加载失败的图片使用默认图标；相邻助手消息的身份相同时，省略重复头部。

后端实时事件、LangChain 历史消息、同一会话切换专家和 `useConversation` 取数的完整示例，见开发教程[展示消息发言者的名称与头像](/development/message-speaker.md)。本节说明默认身份头的展示配置。

在项目 `plugins/conversation-surface/index.tsx` 给已有组件传入 `messageIdentity`：

```tsx fold height=180
// 关闭身份展示
return <Implementation {...props} messageIdentity={false} />;
```

也可以传 `{ fallback, render }`。`fallback` 是没有身份时使用的固定 `{ id, name, avatarUrl? }`；其名称来自项目文案。`render({ speaker, messageId })` 返回自定义身份头的 ReactNode，保留已有正文和消息交互。省略 `messageIdentity` 时，仅对携带合法身份的消息展示默认头部。

`messageIdentity={false}` 不会清空取到的 `speaker`；fallback 不写入消息身份。后端返回 JSON `speaker: null` 时，表示切回配置的 fallback；未配置 fallback 时不显示身份头。`useConversation` 仍返回 `speaker: null`，不会把前端默认名称和头像写入消息数据。配置影响展示，消息数据仍通过[统一取数入口](/development/message-speaker.md#前端取数)读取。

### 读取当前会话 \{#hook}

需要让其他组件读取当前聊天时，从 `@za38.03/agent-ui-plugins` 导入 `useConversation`，沿用已有 Conversation 上下文。无参数时返回即时读取句柄，不自动订阅；传入 selector 时订阅选中的值：

| 需求                    | 调用方式                                                                      | 返回值与更新方式                                                                               |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 随列表加载状态更新工具栏          | `useConversation(s => s.threads.isLoading)`                               | `boolean`，状态变化时重新渲染；selector 只能读取公开 `ConversationState` 中的字段                           |
| 随当前 Thread 的消息更新界面    | `useConversation(s => s.thread.messages)`                                 | `readonly ConversationMessageView[]`，每条消息包含类型明确的 `speaker`；消息引用变化时重新渲染                 |
| 在消息组件内显示专家名称和头像       | `useConversation(s => s.message.speaker)`                                 | `MessageSpeaker \| null \| undefined`；可直接读取 `name`、`avatarUrl`                         |
| 随当前 Thread 的运行状态更新界面  | `useConversation(s => s.thread.isRunning)`                                | `boolean`，运行状态变化时重新渲染                                                                  |
| 点击时读取当前 Thread 的全部消息  | `conversation.getSnapshot()`                                              | `{ messages, state?, isRunning }`；`conversation` 来自组件顶层的 `useConversation()`，调用时读取最新快照 |
| 手动订阅更新                | `conversation.subscribe(listener)`                                        | 返回取消订阅函数；在 listener 中重新读取快照，在 effect 清理时取消订阅                                           |
| 一次读取整个 Thread 的消息内容片段 | `conversation.getSnapshot().messages.flatMap(message => message.content)` | 所有消息的内容片段展平结果；这次读取不自动订阅                                                                |

selector 按 `Object.is` 比较结果，选中值不变时不会因其他数据更新而重新渲染。选择具体字段或已有的稳定引用，避免每次返回新的对象、数组；无参数句柄只在显式调用 `subscribe` 时注册数据订阅。`message` 和 `threadListItem` 字段分别需要已有的消息与列表项作用域。

例如，工具栏“查看会话数据”按钮需要把当前消息交给业务详情面板：

```tsx fold height=180
import { useConversation, type ConversationThreadSnapshot }
  from '@za38.03/agent-ui-plugins';

export function InspectConversation({ label, onInspect }: {
  label: string;
  onInspect: (snapshot: ConversationThreadSnapshot) => void;
}) {
  const thread = useConversation();
  return <button type="button"
    onClick={() => onInspect(thread.getSnapshot())}>{label}</button>;
}
```

`label` 来自项目文案，`onInspect` 接已有面板或导出逻辑。快照跟随当前 Thread；这次读取不会加载其他历史或发送请求。持续显示消息、运行与业务状态时，也可使用[会话状态 Hook](/development/plugin-api.md#读取会话状态)。

自定义消息组件要复用当前工具 renderer 时，从 `@za38.03/agent-ui-runtime/plugin-api` 导入 `useConversationToolRenderer()`，得到工具组件或 `undefined`；传入原 renderer 的工具调用 props，缺失时由项目决定备用展示。

## 属性与 API



### API

在 `CanonicalConversationSurfacePlugin` 上设置以下属性。

继承 `div` 原生属性，排除 `children`。

| 属性                 | 类型                                                                                                               | 省略时 / 用途                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `autoFocus?`       | `boolean`                                                                                                        | 传给当前会话组件，决定是否自动聚焦输入框                    |
| `welcome?`         | `ReactNode`                                                                                                      | 欢迎区内容；`emptyWelcome` 插槽优先               |
| `suggestions?`     | `ReactNode`                                                                                                      | 建议内容；`emptySuggestions` 插槽优先            |
| `composer?`        | `ReactNode`                                                                                                      | 输入区内容；`composer` 插槽优先                   |
| `messageIdentity?` | `false \| MessageIdentityOptions`                                                                                | 自动显示消息身份；可关闭，或设置固定 fallback 与身份头 render |
| `Adapter?`         | `ComponentType<ConversationSurfaceAdapterProps>`                                                                 | 负责显示消息和输入区的现有会话组件；没有时不显示会话主体            |
| `rendererSlots?`   | `{ toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean }` | 标明当前启用了哪些消息展示插件；继续使用项目生成的配置             |
| `snapshot?`        | `{ mode?: string; detailStatus?: string }`                                                                       | 宿主页面传入的会话状态，用于给容器添加状态标记                 |

`Adapter` 接收的属性包括：

- 输入与容器：`autoFocus`、`className`。
- 内容组合：`welcome`、`suggestions`、`composer`。
- 渲染组合：`rendererSlots`、`renderScopedSlot`。

外层 `className`／`style` 用于插件容器，不会自动变为 `Adapter` 的属性。

默认欢迎语和编辑、停止等按钮文案，统一在项目 `application/locales.ts` 的 `locales.conversation` 中修改：

- `welcome`：欢迎标题。
- `welcomeDescription`：说明；空字符串隐藏。

需要替换结构时，使用 `welcome` / `suggestions` 的 ReactNode 属性或语义插槽。语言覆盖需保持 `en-US` / `zh-CN` 对应。

## 常见问题

### 传了 welcome 为什么没有显示？ \{#传了-welcome-为什么没有显示}

生成项目已配置 `emptyWelcome` 插槽时，插槽内容优先。修改该插槽里的组件，或在项目组合中调整它；单独传 welcome 不会替换已配置的插槽。
