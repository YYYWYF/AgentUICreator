# 会话数据源（conversation-data-source）

## 功能与效果

将业务历史响应映射为会话列表和详情，并提供删除、重命名及归档方法。

### 历史数据接入

<figure className="plugin-preview">

![历史数据接入界面](/images/plugins/conversation-thread-list.png)

<figcaption>服务联动后的界面；本插件本身没有独立界面。</figcaption>
</figure>

## 修改与启用

### 需要提供什么 \{#需要提供什么}

| 信息      | 说明                          |
| ------- | --------------------------- |
| 接口地址    | 列表、详情、删除；需要重命名或归档时，再提供相应接口。 |
| HTTP 方法 | 各接口使用的 GET、POST 等方法。        |
| 鉴权方式    | 如何沿用现有登录态、请求头或 Cookie。      |
| 请求和响应示例 | 包括成功结果、错误结果、会话 ID 和消息结构。    |
| 需要开放的操作 | 是否允许删除、重命名、归档及取消归档。         |

历史记录需要由业务后端保存。读取历史和继续对话是不同能力；需要继续提问或恢复任务时，也要说明 Agent 接口支持的方式。

<span id="手动接入"></span>

接入时保留数据源和会话服务插件启用，按自己的接口选择配置或适配方式：

- 修改基础地址和鉴权：[地址与鉴权配置](/development/history-backend.md#地址与鉴权配置)。
- 核对方法返回格式：[方法需要返回什么](/development/history-backend.md#方法需要返回什么)。
- 修改 URL、请求参数和响应字段：[编辑项目方法](/development/history-backend.md#修改-url参数和响应转换)。
- 调用已有业务函数：[在各方法中委托业务函数](/development/history-backend.md#使用自己的业务函数)。
- 使用已有 Axios 或 SDK：[替换请求代码](/development/history-backend.md#使用自己的-axios-或-sdk)。

## 数据来源与显示条件

项目实现 `list/get/delete/rename/archive/unarchive`，其中 `list()` 返回 `ConversationSummary[]` 或分页结果 `{ conversations, nextCursor }`，`get()` 返回包含 `history` 的 `ConversationDetail`。业务接口响应由项目映射，完整结构见[历史会话后端接入](/development/history-backend.md)。

## 常见定制

<span id="常见需求"></span>

<span id="代码示例"></span>

### 转换业务列表的时间和分类 \{#转换业务列表的时间和分类}

<span id="example-1"></span>

这是收到业务接口响应之后的转换函数，可由项目 list() 调用。服务端标题属于业务数据；无需用界面文案替换。设置 group 本身不改变默认分组，列表应用层使用[自定义分组示例](/plugins/conversation-thread-list.md#example-2)。

```tsx
import type { ConversationSummary } from '@za38.03/agent-ui-plugins/conversation-service';

interface BusinessRow {
  sessionId: string;
  name: string;
  category?: string;
  lastActivity?: string;
}
export function mapConversation(row: BusinessRow): ConversationSummary {
  return {
    id: row.sessionId, title: row.name,
    ...(row.category ? { group: row.category } : {}),
    ...(row.lastActivity ? { updatedAt: row.lastActivity } : {}),
  };
}
```

<span id="example-2"></span>

### 标记不可打开的记录 \{#标记不可打开的记录}

disabled 是前端选择限制，真实权限仍由业务接口校验。不要仅通过隐藏菜单来表达记录权限。

```tsx
import type { ConversationSummary } from '@za38.03/agent-ui-plugins/conversation-service';

export function applyAccess(rows: readonly ConversationSummary[], allowedIds: ReadonlySet<string>) {
  return rows.map(row => ({ ...row, disabled: !allowedIds.has(row.id) }));
}
```

### 独立读取历史列表 \{#独立读取历史列表}

组件与服务位于同一 Agent，并声明 `agent-ui.conversation-data-source` 依赖。

```tsx
import { useEffect, useState } from 'react';
import { usePluginService } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, type ConversationDataSource }
  from '@za38.03/agent-ui-plugins/conversation-service';

export function IndependentHistoryCount() {
  const source = usePluginService<ConversationDataSource>(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCount(null);
    void source?.list({ signal: controller.signal }).then(
      result => { if (!controller.signal.aborted) setCount((Array.isArray(result) ? result : result.conversations).length); },
      () => { if (!controller.signal.aborted) setCount(null); },
    );
    return () => controller.abort();
  }, [source]);
  return <output>{count}</output>;
}
```

该示例独立读取一页，不操作当前 Thread；分页数据源的计数仅代表这一页。常规列表与缓存展示优先使用会话服务；真实失败提示使用项目统一文案。

## 属性与 API

<span id="属性"></span>

<span id="开发-api"></span>

### API

#### 服务方法 \{#服务}

提供 `agent-ui.conversation-data-source`，契约 `ConversationDataSource` 从 `/conversation-service` 导入：

| 方法                                                    | 返回值与用途                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `list(options?)`                                      | `Promise<ConversationSummary[] \| ConversationListPage>` |
| `get(id, options?)`                                   | `Promise<ConversationDetail>`，含 `history`                |
| `delete(id, options?)`                                | `Promise<void>`                                          |
| `rename?(id, title, options?)`                        | `Promise<void>`，可选能力                                     |
| `archive?(id, options?)` / `unarchive?(id, options?)` | `Promise<void>`，可选能力                                     |

项目 `services/conversations/data-source.ts` 负责请求、鉴权和业务响应转换。相关数据类型为：

| 类型                              | 字段                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ConversationDataSourceOptions` | `signal?: AbortSignal`                                                                            |
| `ConversationListOptions`       | `signal?: AbortSignal`、`cursor?: string`；首次查询不传 cursor                                            |
| `ConversationListPage`          | `conversations: ConversationSummary[]`、`nextCursor: string \| null`；null 表示结束                     |
| `ConversationSummary`           | 必需：`id`、`title`；可选：`status`、`group`、`updatedAt`、`disabled`。                                       |
| `ConversationDetail`            | 必需：`id`、`title`、`history: { format: 'langchain', messages: readonly unknown[] }`；可选：`agentState`。 |

<span id="怎么让-creator-修改"></span>
