# 接入历史会话

接入自己的历史服务，让用户查看会话列表、打开聊天记录，以及删除、重命名或归档会话。

## 地址与鉴权配置

打开 `src/agent-ui/services/conversations/http-data-source.ts`，修改已有的 `conversationDataSourceConfig`。源码目录不同时，替换路径前缀：

```ts
export const conversationDataSourceConfig: Partial<HttpConversationDataSourceOptions> = {
  endpoint: '/api',
  credentials: 'include',
  headers: () => ({}), // 在这里沿用项目现有的鉴权读取逻辑。
};
```

`endpoint` 是历史接口的基础地址。`headers` 支持每次请求读取登录凭据的函数，`credentials` 设置 Cookie 策略。保留文件中已有的工厂函数。

也可以在业务页面创建数据源并传给 `Agent`：

```tsx
import { Agent } from './agent-ui';
import { createHttpConversationDataSource } from './agent-ui/services/conversations';

const history = createHttpConversationDataSource({ endpoint: '/api' });

export function App() {
  return <Agent conversationDataSource={history} />;
}
```

保留数据源和会话服务插件启用。`Agent endpoint` 设置对话接口，数据源的 `endpoint` 设置历史接口。Vue/HTML 在 React 生产工程中配置，再重新构建。

## 按接口配置请求与响应

