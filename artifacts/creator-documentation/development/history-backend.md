# 接入历史会话服务

历史接口的请求和响应转换都在项目的 `src/agent-ui/services/conversations/data-source.ts` 中。初始化已生成 `list/get/delete/rename/archive/unarchive` 六个方法，直接修改对应方法即可。

聊天记录由业务后端保存。以下路径以 `src/agent-ui/` 为起点，源码目录不同时替换这个前缀。

## 改哪里

| 需要修改的内容                | 修改位置                                          |
| ---------------------- | --------------------------------------------- |
| 基础地址、Cookie、鉴权请求头      | `data-source.ts` 顶部的 `conversationConnection` |
| 某个接口的 URL、HTTP 方法、请求参数 | 对应的 `list/get/delete/...` 方法                  |
| 返回字段、业务成功码、消息格式        | 对应方法收到响应后的转换代码                                |
| 调用已有业务函数               | 在对应方法中调用；返回格式不同时，在该方法里转换                      |
| 使用自己的 Axios 或 SDK      | 直接替换对应方法中的请求代码                                |

<span id="地址与鉴权配置" />

### 基础地址和鉴权

修改 `data-source.ts` 顶部的配置，保留其他代码：

```ts
export const conversationConnection: {
  endpoint?: string;
  credentials: RequestCredentials;
  headers: () => HeadersInit;
} = {
  endpoint: '/api',
  credentials: 'include',
  headers: () => ({}),
};
```

`headers` 每次请求都会调用。需要 Token 时，改为读取项目已有的登录凭据，例如 `headers: () => ({ Authorization: getAuthorization() })`，其中 `getAuthorization` 使用业务项目已有实现。跨域 Cookie 还需要后端允许跨域凭据。

配置基础地址后，已启用的会话数据源插件会自动创建并注册项目数据源。保留 `conversation-data-source` 和 `conversation-service` 插件启用。

