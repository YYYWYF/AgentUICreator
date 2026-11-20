---
title: "接入历史会话服务"
---

# 接入历史会话服务

本页说明如何让会话列表和聊天记录使用你的业务后端。聊天记录由后端保存，前端负责读取和展示。

<figure className="plugin-preview">

![选中右侧历史会话后，左侧显示该会话的消息](/images/agent-ui/history-conversation.jpg)

<figcaption>本地演示：右侧列表的标题来自列表数据，点击“历史：基础会话”后，左侧加载对应详情中的消息。接入时分别检查 list() 和 get() 的结果。</figcaption>
</figure>

**先按现有项目选择一种接入方式，完成对应一节即可：**

| 你的项目现在是什么情况 | 从哪里开始 | 主要修改位置 |
| --- | --- | --- |
| 有后端接口，准备直接写请求 | [方式一：直接对接后端接口](#直接对接后端接口) | `services/conversations/data-source.ts` |
| 已有业务函数、Axios 实例或 SDK | [方式二：复用已有请求代码](#复用已有请求代码) | 同一个 `data-source.ts`，调用已有代码 |
| 已有实现 `list/get/delete` 的完整数据源对象 | [方式三：传入完整数据源](#传入完整数据源) | 挂载 `<Agent />` 的业务页面 |

前两种方式的文件位于 `src/agent-ui/` 下；源码目录不同时替换这个前缀。三种方式都保留 `conversation-data-source` 和 `conversation-service` 插件启用。

只想调整打开方式或列表按钮，直接看[会话行为配置](#会话行为配置)。需要核对字段时，再查阅末尾的[数据格式参考](#数据格式参考)。

## 方式一：直接对接后端接口 {#直接对接后端接口}

打开 `src/agent-ui/services/conversations/data-source.ts`。初始化已生成六个方法；按下面顺序修改。

<span id="改哪里"></span>
<span id="地址与鉴权配置"></span>
<span id="基础地址和鉴权"></span>

**第 1 步：设置基础地址和鉴权。**

修改文件顶部的 `conversationConnection`，例如历史接口的公共前缀为 `/api`：

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

配置后，已启用的会话数据源插件会自动创建并注册项目数据源。`<Agent endpoint="/api/agent" />` 配置的是实时对话地址，历史地址在这里单独设置。Vue/HTML 项目在 [React 生产工程](./service-integration#vue--html-服务适配位置)中修改后重新构建。

<span id="按接口配置请求与响应"></span>
<span id="响应字段解码"></span>
<span id="修改-url参数和响应转换"></span>

**第 2 步：找到与你的需求对应的方法。**

| 你要接入的功能 | 修改哪个方法 | 需要做什么 |
| --- | --- | --- |
| 加载会话列表 | `list()` | 修改请求，返回 `{ id, title, ... }` 数组 |
| 点击会话后加载聊天记录 | `get(id)` | 修改请求，返回 `{ id, title, history }` |
| 删除会话 | `delete(id)` | 调用删除接口，失败时抛错 |
| 重命名、归档、取消归档 | `rename/archive/unarchive` | 修改各自请求，失败时抛错 |

每个方法同时包含 URL、HTTP 方法、请求参数和响应转换。先修改 `list()` 和 `get()`，再处理需要保留的管理操作。

**第 3 步：按实际接口修改请求和返回值。**

只改地址时，修改对应方法中 `request()` 的第一个参数；只改参数时，修改同一请求的查询参数或 `body`。路径里拼接会话 ID 时使用 `encodeURIComponent(id)`。

后端字段与默认格式不同，就在收到响应后转换。例如列表返回 `data.items`，在 `list()` 中把它映射为 `{ id, title }` 数组。具体返回要求见[数据格式参考](#数据格式参考)。

<details class="dev-guide-details">
<summary>示例：把会话详情改为 POST 请求，并转换业务字段</summary>

假设业务详情接口为 `POST /business/chat/detail`，请求体为 `{ "sessionId": "thread-123" }`，响应如下：

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

在 `createConversationDataSource()` 返回的对象中替换 `get` 方法，保留其他方法。`request`、`assertResponseOk`、`readObject`、`readArray` 和 `readNonBlankString` 都沿用文件中的现有实现：

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

HTTP JSON 先作为 `unknown` 接收，再检查使用的字段。校验也可复用项目已有请求模块；复杂转换可拆为项目内的函数。

</details>

完成后，打开页面检查会话列表，点击一条记录确认消息能够加载，再检查你保留的管理操作。

## 方式二：复用已有请求代码 {#复用已有请求代码}

仍然编辑 `src/agent-ui/services/conversations/data-source.ts`。从项目业务模块导入已有函数、Axios 实例或 SDK，在对应方法里调用即可，保留现有的数据源注册设置。

### 已有业务函数 {#使用自己的业务函数}

下面假设已导入三个业务函数，且它们都接收包含可选 `signal` 的请求选项：

| 业务函数 | 返回结果 |
| --- | --- |
| `fetchConversationList` | `ConversationSummary[]` |
| `fetchConversationDetail` | `ConversationDetail` |
| `removeConversation` | 删除完成，无需返回内容 |

在 `createConversationDataSource()` 返回的对象中替换对应方法：

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

`ConversationSummary`、`ConversationDetail` 和 `ConversationDataSource` 可从 `@za38.03/agent-ui-plugins/conversation-service` 以 `import type` 导入，用于标注业务函数类型。

业务函数已返回上述格式时，可以直接返回；返回后端原始格式时，在对应方法中检查业务成功码，并按[数据格式参考](#数据格式参考)转换。

`rename/archive/unarchive` 同样在各自方法里调用业务函数。写操作使用 `await` 等待完成，成功无需返回内容；HTTP 或业务失败时抛错，由会话服务显示失败状态。列表和详情应将 `signal` 一直传到实际请求，以便切换会话时取消旧请求。

<span id="自定义会话数据源"></span>

### 已有 Axios 实例或 SDK {#使用自己的-axios-或-sdk}

导入项目已有实例，例如 `import { api } from '@/services/api'`，用它替换对应方法中的请求代码。下面假设 `api` 已设置基础地址和鉴权，详情接口为 `POST /chat/detail`。

<details class="dev-guide-details">
<summary>查看 Axios 请求及响应转换示例</summary>

先在文件中声明响应类型；项目已有接口类型时直接复用：

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

在 `createConversationDataSource()` 返回的对象中替换 `get` 方法：

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

</details>

`list/delete` 等方法也可分别替换。使用 SDK 时同样在对应方法中调用并转换结果，列表和详情读取应将 `signal` 传到实际请求。

**这一方式的地址和鉴权由你的请求代码负责。** 业务函数、Axios 或 SDK 沿用自身的 Cookie、Token、超时和拦截器；`conversationConnection.headers/credentials` 及默认 `request` 的预览代理不会自动应用到它们。完成后，检查实际请求的地址、鉴权和历史加载结果。

<span id="在业务页面传入完整数据源"></span>

## 方式三：传入完整数据源 {#传入完整数据源}

如果业务模块已经提供完整的 `ConversationDataSource` 对象，直接在挂载 `<Agent />` 的页面传入：

```tsx
import { Agent } from './agent-ui';
import { businessHistory } from './services/business-history';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" conversationDataSource={businessHistory} />;
}
```

`businessHistory` 是项目自己实现的对象，必需方法为 `list/get/delete`，`rename/archive/unarchive` 可选，类型从 `@za38.03/agent-ui-plugins/conversation-service` 导入。返回要求见[数据格式参考](#数据格式参考)。

显式传入的数据源替换该 Agent 使用的项目默认数据源。地址、鉴权和取消请求由这个对象处理；完成后检查列表和详情是否通过该对象加载。

<span id="按需配置"></span>

## 可选：调整会话行为 {#会话行为配置}

完成接入后，只展开与你的需求有关的配置。

<details class="dev-guide-details" id="初始化打开已有会话">
<summary>进入页面时，直接打开指定会话</summary>

在 `<Agent />` 传入 `initialThreadId="thread-123"`，初始化时请求该会话详情并加载消息，见[打开已有会话](./agent-options#打开已有会话)。

</details>

<details class="dev-guide-details" id="重命名归档与取消归档">
<summary>支持重命名、归档和取消归档</summary>

直接编辑对应方法的请求。操作成功后，列表接口应返回保存后的标题和归档状态。当前会话服务没有为这些写操作提供界面取消入口；需要超时控制时在项目请求代码中处理。

</details>

<details class="dev-guide-details" id="隐藏不需要的操作">
<summary>隐藏不需要的列表操作</summary>

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

</details>

<details class="dev-guide-details" id="分页和标题">
<summary>处理列表分页和会话标题</summary>

`list()` 一次返回完整数组，没有“加载更多”配置。分页后端可在方法中聚合结果；分页界面或服务端搜索需要另外开发。

刷新后的标题以历史接口的 `title` 为准。前端首次发送时默认使用第一条用户消息的文字作为标题；需要刷新后保持一致时，由后端保存并返回同一标题。

</details>

<details class="dev-guide-details" id="时间和业务分组">
<summary>按时间或业务分类显示历史会话</summary>

`list()` 可为每条记录返回 `updatedAt` 和 `group`。`updatedAt` 使用带时区的 ISO 时间，例如 `2026-11-18T08:00:00Z`，前端按浏览器所在时区划分日期；`group` 使用稳定业务值，例如 `work` / `study`。

默认列表按时间显示今天、昨天、更早。需要“近 7 天、近 30 天、更早”或“工作、学习、其他”时，在列表应用层使用[完整自定义分组示例](/plugins/conversation-thread-list#example-2)。只返回 group 不会改变默认列表，当前没有 groupBy 配置项。业务字段转换见[数据源示例](/plugins/conversation-data-source#example-1)。

</details>

<details class="dev-guide-details" id="刷新后继续观察长任务开发中">
<summary>刷新后继续观察长任务（开发中，暂不支持）</summary>

刷新页面后可以重新加载后端已保存的历史，但不能自动重新接入尚未结束的任务并继续显示输出。同一页面内隐藏助手或切换会话时的后台运行，见[后台 Thread](./multiple-agents#观察和控制后台-thread)。

</details>

<span id="http-数据源"></span>
<span id="方法需要返回什么"></span>

## 参考：返回格式与默认接口 {#数据格式参考}

不论选择哪种接入方式，数据源方法最终都要返回下面的结果，交给前端会话服务：

| 方法 | 返回结果 |
| --- | --- |
| `list()` | 会话数组 `[{ id, title, ... }]` |
| `get(id)` | 会话详情 `{ id, title, history }`；历史为 `{ format: 'langchain', messages }` |
| `delete(id)` | 成功无需返回内容，失败抛错 |
| `rename(id, title)` | 同上，可选方法 |
| `archive(id)`、`unarchive(id)` | 同上，可选方法 |

这是**前端方法的返回格式**。后端可保留现有接口，在项目方法里转换即可。生成的默认请求使用下面的 `returnCode/errorMsg/body` 格式。

用户消息中的 @、/ 标签依赖正文引用标记。保存和返回历史时应保留例如 `:user[张三]{name=employee_84721}`、`:command[总结]{name=summarize}` 的原文；前端加载后会重新渲染标签。`forwardedProps` 中的业务数据可以同时保存，但仅返回普通 `@张三` 或 `/总结` 文本不会恢复标签，见[引用与结构化数据](./composer-sources#插件提供数据composer-组装请求)。

下面的默认路径以 `conversationConnection.endpoint: '/api'` 为例。

<details class="dev-guide-details" id="会话列表">
<summary>默认会话列表：GET /api/conversations</summary>

后端响应示例：

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

| 字段 | 必填 | 转换规则 |
| --- | --- | --- |
| `thread_id` | 是 | 非空会话 ID，转换为 `id`，也就是 `threadId` |
| `title` | 是 | 非空展示名称 |
| `status` | 否 | `regular` 或 `archived`；省略时按普通会话处理 |
| `last_message_time` | 否 | 非空时转换为 `updatedAt`；空字符串、`null` 或缺少时省略 |

`returnCode` 必须为 `SUC0000`；其他返回码会抛错并保留 `errorMsg`，不会当成空列表。

`total_conversations`、`message_count` 是统计字段，不进入会话服务的列表模型。需要显示已归档会话时，列表也要包含这些记录，并设置 `status: "archived"`。

</details>

<details class="dev-guide-details" id="会话详情">
<summary>默认会话详情：GET /api/conversations/&#123;id&#125;</summary>

后端响应示例：

```json
{
  "returnCode": "SUC0000",
  "errorMsg": null,
  "body": {
    "thread_id": "thread-123",
    "max_message_checkpoint": {
      "channel_values": {
        "messages": [
          { "id": "user-1", "type": "human", "content": "订单到了吗？" },
          { "id": "answer-1", "type": "ai", "content": "订单正在配送。" }
        ]
      }
    }
  }
}
```

`returnCode` 必须为 `SUC0000`；其他返回码会抛错并保留 `errorMsg`，不会当成空历史。

历史响应字段按以下规则处理：

- **身份与标题**：`body.thread_id` 必须与请求的会话 ID 一致；`body.title` 可选，缺少时使用 `thread_id`。
- **消息来源**：从 `max_message_checkpoint.channel_values.messages` 读取。
- **顺序与空值**：消息按时间排列；空会话的 `messages` 可省略或返回 `[]`，消息 ID 应保持稳定。

项目 `get()` 将上述响应转换为 `{ id, title, history: { format: 'langchain', messages } }`。可选的 `body.agentState` 必须由后端显式返回，项目方法会透传它，不从 checkpoint 的业务字段推断。`start_time`、`total_checkpoints` 等统计字段不参与消息恢复。

历史使用 LangChain 消息格式：用户为 `human`，助手为 `ai`，与实时 AG-UI 的 `role` 字段不同。以上仅展示文字；工具调用和图片、附件应保留相应结构及关联 ID。附件示例见[刷新后的历史回显](./attachment-upload#刷新后的历史回显)。

</details>

<details class="dev-guide-details" id="默认管理接口">
<summary>默认删除、重命名和归档接口</summary>

| 方法 | 默认请求 | JSON 请求体 |
| --- | --- | --- |
| `delete(id)` | `DELETE /api/conversations/{id}` | 无 |
| `rename(id, title)` | `PATCH /api/conversations/{id}` | `{ "title": "新的名称" }` |
| `archive(id)` | `POST /api/conversations/{id}/archive` | 无 |
| `unarchive(id)` | `POST /api/conversations/{id}/unarchive` | 无 |

默认方法接受成功 HTTP 状态，包括 `204`，不读取响应正文。后端通过 JSON 业务码表示成功或失败时，在对应方法中读取并检查，失败抛错。

</details>
