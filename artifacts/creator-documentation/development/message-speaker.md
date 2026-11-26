# 展示消息发言者的名称与头像

同一段聊天可以先由“高级开发工程师”回复，再由“高级界面设计师”回复。后端为每条回复返回当时的发言者身份，前端在回复正文上方显示名称和头像；重新打开历史后，各条回复仍显示各自的身份。

<figure className="plugin-preview">

![同一会话中的两条回复分别显示开发专家和设计专家的头像与名称](/images/development/message-speaker.png)

<figcaption>本地示例：切换到设计专家后，前一条回复仍显示开发专家的头像与名称。</figcaption>

</figure>

后端按下列格式返回数据后，回复会自动显示名称和头像。先接入[实时事件](#实时事件)，再保存并返回[历史消息](#历史消息)；需要在其他界面读取专家信息时，使用 [`useConversation`](#前端取数)。

## 约定发言者字段

后端返回以下身份对象：

```json
{
  "id": "developer",
  "name": "高级开发工程师",
  "avatarUrl": "https://cdn.example.com/experts/developer.png"
}
```

| 字段          | 要求        | 用途                              |
| ----------- | --------- | ------------------------------- |
| `id`        | 必填，非空字符串  | 标识发言者，例如 `developer`、`designer` |
| `name`      | 必填，非空字符串  | 显示在消息上的名称                       |
| `avatarUrl` | 可选，图片 URL | 显示头像；缺少或加载失败时使用默认图标             |

示例图片地址需要替换为浏览器实际可访问的地址。相对路径按前端页面地址解析，例如 `/assets/experts/developer.png` 指向前端站点，不会自动拼接后端接口地址。

`speaker.id` 用来区分专家，不同专家的回复仍使用消息角色 `assistant`。

## 发送前选择专家 \{#选择专家}

把业务下拉框的选中值传给已有 `<Agent>` 的 `ctx.expertId`，例如 `selectedExpertId` 为 `developer` 或 `designer`。下面是局部片段，合入时保留其他属性和已有的 `ctx` 参数：

```tsx
<Agent
  endpoint="/api/agent"
  ctx={{ expertId: selectedExpertId }}
/>
```

正常通过输入框发送消息时，请求会包含以下参数（只展示相关字段）：

```json ag-ui
{
  "forwardedProps": {
    "ctx": { "expertId": "developer" }
  }
}
```

后端从 `input.forwardedProps.ctx.expertId` 读取选择，执行对应专家，再通过回复中的 `metadata.speaker` 返回实际回答者的名称和头像。`expertId` 是本例的业务字段，需要前后端约定；设置参数本身不会自动完成后端路由。

切换选中值后，下次发送携带新的 `expertId`，仍保留当前会话；之前消息的身份不变。更多传参方式见[给 Agent 传递业务参数](/development/business-context.md)。

## 同一会话切换专家的实时事件 \{#实时事件}

选定专家后，后端按下面的格式返回对应身份。

下面是两次先后发生的请求，属于同一个会话：

| 请求            | `threadId` | `runId`   | 回复 `messageId` | 发言者         |
| ------------- | ---------- | --------- | -------------- | ----------- |
| 第一次：开发建议      | `chat-001` | `run-001` | `answer-001`   | `developer` |
| 第二次：切换后请求界面建议 | `chat-001` | `run-002` | `answer-002`   | `designer`  |

**保留 `threadId`，新请求使用新的 `runId`，新回复使用新的 `messageId`。**&#x4E0D;要因为切换消息身份而调用新建会话，或清空已有聊天记录。下面的 ID 仅用于演示；实际返回值要对应当前请求。

### 第一次请求：开发专家回复

服务端返回 `Content-Type: text/event-stream`。每个 `data:` 后是一个 JSON 事件，事件之间用空行分隔：

```text
data: {"type":"RUN_STARTED","threadId":"chat-001","runId":"run-001"}

data: {"type":"TEXT_MESSAGE_START","messageId":"answer-001","role":"assistant","metadata":{"speaker":{"id":"developer","name":"高级开发工程师","avatarUrl":"https://cdn.example.com/experts/developer.png"}}}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-001","delta":"建议先确定接口和数据结构，再实现业务逻辑。"}

data: {"type":"TEXT_MESSAGE_END","messageId":"answer-001"}

data: {"type":"RUN_FINISHED","threadId":"chat-001","runId":"run-001"}

```

### 第二次请求：切换到设计专家

用户在同一会话中选择设计专家并发送下一条消息。这次请求返回另一段事件流：

```text
data: {"type":"RUN_STARTED","threadId":"chat-001","runId":"run-002"}

data: {"type":"TEXT_MESSAGE_START","messageId":"answer-002","role":"assistant","metadata":{"speaker":{"id":"designer","name":"高级界面设计师","avatarUrl":"https://cdn.example.com/experts/designer.png"}}}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-002","delta":"界面建议采用左右分栏，左侧展示列表，右侧展示详情。"}

data: {"type":"TEXT_MESSAGE_END","messageId":"answer-002"}

data: {"type":"RUN_FINISHED","threadId":"chat-001","runId":"run-002"}

```

结果是：`answer-001` 继续显示开发专家，`answer-002` 显示设计专家。切换当前选择不会改写之前消息的名称和头像。

### 尽早声明身份，当前运行内沿用

主会话的任意实时 AG-UI 事件都可以通过顶层 `metadata.speaker` 声明当前助理，包括 `RUN_STARTED`、`REASONING_*`、`CUSTOM`、工具、状态和文本事件。身份一旦确定就发送；如果请求开始时已确定，建议放在 `RUN_STARTED`，思考阶段即可显示头像和名称，无需提前发送 TEXT 事件。

```json ag-ui
{
  "type": "RUN_STARTED",
  "threadId": "chat-001",
  "runId": "run-001",
  "metadata": {
    "speaker": {
      "id": "developer",
      "name": "高级开发工程师",
      "avatarUrl": "https://cdn.example.com/experts/developer.png"
    }
  }
}
```

也可以通过 CUSTOM 声明身份：`{ "type": "CUSTOM", "name": "speaker-selected", "value": {}, "metadata": { "speaker": { "id": "developer", "name": "高级开发工程师" } } }`。`name` 是业务自定义名称，身份从事件顶层 `metadata` 读取，不从 `value`、共享 state 或嵌套字段猜测。

同一次运行中，后续主助理消息省略身份时沿用最近一次声明。新请求重新声明身份，不自动继承上一次运行、历史消息或界面当前选择；取消、结束和切换 Thread 后不会串用身份。带 `subagentRunId` 的事件不改变主助理身份。

切换身份时发送完整的 `speaker` 对象，当前未结束消息和后续消息采用新身份，已经结束的其他消息保留原身份。要保留两位专家各自的发言记录，应使用不同的消息 ID；直接在同一个文本 `messageId` 上更新身份，会更新整条消息的身份头。

这是 Agent UI 的应用层身份规则，不改变 AG-UI 各类事件其他 metadata 的归属。TEXT 事件的其他 metadata 仍按顶层键合并到对应消息，嵌套对象整体替换；工具、CUSTOM、RUN 等事件的其他字段不会被当作助理消息 metadata。完整历史和消息快照内的身份以各条消息自身保存的值为准。

退出专家模式、切回前端配置的默认助手时，发送 `metadata: { "speaker": null }`。例如：

```json ag-ui
{
  "type": "CUSTOM",
  "name": "speaker-selected",
  "value": {},
  "metadata": { "speaker": null }
}
```

这里是 JSON 的 `null`，不是字符串 `"null"`。当前未结束消息和后续消息恢复 `messageIdentity.fallback` 的头像与名称，已经结束的专家消息保留原身份。同次运行中继续省略 `speaker`，仍沿用这次默认身份选择。没有配置 fallback 时不显示身份头；不自动生成默认名称或头像。也可以显式返回普通助手的完整身份对象。省略身份与明确重置的区别见[前端返回值](#前端返回值)。

## 保存并返回历史消息 \{#历史消息}

后端需要保存**每条消息当时的名称、头像与身份 ID**。加载历史时，返回保存的身份快照，不用会话当前选择的专家覆盖旧消息。

当前历史数据源的 `get(id)` 返回 `ConversationDetail`。下面的数据与上面两次实时回复对应：

```json
{
  "id": "chat-001",
  "title": "功能开发与界面设计",
  "history": {
    "format": "langchain",
    "messages": [
      {
        "id": "user-001",
        "type": "human",
        "content": "请给我功能实现建议。"
      },
      {
        "id": "answer-001",
        "type": "ai",
        "content": "建议先确定接口和数据结构，再实现业务逻辑。",
        "additional_kwargs": {
          "metadata": {
            "speaker": {
              "id": "developer",
              "name": "高级开发工程师",
              "avatarUrl": "https://cdn.example.com/experts/developer.png"
            }
          }
        }
      },
      {
        "id": "user-002",
        "type": "human",
        "content": "请给我界面设计建议。"
      },
      {
        "id": "answer-002",
        "type": "ai",
        "content": "界面建议采用左右分栏，左侧展示列表，右侧展示详情。",
        "additional_kwargs": {
          "metadata": {
            "speaker": {
              "id": "designer",
              "name": "高级界面设计师",
              "avatarUrl": "https://cdn.example.com/experts/designer.png"
            }
          }
        }
      }
    ]
  }
}
```

历史使用 LangChain 消息格式：用户消息是 `type: "human"`，助手消息是 `type: "ai"`。将身份放在 `additional_kwargs.metadata.speaker`，重新打开会话后即可显示保存的名称与头像。

这个外层 `ConversationDetail` 是当前项目的历史接入格式，不是 AG-UI 实时事件格式。后端已有自己的响应包裹或记录字段时，在 `src/agent-ui/services/conversations/data-source.ts` 的 `get()` 中映射成上述结构。历史请求和鉴权的修改方式见[历史会话服务](/development/history-backend.md)。

### 核对后端返回的字段

后端使用 LangChain / LangGraph 时，分别检查实际发送的 AG-UI 事件和历史接口响应：

| 路径                               | 返回身份的位置                                      |
| -------------------------------- | -------------------------------------------- |
| 实时文本事件                           | `event.metadata.speaker`                     |
| 当前 LangChain 历史消息                | `message.additional_kwargs.metadata.speaker` |
| AG-UI `MESSAGES_SNAPSHOT` 中的完整消息 | `message.metadata.speaker`                   |
| 前端通过 `useConversation` 读取        | `message.speaker`                            |

写入历史字段不能替代实时事件输出。核对实际发给浏览器的文本事件是否包含 `metadata.speaker`，不要把 LangGraph 执行上下文里的 metadata 当成已经透传的消息身份。

如果适配器在流中返回 `MESSAGES_SNAPSHOT`，它会提供权威的完整消息列表；其中的助手消息也要保留各自的 `metadata.speaker`。快照内使用 AG-UI 的 `role: "assistant"` 和 `metadata`，不要直接放入上面的 LangChain `type: "ai"` 历史记录。

## 通过现有 useConversation 取数 \{#前端取数}

默认助手消息组件会自动显示有效身份。只有自定义消息展示或业务界面需要读取身份时，才需要写下面的代码。统一从 `@za38.03/agent-ui-plugins` 导入现有 `useConversation`。

### 在消息组件里读取当前消息

下面的组件用于**已有消息组件作用域内部**，例如自定义身份头中的名称部分：

```tsx
import { useConversation } from '@za38.03/agent-ui-plugins';

export function MessageSpeakerName() {
  const speaker = useConversation(s => s.message.speaker);
  if (!speaker) return null;
  return <span data-speaker-id={speaker.id}>{speaker.name}</span>;
}
```

`speaker?.id`、`speaker?.name`、`speaker?.avatarUrl` 都可以直接读取，无需自行解析 `unknown`。只需要名称时，也可以选择 `useConversation(s => s.message.speaker?.name)`。

`s.message` 需要现有消息作用域。会话外层工具栏没有“当前正在渲染的这一条消息”，应使用下面的消息列表或即时快照。

### 在会话内读取全部消息

下面的组件放在已有会话组件内部，随当前会话的消息更新：

```tsx
import { useConversation } from '@za38.03/agent-ui-plugins';

export function ConversationSpeakerList() {
  const messages = useConversation(s => s.thread.messages);
  return <ul>
    {messages.filter(message => message.role === 'assistant').map(message => (
      <li key={message.id} data-speaker-id={message.speaker?.id}>
        {message.speaker?.name}
      </li>
    ))}
  </ul>;
}
```

`messages` 中的每条消息都可以通过 `message.speaker` 读取身份。实时回复和历史消息使用相同的取数方式。

### 点击时读取即时快照

不需要持续订阅时，使用无参数句柄，在事件发生时读取：

```tsx
import { useConversation, type ConversationMessageView }
  from '@za38.03/agent-ui-plugins';

export function InspectMessageSpeakers({ label, onInspect }: {
  label: string;
  onInspect: (messages: readonly ConversationMessageView[]) => void;
}) {
  const conversation = useConversation();
  return <button type="button"
    onClick={() => onInspect(conversation.getSnapshot().messages)}>
    {label}
  </button>;
}
```

`label` 来自项目文案，`onInspect` 接业务详情或导出逻辑。无参数 `useConversation()` 不自动订阅数据；持续展示时使用 selector，手动监听时使用现有 `conversation.subscribe(listener)` 并清理订阅。

### 没有身份或恢复默认身份时 \{#前端返回值}

`speaker` 的类型是 `MessageSpeaker | null | undefined`：

| 值           | 含义                         | 默认身份头的处理                      |
| ----------- | -------------------------- | ----------------------------- |
| 有效身份对象      | 有非空的 `id`、`name` 和可选头像 URL | 显示名称与头像；图片缺失或加载失败时显示默认图标      |
| `undefined` | 未提供身份，或身份不合法               | 不显示；配置了 fallback 时使用 fallback |
| `null`      | 后端明确切回前端默认身份               | 使用配置的 fallback；未配置时不显示        |

同一轮相邻助手消息的发言者 ID、名称、头像都相同时，默认组件省略重复的身份头；每条消息的数据仍各自保留。出现不同身份或新的用户消息后，再显示对应身份头。

## 调整默认身份头

需要关闭或自定义展示时，在生成项目的 `src/agent-ui/plugins/conversation-surface/index.tsx` 中，给已有的 `Implementation` 设置 `messageIdentity`，保留其他属性：

| 配置                               | 展示行为                                             |
| -------------------------------- | ------------------------------------------------ |
| 省略 `messageIdentity`             | 对携带有效身份的助手消息显示默认名称与头像                            |
| `messageIdentity={false}`        | 关闭身份头，不影响取到的 `speaker` 和正文                       |
| `messageIdentity={{ fallback }}` | 对没有有效身份或 `speaker: null` 的消息使用固定默认身份             |
| `messageIdentity={{ render }}`   | 使用 `render({ speaker, messageId })` 返回的节点替换整个身份头 |

fallback 和 render 只影响展示，不改变 `useConversation` 的读取结果。固定 fallback 名称从项目统一文案读取；专家名称来自后端消息。具体属性与组件定制入口见[会话界面：发言者头像与名称](/plugins/conversation-surface.md#显示发言者头像与名称)。

`speaker: null` 的语义已从隐藏身份头改为恢复 fallback。需要关闭身份头时，使用项目展示配置 `messageIdentity={false}`，或在自定义 `render` 中返回 `null`。

## 不显示时检查什么

| 遇到的情况           | 检查位置                                                |
| --------------- | --------------------------------------------------- |
| 实时回复没有名称        | 检查该条文本事件是否包含有效的 `metadata.speaker.id` 和 `name`      |
| 重新打开历史后没有名称     | 检查历史消息的 `additional_kwargs.metadata.speaker` 是否保存完整 |
| 名称正常，头像显示默认图标   | 在浏览器直接打开 `avatarUrl`，确认地址可访问                        |
| 切换专家后，旧消息的名字也变了 | 检查是否为每条消息保存了各自的身份，而不是读取会话当前选择                       |
