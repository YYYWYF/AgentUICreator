---
title: "接入历史会话"
---

# 接入历史会话

历史服务提供会话列表和聊天记录。**读取历史与继续对话是不同能力**：要继续提问，还需相应的 Agent 数据和接口。相关参数见[Agent 参数与配置](/development/agent-options)。

## 地址与鉴权配置

打开 `src/agent-ui/services/conversations/http-data-source.ts`，修改已有的 `conversationDataSourceConfig`，保留其余工厂委托代码。初始化选了其他源码目录时替换此前缀。配置经项目的 `plugins/conversation-data-source` 入口调用所选插件实现；默认 HTTP 请求与响应转换由插件提供。Web Component 在 React 生产工程中修改同一文件，再重新构建。

| 内容 | 项目文件 |
| --- | --- |
| 历史 API 基础地址 | `conversationDataSourceConfig.endpoint`，或创建数据源时传入的 `endpoint`。未配置地址且未传入自定义数据源时使用空数据源。 |
| 列表、详情、删除的路径 | `conversationDataSourceConfig.routes` 中的 `listUrl`、`detailUrl`、`deleteUrl`。 |
| 鉴权与 Cookie | `headers` 可传入按请求读取当前登录凭据的函数；`credentials` 控制 Cookie 等浏览器凭据。 |
| 重命名、归档与取消归档 | `routes.renameUrl`、`routes.archiveUrl`、`routes.unarchiveUrl`。默认请求方法及内容见下文。 |
| 特殊请求方法、请求内容或传输 | 项目 `fetch` 覆盖，或传入完整的自定义 `ConversationDataSource`。 |
| 自定义列表、详情响应格式 | 项目 `decodeList`、`decodeDetail` 覆盖；未配置时使用插件的默认格式适配。 |

例如，在项目文件中修改已有配置，保留其余委托代码：

```ts
export const conversationDataSourceConfig: Partial<HttpConversationDataSourceOptions> = {
  endpoint: '/api',
  credentials: 'include',
  headers: () => ({}), // 在这里沿用项目现有的鉴权读取逻辑。
  routes: {
    deleteUrl: (base, id) => `${base}/history/${encodeURIComponent(id)}`,
  },
};
```

`decodeList` 接收响应 JSON，返回 `ConversationSummary[]`；`decodeDetail` 返回 `ConversationDetailResponse`，其中消息位于 `state.values.messages`。两者均可异步返回，输出会按公共会话契约校验。自己的数据库可以使用不同的历史接口格式，通过这两个解码器完成转换。契约类型从 `@za38.03/agent-ui-plugins/conversation-service` 导入。

单独修改删除路径只影响删除操作；修改基础地址或共享鉴权会同时影响多个操作。项目配置编辑无需源码接管。默认请求已处理 HTTP 状态码和取消；业务响应适配方式见下文。

在使用 `Agent` 的页面中接入：

```tsx
import { Agent } from './agent-ui';
import { createHttpConversationDataSource } from './agent-ui/services/conversations';

const history = createHttpConversationDataSource({ endpoint: '/api' });

export function App() {
  return <Agent conversationDataSource={history} />;
}
```

保留数据源和会话服务插件启用。`Agent endpoint` 仍用于 AG-UI 地址。显式传入的 `conversationDataSource` 覆盖已启用数据源插件的服务值；也可只配置项目的 `conversationDataSourceConfig.endpoint`，由插件应用层创建数据源。

## HTTP 数据源

以基础地址 `/api` 为例，完整默认请求如下。列表没有分页或关键词参数，当前数据源一次返回列表；需要业务筛选时在项目数据源内适配。

