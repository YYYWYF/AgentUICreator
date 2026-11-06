---
title: "接入历史会话"
---

# 接入历史会话

历史服务提供会话列表和聊天记录。**读取历史与继续对话是不同能力**：要继续提问，还需相应的 Agent 数据和接口。相关参数见[Agent 参数与配置](/development/agent-options)。

## 地址与鉴权配置

历史列表、详情、删除的 URL 和鉴权放在生成项目的实现中，由 Creator 接入或修改。创建数据源后，通过 React `Agent` 的 `conversationDataSource` 属性传入；Web Component 的生产工程也维护自己的这份实现。

| 内容 | 项目文件 |
| --- | --- |
| 历史 API 基础地址 | 创建数据源时的 `endpoint`，未传入数据源时列表为空。 |
| 列表、详情、删除的路径及请求头 | `services/conversations/http-data-source.ts` 中的 `conversationRequests`。鉴权函数在每次请求时读取当前登录凭据。 |
| 重命名、归档与取消归档 | 同一个 HTTP 实现文件中的 `renameUrl`、`archiveUrl`、`unarchiveUrl` 及对应请求方法。按业务已有接口调整。 |
| 特殊请求或响应格式 | 同一个 HTTP 实现文件，Creator 按业务接口适配。 |

Creator 按请求直接修改并验证项目中的历史 HTTP 实现，说明受影响的操作。单独修改删除路径通常只影响删除操作；修改基础地址或共享鉴权可能同时影响列表和详情。项目 Service 契约与实现修改不单独弹审批；可选 preflight 工具检查拓扑、公共声明和文件版本。

路径相对于生成的 Agent UI 源码目录。通用请求已处理状态码、响应转换和取消；默认接口格式见下文的 HTTP 数据源说明。

```text
请接入或修改会话历史：
列表：【URL】，详情：【URL】，删除：【URL】。
鉴权：【沿用当前登录凭据】，请求和响应示例：【粘贴接口说明】。
请修改项目里的历史服务实现，保留现有会话交互。
```

在使用 `Agent` 的页面中接入：

```tsx
import { Agent } from './agent-ui';
import { createHttpConversationDataSource } from './agent-ui/services/conversations';

const history = createHttpConversationDataSource({ endpoint: '/api' });

export function App() {
  return <Agent conversationDataSource={history} />;
}
```

保留已启用的历史数据源插件。`Agent endpoint` 仍用于 AG-UI 地址，历史请求由传入的数据源实现。

## HTTP 数据源

按上述位置设置 API 地址。以 `/api` 为例，现有数据源请求 `GET /api/conversations`（列表）、`GET /api/conversation/{id}`（详情）及 `DELETE /api/conversations/{id}`（删除）。其中 `id` 就是会话的 `threadId`。

列表返回会话 ID 和展示信息；详情返回消息、状态及可用操作。返回值须符合项目数据源的类型定义，**不能只返回文本数组**。未接入服务时使用空数据源，刷新后不会自动恢复历史。

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

## 初始化时打开已有会话

需要初始化时打开已有会话，在 `<Agent />` 上传入 `initialThreadId`。项目会按该 ID 请求已配置的历史详情接口并加载消息；此参数只在初始化时生效。示例见[打开已有会话](/development/agent-options#打开已有会话)。

## 重命名、归档与取消归档

会话列表提供这些操作，是否接入由业务工程决定。HTTP 模板以 `/api` 为基础地址时，使用以下默认约定；它们不是对业务后端路由的要求，在 `services/conversations/http-data-source.ts` 中按实际接口修改：

| 操作 | 模板请求 | 请求内容 |
| --- | --- | --- |
| 重命名 | `PATCH /api/conversations/{id}` | JSON `{ "title": "新的会话名" }` |
| 归档 | `POST /api/conversations/{id}/archive` | 无正文 |
| 取消归档 | `POST /api/conversations/{id}/unarchive` | 无正文 |

以上操作接受成功 HTTP 状态，包括 `204`。业务错误使用失败 HTTP 状态；采用自定义业务响应包装时，在 HTTP 实现中校验业务返回码并抛出失败。请求沿用同一实现中的鉴权和凭据设置。

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

`CanonicalConversationThreadList` 沿用该项目入口已有的公开组件导入。已有工程的服务实现和绑定代码属于项目文件，仅升级 npm 包不会自动补齐。接入时检查 `services/conversations/` 和 `Agent.conversationDataSource` 的绑定，保留现有业务路由、鉴权和定制。新工程的通用历史绑定由 Runtime `/ui` 提供，无需复制内部线程绑定文件。

## 验证

检查空列表、加载和删除失败、运行中切换、刷新后加载历史、取消以及账号切换。使用会话 ID 核对每条响应，避免旧会话内容进入新会话。