`<Agent endpoint="/api/agent" />` 配置实时对话地址；历史接口地址在上述配置中设置。Vue/HTML 项目在 React 生产工程中修改后重新构建，见[服务适配位置](/development/service-integration.md#vue--html-服务适配位置)。

<span id="http-数据源" />

## 方法需要返回什么

| 方法                            | 返回结果                          |
| ----------------------------- | ----------------------------- |
| `list()`                      | 会话数组 `[{ id, title, ... }]`   |
| `get(id)`                     | 会话详情 `{ id, title, history }` |
| `delete(id)`                  | 成功无需返回内容，失败抛错                 |
| `rename(id, title)`           | 同上                            |
| `archive(id)`、`unarchive(id)` | 同上                            |

这些是项目数据源转换后交给会话服务的返回值。后端接口继续使用下面约定的 `returnCode/errorMsg/body` 格式；`data-source.ts` 使用普通 TypeScript 类型和必要的字段检查，负责校验业务成功码和转换字段，不直接使用 Zod。

### 会话列表

默认 `list()` 请求 `GET /api/conversations`，后端返回：

```json
{
  "returnCode": "SUC0000",
  "errorMsg": null,
  "body": {
    "total_conversations": 1,
    "conversations": [
      {
        "thread_id": "thread-123",
        "title": "订单查询",
        "status": "regular",
        "message_count": 2,
        "last_message_time": "2026-11-16T08:00:00Z"
      }
    ]
  }
}
```

| 字段                  | 必填 | 说明                                    |
| ------------------- | -- | ------------------------------------- |
| `thread_id`         | 是  | 非空会话 ID，转换为数据源的 `id`，也就是 `threadId`   |
| `title`             | 是  | 非空展示名称                                |
| `status`            | 否  | `regular` 或 `archived`；省略时按普通会话处理     |
| `last_message_time` | 否  | 非空时转换为 `updatedAt`；空字符串、`null` 或缺少时省略 |

`total_conversations`、`message_count` 是统计字段，不进入会话服务的列表模型。需要显示已归档会话时，列表也要包含这些记录，并设置 `status: "archived"`。

### 会话详情

默认 `get(id)` 请求 `GET /api/conversations/{id}`，后端返回：

```json
{
  "returnCode": "SUC0000",
  "errorMsg": null,
  "body": {
    "thread_id": "thread-123",
    "max_message_checkpoint": {
      "values": {
        "messages": [
          { "id": "user-1", "type": "human", "content": "订单到了吗？" },
          { "id": "answer-1", "type": "ai", "content": "订单正在配送。" }
        ]
      }
    }
  }
}
```

列表和详情的 `returnCode` 必须为 `SUC0000`；其他返回码会抛错并保留 `errorMsg`，不会当成空结果。

`body.thread_id` 必须与请求的会话 ID 一致。`body.title` 可选，缺少时使用 `thread_id`。项目方法从 `max_message_checkpoint.values.messages` 读取历史；也接受存储字段 `channel_values`，两者同时存在时优先使用 `values`。消息按时间顺序排列，空会话的 `messages` 可省略或返回 `[]`，消息 ID 应保持稳定。

项目 `get()` 将上述响应转换为 `{ id, title, history: { format: 'langchain', messages } }`。这是前端会话服务的内部契约，无需后端改成这个格式。可选的 `body.agentState` 必须由后端显式返回，项目方法会透传它，不从 checkpoint 的业务字段推断。`start_time`、`total_checkpoints` 等统计字段不参与消息恢复。

历史使用 LangChain 消息格式：用户为 `human`，助手为 `ai`，与实时 AG-UI 的 `role` 字段不同。以上仅展示文字；工具调用和图片、附件应保留相应结构及关联 ID。附件示例见[刷新后的历史回显](/development/attachment-upload.md#刷新后的历史回显)。

### 默认管理接口

| 方法                  | 默认请求                                     | JSON 请求体              |
| ------------------- | ---------------------------------------- | --------------------- |
| `delete(id)`        | `DELETE /api/conversations/{id}`         | 无                     |
| `rename(id, title)` | `PATCH /api/conversations/{id}`          | `{ "title": "新的名称" }` |
| `archive(id)`       | `POST /api/conversations/{id}/archive`   | 无                     |
| `unarchive(id)`     | `POST /api/conversations/{id}/unarchive` | 无                     |

默认方法接受成功 HTTP 状态，包括 `204`，不读取响应正文。后端通过 JSON 业务码表示成功或失败时，在对应方法中读取并检查，失败抛错。

<span id="按接口配置请求与响应" />
<span id="响应字段解码" />

## 修改 URL、参数和响应转换

例如业务详情接口要求：

```text
POST /business/chat/detail
```

请求体：

```json
{ "sessionId": "thread-123" }
```

响应：

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

在 `data-source.ts` 中声明业务响应类型；项目已有接口类型时直接复用：

```ts
interface BusinessDetailResponse {
  code: number;
  data: {
    sessionId: string;
    name: string;
    records: Array<{
      id: string;
      speaker: 'user' | 'assistant';
      text: string;
    }>;
  };
}
```

将生成对象中的 `get` 方法替换成下面的方法，其他方法保留。`request` 是此文件已有的请求函数，`assertResponseOk`、`readObject`、`readArray` 和 `readNonBlankString` 沿用此文件已有函数：

```ts
async get(id, { signal } = {}) {
  const headers = new Headers(conversationConnection.headers());
  headers.set('Content-Type', 'application/json');
  const response = await request('/business/chat/detail', {
    method: 'POST',
    credentials: conversationConnection.credentials,
    headers,
    ...(signal === undefined ? {} : { signal }),
    body: JSON.stringify({ sessionId: id }),
  });
  await assertResponseOk(response);
  const value: unknown = await response.json();
  const result = readObject(value);
  if (result.code !== 0) throw new Error('HISTORY_DETAIL_FAILED');
  const data = readObject(result.data);
  if (data.sessionId !== id) throw new Error('HISTORY_THREAD_MISMATCH');

  return {
    id,
    title: readNonBlankString(data.name),
    history: {
      format: 'langchain',
      messages: readArray(data.records).map(value => {
        const record = readObject(value);
        if ((record.speaker !== 'user' && record.speaker !== 'assistant')
          || typeof record.text !== 'string') throw new Error('HISTORY_MESSAGE_INVALID');
        return {
          id: readNonBlankString(record.id),
          type: record.speaker === 'user' ? 'human' : 'ai',
          content: record.text,
        };
      }),
    },
  };
},
```

这个方法同时决定请求地址、参数和返回转换。HTTP JSON 先作为 `unknown` 接收，再检查需要使用的字段；校验也可复用项目已有请求模块。需要拆分复杂转换时，将函数放在项目文件中再调用即可。

只改 URL 时，直接改 `request()` 的第一个参数。拼接会话 ID 时使用 `encodeURIComponent(id)`。

列表同样在 `list()` 中转换：例如另一业务接口返回 `data.items`，就在该方法中映射为 `{ id, title }` 数组。默认项目方法显式处理上文约定的 `returnCode/body`；其他格式按实际接口修改对应方法，不做包装格式自动识别，也不要求后端迁移接口。

## 使用自己的业务函数

直接在 `data-source.ts` 的对应方法中调用已有业务函数即可。共享的鉴权、Axios 实例和公共函数可以放在文件顶部，或从项目已有业务模块导入。

例如，假设已导入三个业务函数：`fetchConversationList` 返回 `ConversationSummary[]`，`fetchConversationDetail` 返回 `ConversationDetail`，`removeConversation` 删除指定会话；它们都接收包含可选 `signal` 的请求选项。替换生成对象中的三个方法，保留其他方法和现有数据源注册设置：

```ts
async list({ signal } = {}) {
  return fetchConversationList(signal === undefined ? {} : { signal });
},
async get(id, { signal } = {}) {
  return fetchConversationDetail(id, signal === undefined ? {} : { signal });
},
async delete(id, { signal } = {}) {
  await removeConversation(id, signal === undefined ? {} : { signal });
},
```

`ConversationSummary`、`ConversationDetail` 和 `ConversationDataSource` 可从 `@za38.03/agent-ui-plugins/conversation-service` 以 `import type` 导入，用于标注业务函数类型，不需要编写 Zod Schema。

业务函数已返回统一格式时，可以直接返回；仍返回 `returnCode/body` 等后端原始格式时，在对应方法中检查业务成功码并转换为[方法要求的结果](#方法需要返回什么)。保持已有后端接口约定。

`rename/archive/unarchive` 同样在各自方法里调用业务函数。写操作使用 `await` 等待完成，成功无需返回内容；HTTP 或业务失败时抛错，由会话服务显示失败状态。列表和详情应将 `signal` 一直传到实际请求，以便切换会话时取消旧请求。

业务函数使用自己的地址、鉴权和请求封装；`conversationConnection.headers/credentials` 以及默认 `request` 的预览代理不会自动应用到这些函数。

<span id="自定义会话数据源" />

## 使用自己的 Axios 或 SDK

还是编辑 `data-source.ts`，导入项目已有的 Axios 实例，例如 `import { api } from '@/services/api'`。下面假设该实例已经设置业务基础地址、鉴权和拦截器，详情接口继续使用上一节的业务格式。

替换 `get` 方法：

```ts
async get(id, { signal } = {}) {
  const { data: result } = await api.post<BusinessDetailResponse>(
    '/chat/detail',
    { sessionId: id },
    signal === undefined ? {} : { signal },
  );
  if (result.code !== 0) throw new Error('HISTORY_DETAIL_FAILED');
  if (result.data.sessionId !== id) throw new Error('HISTORY_THREAD_MISMATCH');

  return {
    id: result.data.sessionId,
    title: result.data.name,
    history: {
      format: 'langchain',
      messages: result.data.records.map(record => ({
        id: record.id,
        type: record.speaker === 'user' ? 'human' : 'ai',
        content: record.text,
      })),
    },
  };
},
```

这时请求完全由自己的 Axios 实例发送。鉴权、Cookie、超时和拦截器沿用该实例，`conversationConnection.headers/credentials` 不会自动应用到 Axios。`list/delete` 等方法也可分别替换；列表和详情读取应透传 `signal`，切换会话时取消旧请求。Axios/SDK 使用自己配置的请求地址；默认 `request` 提供的预览代理不会自动应用到它们。

### 在业务页面传入完整数据源

已有业务数据源时，可直接传给 `Agent`。对象实现 `ConversationDataSource`，返回格式与上文相同：

```tsx
import { Agent } from './agent-ui';
import { businessHistory } from './services/business-history';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" conversationDataSource={businessHistory} />;
}
```

`businessHistory` 是项目自己实现的对象，必需方法为 `list/get/delete`，其余三个操作可选。显式传入的数据源替换该 Agent 使用的项目默认数据源。

## 按需配置

### 初始化打开已有会话

在 `<Agent />` 传入 `initialThreadId="thread-123"`，初始化时请求该会话详情并加载消息，见[打开已有会话](/development/agent-options.md#打开已有会话)。

### 重命名、归档与取消归档

直接编辑对应方法的请求。操作成功后，列表接口应返回保存后的标题和归档状态。当前会话服务没有为这些写操作提供界面取消入口；需要超时控制时在项目请求代码中处理。

### 隐藏不需要的操作

在 `plugins/conversation-thread-list/index.tsx` 的已有列表组件上设置属性，保留原有导入和其他参数。例如只保留删除：

```tsx
<CanonicalConversationThreadList
  {...props}
  itemProps={{ actions: {
    rename: false,
    archive: false,
    unarchive: false,
    delete: true,
  } }}
  showArchived={false}
/>
```

### 分页和标题

`list()` 一次返回完整数组，没有“加载更多”配置。分页后端可在方法中聚合结果；分页界面或服务端搜索需要另外开发。

刷新后的标题以历史接口的 `title` 为准。前端首次发送时默认使用第一条用户消息的文字作为标题；需要刷新后保持一致时，由后端保存并返回同一标题。