列表、详情、删除、重命名、归档、取消归档分别使用 `list`、`get`、`delete`、`rename`、`archive`、`unarchive` 对象。只配置需要修改的字段，其余使用[默认值](#http-数据源)。例如：

```ts
import { z } from 'zod';

export const conversationDataSourceConfig: Partial<HttpConversationDataSourceOptions> = {
  endpoint: '/api',
  credentials: 'include',
  list: {
    url: '/business/chat/list',
    method: 'POST',
    body: {},
  },
  get: {
    url: '/business/chat/detail',
    method: 'POST',
    body: ({ id }) => ({ sessionId: id }),
  },
  delete: {
    url: '/business/chat/remove',
    method: 'POST',
    body: ({ id }) => ({ sessionId: id }),
    decode(value) {
      z.object({ code: z.literal(0) }).parse(value);
    },
  },
};
```

将这些字段合入已有配置。列表和详情的返回字段不同时，添加对应的 `decode`，见[响应字段解码](#响应字段解码)。

每个接口对象支持四个字段：

| 字段       | 用法                           |
| -------- | ---------------------------- |
| `url`    | 接口地址，支持字符串或回调                |
| `method` | HTTP 方法，如 `GET`、`POST`、`PUT` |
| `body`   | JSON 请求数据，支持直接传值或通过回调生成      |
| `decode` | 转换响应数据或检查业务返回码，失败时抛出错误       |

回调参数包含 `endpoint` 和可选的 `signal`；单条会话操作另有 `id`，重命名另有 `title`。`body`、`decode` 支持异步回调。

`url` 按填写的地址请求。需要拼接基础地址和会话 ID 时，使用回调：

```ts
get: {
  url: ({ endpoint, id }) => `${endpoint}/sessions/${encodeURIComponent(id)}`,
},
```

`body` 直接返回 JSON 数据，无需 `JSON.stringify()`。使用 GET/HEAD 时不要设置正文。

`decode` 接收响应 JSON。删除、重命名、归档和取消归档可在这里检查业务返回码；空响应传入 `undefined`。

## HTTP 数据源

以基础地址 `/api` 为例，完整默认请求如下。列表没有分页或关键词参数，当前 `list()` 契约一次返回完整数组，也没有下一页游标或加载更多入口。分页后端可以在自定义数据源内聚合所需结果；服务端搜索、无限滚动等交互还需要单独的项目界面与接入设计，仅修改 URL 或返回字段无法启用这些交互。

| 操作   | 请求                                       | 请求体                         | 成功响应                    |
| ---- | ---------------------------------------- | --------------------------- | ----------------------- |
| 列表   | `GET /api/conversations`                 | 无                           | 下方列表 JSON               |
| 详情   | `GET /api/conversations/{id}`            | 无                           | 下方详情 JSON               |
| 删除   | `DELETE /api/conversations/{id}`         | 无                           | 成功 HTTP 状态，包括 204；不解析正文 |
| 重命名  | `PATCH /api/conversations/{id}`          | JSON `{ "title": "新的会话名" }` | 成功 HTTP 状态，包括 204；不解析正文 |
| 归档   | `POST /api/conversations/{id}/archive`   | 无                           | 同上                      |
| 取消归档 | `POST /api/conversations/{id}/unarchive` | 无                           | 同上                      |

列表和详情的**直接格式**也可使用：

```json
{ "conversations": [{ "id": "thread-123", "title": "订单查询", "status": "regular" }] }
```

```json
{
  "id": "thread-123",
  "title": "订单查询",
  "state": {
    "values": {
      "messages": [
        { "id": "user-1", "type": "human", "content": "订单到了吗？" },
        { "id": "answer-1", "type": "ai", "content": "订单正在配送。" }
      ]
    }
  }
}
```

这些是 LangChain 历史消息，用户为 `type: 'human'`，助手为 `type: 'ai'`，不同于实时 AG-UI 的 `role` 消息。工具历史需保留 tool call 和结果的 ID 关系，不要全部压成文字。`id` 必须对应请求的 threadId；名称必需且非空。可选 `agentState` 是显式 AG-UI 状态，与历史 checkpoint 分开。

上述路径的 `{id}` 就是会话的 `threadId`。默认适配器还支持下方的业务响应包装；已有接口不符合这些格式时，使用后面的[响应字段解码](#响应字段解码)，无需修改数据库。

列表返回会话 ID 和展示信息；详情返回消息、状态及可用操作。默认适配或项目解码器的输出须符合 `conversation-service` 的公共契约，**不能只返回文本数组**。未接入服务时使用空数据源，刷新后不会自动恢复历史。

列表接口支持业务响应包装：

```json
{
  "returnCode": "SUC0000",
  "errorMsg": null,
  "body": {
    "total_conversations": 1,
    "conversations": [
      {
        "thread_id": "thread-123",
        "title": "示例会话",
        "message_count": 2,
        "last_message_time": ""
      }
    ]
  }
}
```

列表项的 `thread_id` 映射为 `id`，`title` 保留；`last_message_time` 有值时映射为 `updatedAt`，为空、`null` 或缺少时省略。`total_conversations`、`message_count` 是统计字段，不进入当前列表模型。业务失败或结构错误会报错，不会作为空列表处理。原有直接返回 `{ conversations: [{ id, title }] }` 的格式仍兼容。

列表项可返回 `status: "regular" | "archived"`，省略时按普通会话处理。列表需包含希望用户查看和恢复的已归档会话；它们显示在「已归档会话」区域，使用同一个搜索框过滤。两种列表响应格式都支持 `status`。

新会话在首次发送时，以第一条用户消息中的文字作为前端默认标题；多段文字按换行拼接并去除首尾空白，后续消息保留该标题。没有文字时继续使用默认展示。已有后端标题优先保留。刷新后以历史接口返回的 `title` 为准；需要持久化同一标题时，由后端按相同规则保存并返回。

详情接口支持业务响应包装：

```json
{
  "returnCode": "SUC0000",
  "errorMsg": null,
  "body": {
    "thread_id": "thread-123",
    "max_message_checkpoint": {
      "values": {
        "messages": [
          { "id": "msg-1", "type": "human", "content": "你好" },
          { "id": "msg-2", "type": "ai", "content": "你好，有什么可以帮你？" }
        ]
      }
    }
  }
}
```

`returnCode` 必须为 `SUC0000`，其他返回码会作为错误处理并带上 `errorMsg`。`body.thread_id` 映射为会话 ID；`body.title` 可选，缺少时显示 `thread_id`。快照仍按当前 `LangGraphStateSnapshotDto` 校验；HTTP 适配层也接受存储格式的 `channel_values`，同时存在时优先使用 `values`。消息字段及历史转换沿用当前版本，不根据后端示例更换 LangGraph 版本。`start_time`、`total_checkpoints` 等统计字段不参与消息恢复。

`body.agentState` 可选，**必须由后端显式返回**，不会从 checkpoint 的业务字段推断。原有直接返回 `{ id, title, state, agentState? }` 的格式仍兼容。

历史助手消息若以 `<think>…</think>` 开头，插件会将其中的内容显示为思考过程，其后的内容作为回复正文；未闭合但有内容的思考也会保留，只有空标记的记录不显示。用户消息和正文中的标签示例保持原样。工具调用与结果按 `tool_call_id` 关联；读取历史不会重新执行工具。

## 响应字段解码

假设列表返回 `{ "code": 0, "data": { "items": [{ "sessionId": "thread-123", "name": "订单查询" }] } }`，详情返回以下业务结构：

```json
{
  "code": 0,
  "data": {
    "sessionId": "thread-123",
    "name": "订单查询",
    "records": [
      { "id": "user-1", "speaker": "user", "text": "订单到了吗？" },
      { "id": "answer-1", "speaker": "assistant", "text": "订单正在配送。" }
    ]
  }
}
```

在 `services/conversations/http-data-source.ts` 中添加 Schema，并修改原配置对象，保留下方已有 `createHttpConversationDataSource()` 函数。`HttpConversationDataSourceOptions` 沿用该文件已有导入：

```ts
import { z } from 'zod';

const listSchema = z.object({
  code: z.literal(0),
  data: z.object({ items: z.array(z.object({
    sessionId: z.string().min(1), name: z.string().min(1),
  })) }),
});
const detailSchema = z.object({
  code: z.literal(0),
  data: z.object({
    sessionId: z.string().min(1), name: z.string().min(1),
    records: z.array(z.object({
      id: z.string().min(1),
      speaker: z.enum(['user', 'assistant']),
      text: z.string(),
    })),
  }),
});

export const conversationDataSourceConfig: Partial<HttpConversationDataSourceOptions> = {
  endpoint: '/business',
  credentials: 'include',
  headers: () => ({}), // 改为读取业务项目当前的用户凭据。
  list: {
    url: ({ endpoint }) => `${endpoint}/sessions`,
    decode(value) {
      return listSchema.parse(value).data.items.map(item => ({
        id: item.sessionId, title: item.name,
      }));
    },
  },
  get: {
    url: ({ endpoint, id }) => `${endpoint}/sessions/${encodeURIComponent(id)}`,
    decode(value) {
      const item = detailSchema.parse(value).data;
      return {
        id: item.sessionId, title: item.name,
        state: { values: { messages: item.records.map(record => ({
          id: record.id,
          type: record.speaker === 'user' ? 'human' : 'ai',
          content: record.text,
        })) } },
      };
    },
  },
};
```

示例转换文字历史；工具和多模态消息需保留对应结构及关联 ID。其他操作按需配置接口或隐藏入口。

## 自定义会话数据源

需要复用已有 SDK、Axios 模块或多步请求时，可以自行实现 `ConversationDataSource`。新建 `src/agent-ui/services/conversations/business-data-source.ts`，以下示例使用这三个接口：

| 接口                      | 请求体                             | 响应体                                                                                                   |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/business/chat/list`   | `{}`                            | `{ "code": 0, "data": { "items": [{ "sessionId": "thread-123", "name": "订单查询" }] } }`                 |
| `/business/chat/detail` | `{ "sessionId": "thread-123" }` | `{ "code": 0, "data": { "sessionId": "thread-123", "name": "订单查询", "records": [...] } }`，records 同上一节 |
| `/business/chat/remove` | `{ "sessionId": "thread-123" }` | `{ "code": 0 }`                                                                                       |

将上一节的 `listSchema`、`detailSchema` 移至项目 `services/conversations/business-schema.ts` 并导出，然后编写：

```ts
import { z } from 'zod';
import type { ConversationDataSource } from '@za38.03/agent-ui-plugins/conversation-service';
import { listSchema, detailSchema } from './business-schema';

async function post(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('HISTORY_REQUEST_FAILED');
  return response.json();
}

export const businessHistory: ConversationDataSource = {
  async list({ signal } = {}) {
    const result = listSchema.parse(await post('/business/chat/list', {}, signal));
    return result.data.items.map(item => ({ id: item.sessionId, title: item.name }));
  },
  async get(id, { signal } = {}) {
    const { data } = detailSchema.parse(await post('/business/chat/detail', { sessionId: id }, signal));
    if (data.sessionId !== id) throw new Error('HISTORY_THREAD_MISMATCH');
    return {
      id: data.sessionId, title: data.name,
      history: { format: 'langchain', messages: data.records.map(record => ({
        id: record.id, type: record.speaker === 'user' ? 'human' : 'ai', content: record.text,
      })) },
    };
  },
  async delete(id, { signal } = {}) {
    z.object({ code: z.literal(0) }).parse(
      await post('/business/chat/remove', { sessionId: id }, signal),
    );
  },
};
```

在 `src/AssistantPage.tsx` 注入：

```tsx
import { Agent } from './agent-ui';
import { businessHistory } from './agent-ui/services/conversations/business-data-source';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" conversationDataSource={businessHistory} />;
}
```

**注意返回类型不同：**&#x48;TTP `get.decode` 返回 `state.values.messages`；完整数据源 `get()` 返回 `history: { format: 'langchain', messages }`。不要把两种对象互换。

实现 `list/get/delete`，按需增加 `rename/archive/unarchive`。在函数内处理鉴权与错误，并将 `signal` 传给请求。聊天记录由业务后端保存。

列表和详情读取会收到用于取消旧请求的 `signal`。数据源类型也允许写操作接收 `signal`，但当前会话服务调用删除、重命名、归档和取消归档时没有传入取消信号，界面没有这些写操作的取消入口；需要超时控制时，在项目请求模块内实现。

## 初始化会话加载

需要初始化时打开已有会话，在 `<Agent />` 上传入 `initialThreadId`。项目会按该 ID 请求已配置的历史详情接口并加载消息；此参数只在初始化时生效。示例见[打开已有会话](/development/agent-options.md#打开已有会话)。

## 重命名、归档与取消归档

在 `rename/archive/unarchive` 对象中配置对应接口，写法与列表、详情、删除相同。

默认接受成功 HTTP 状态，包括 `204`。接口返回业务成功码时，在对应的 `decode` 中检查。

使用自定义数据源时，实现 `rename(id, title)`、`archive(id)`、`unarchive(id)`。列表接口需返回保存后的名称和归档状态。

不需要某个操作时，在 `plugins/conversation-thread-list/index.tsx` 中给已有列表组件设置 `itemProps.actions`。它是以 `rename`、`archive`、`unarchive`、`delete` 为键的布尔对象；传入时显式列出需要保留的操作。`showArchived={false}` 可隐藏归档区域。例如，保留 JSX 中已有的会话服务和数据参数，再设置这些属性：

```tsx
<CanonicalConversationThreadList
  {...props}
  itemProps={{ actions: {
    rename: true,
    archive: true,
    unarchive: true,
    delete: false,
  } }}
  showArchived={false}
/>
```

`CanonicalConversationThreadList` 沿用项目入口已有的组件导入。

## 验证

检查空列表、加载和删除失败、运行中切换、刷新后加载历史、取消以及账号切换。使用会话 ID 核对每条响应，避免旧会话内容进入新会话。