| 操作 | 请求 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| 列表 | `GET /api/conversations` | 无 | 下方列表 JSON |
| 详情 | `GET /api/conversations/{id}` | 无 | 下方详情 JSON |
| 删除 | `DELETE /api/conversations/{id}` | 无 | 成功 HTTP 状态，包括 204；不解析正文 |
| 重命名 | `PATCH /api/conversations/{id}` | JSON `{ "title": "新的会话名" }` | 成功 HTTP 状态，包括 204；不解析正文 |
| 归档 | `POST /api/conversations/{id}/archive` | 无 | 同上 |
| 取消归档 | `POST /api/conversations/{id}/unarchive` | 无 | 同上 |

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
  routes: {
    listUrl: base => `${base}/sessions`,
    detailUrl: (base, id) => `${base}/sessions/${encodeURIComponent(id)}`,
  },
  decodeList(value) {
    return listSchema.parse(value).data.items.map(item => ({
      id: item.sessionId, title: item.name,
    }));
  },
  decodeDetail(value) {
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
};
```

示例只适配文字历史；工具、多模态等应扩展转换，保留结构和关联 ID。项目已有 `zod` 可直接复用。两个解码器接收已解析的 JSON，输出仍按公共契约校验；解析失败应报错，不能回退成空列表。示例只覆盖读取路由，其他操作仍使用默认路径，启用前补充其真实路由或隐藏不支持的操作。

## 自定义会话数据源

`routes` 只改 URL，`decodeList/decodeDetail` 只改响应，不会把 GET 改成 POST。需要不同方法、请求体、Axios 或业务成功码检查时，新建 `src/agent-ui/services/conversations/business-data-source.ts`。下面示例接口均用 POST JSON：

| 接口 | 请求体 | 响应体 |
| --- | --- | --- |
| `/business/chat/list` | `{}` | `{ "code": 0, "data": { "items": [{ "sessionId": "thread-123", "name": "订单查询" }] } }` |
| `/business/chat/detail` | `{ "sessionId": "thread-123" }` | `{ "code": 0, "data": { "sessionId": "thread-123", "name": "订单查询", "records": [...] } }`，records 同上一节 |
| `/business/chat/remove` | `{ "sessionId": "thread-123" }` | `{ "code": 0 }` |

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

**注意返回类型不同：**HTTP `decodeDetail` 返回 `state.values.messages`；完整数据源 `get()` 返回 `history: { format: 'langchain', messages }`。不要把两种对象互换。

`list/get/delete` 必需，`rename/archive/unarchive` 可选；均可接收可选的 `{ signal }`。在函数内负责鉴权和业务失败判断，取消传给实际请求。需要额外操作时在这个对象中实现，签名见下一节；没有实现的操作应在列表应用层隐藏。这个数据源没有 `save/append` 写消息接口：对话持久化由业务 Agent 后端按 threadId 完成，前端读取历史不代替保存消息。

## 初始化会话加载

需要初始化时打开已有会话，在 `<Agent />` 上传入 `initialThreadId`。项目会按该 ID 请求已配置的历史详情接口并加载消息；此参数只在初始化时生效。示例见[打开已有会话](/development/agent-options#打开已有会话)。

## 重命名、归档与取消归档

会话列表提供这些操作，是否接入由业务工程决定。默认请求见[HTTP 数据源表](#http-数据源)；路径通过项目的 `routes` 覆盖，方法和请求内容通过 `fetch` 或自定义数据源适配。

以上操作默认只检查 HTTP 状态，接受成功状态（包括 `204`）；业务错误应使用失败 HTTP 状态。若接口以成功 HTTP 状态返回业务失败包装，需要在项目的 `fetch` 覆盖或自定义数据源中校验业务返回码并抛出失败。`decodeList`、`decodeDetail` 不处理这些操作的响应。请求沿用项目配置的鉴权和凭据设置。

使用自定义数据源时，实现 `ConversationDataSource` 的可选 `rename(id, title)`、`archive(id)`、`unarchive(id)`；这些方法与既有 `list`、`get`、`delete` 共用项目服务。持久化成功后，前端才保留最终结果；接口缺失或失败会报错，不会作为成功处理。刷新页面后的名称和归档状态以列表接口为准。

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

`CanonicalConversationThreadList` 沿用该项目入口已有的公开组件导入。`conversation-service` 管理列表、详情缓存及历史选择，并提供通用 ThreadBinding 工厂；Runtime 消费该接口，装载标准消息并运行会话，无需在项目中复制内部线程绑定文件。

项目配置和自定义解码器不会被 npm 升级覆盖；默认格式适配随 Plugins npm 实现更新。已接管的插件实现需要单独进行源码同步，合并时保留用户定制并验证公共契约。已有工程可能仍拥有完整 HTTP 实现或旧绑定，npm 升级不会自动迁移这些文件；接入时先检查现有代码，保留业务路由、鉴权与源码 BASE。

## 验证

检查空列表、加载和删除失败、运行中切换、刷新后加载历史、取消以及账号切换。使用会话 ID 核对每条响应，避免旧会话内容进入新会话。
