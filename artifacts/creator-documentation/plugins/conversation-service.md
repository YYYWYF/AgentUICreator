# 会话服务（conversation-service）

## 功能与效果

共享列表、历史缓存和会话操作，支持刷新、订阅和独立详情读取。

<span id="实现与项目配置"></span>

本插件管理会话列表、详情加载与缓存、当前选中的会话，以及删除、重命名和归档等操作。会话数据源负责读取接口，本插件将这些数据和操作提供给界面，消息与运行继续由应用已有的 Runtime 管理。

### 会话管理

<figure className="plugin-preview">

![会话管理界面](/images/plugins/conversation-thread-list.png)

<figcaption>服务联动后的界面；本插件本身没有独立界面。</figcaption>
</figure>

## 修改与启用

历史记录的持久化由业务后端完成。手动接入接口或调整操作时，按下方开发文档修改项目配置。

<span id="相关接口"></span>

- 接入历史接口、数据格式和会话管理操作：[接入历史会话](/development/history-backend.md)。
- 从业务页面发送消息、停止运行或新建会话：[用业务页面控制 Agent](/development/react-host-control.md)。
- 编写需要读取或共享服务的自定义插件：[服务共享与状态订阅](/development/plugin-api.md#服务共享与状态订阅)。

调整列表组件的外观与属性，见[会话列表](/plugins/conversation-thread-list.md)。

## 数据来源与显示条件

<span id="取数与联动"></span>

其他插件可以订阅列表和当前会话信息，也可以用 `loadConversation(id)` 读取指定历史而不切换聊天。需要统一的消息结构时再调用 `projectConversationDetail(detail)`；适合历史比较、摘要等功能，见[取数示例](/development/plugin-interaction.md#读取历史不切换聊天)。

## 常见定制

<span id="常见需求"></span>

<span id="代码示例"></span>

### 刷新当前历史列表 \{#刷新当前历史列表}

<span id="example-1"></span>

放在同一 Agent 作用域的项目插件中，并在定义中声明 agent-ui.conversations 依赖。失败交给项目已有错误提示处理。

```tsx
import { useState } from 'react';
import { usePluginService, useLocale } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_CONVERSATION_SERVICE, type ConversationService }
  from '@za38.03/agent-ui-plugins/conversation-service';

export function RefreshHistory({ onError }: { onError: (error: unknown) => void }) {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const labels = useLocale('threadList');
  const [pending, setPending] = useState(false);
  return <button type="button" disabled={!service || pending} onClick={async () => {
    if (!service || pending) return;
    setPending(true);
    try { await service.refresh(); } catch (error: unknown) { onError(error); }
    finally { setPending(false); }
  }}>{labels.retry}</button>;
}
```

<span id="example-2"></span>

### 读取另一段历史而不切换当前对话 \{#读取另一段历史而不切换当前对话}

loadConversation 只读详情；不会用该历史替换当前 Thread。回调由项目显示预览或错误。

```tsx
import { usePluginService } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_CONVERSATION_SERVICE, type ConversationService, type ConversationDetail }
  from '@za38.03/agent-ui-plugins/conversation-service';

export function ReadHistory({ id, label, onLoaded, onError }: {
  id: string; label: string;
  onLoaded: (detail: ConversationDetail) => void;
  onError: (error: unknown) => void;
}) {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  return <button type="button" disabled={!service} onClick={() => {
    void service?.loadConversation(id).then(onLoaded, onError);
  }}>{label}</button>;
}
```

### 订阅会话列表 \{#订阅会话列表}

组件与服务位于同一 Agent，并声明 `agent-ui.conversations` 依赖。

```tsx
import { useConversations } from '../../services/hooks/useConversations';

export function ConversationCount() {
  const { serviceAvailable } = useConversations();
  const count = useConversations(state => state.conversations.length);
  return serviceAvailable ? <output>{count}</output> : null;
}
```

`snapshot.conversations` 随刷新、重命名、删除等操作更新，`serviceAvailable` 为 `false` 时隐藏计数。这个组件不主动请求列表；需要刷新使用前面的 `RefreshHistory`。相对路径指向项目已有 Hook，移动组件时同步调整。

## 属性与 API

<span id="属性"></span>

<span id="开发-api"></span>

### API

<span id="hook"></span>

| 入口                                                          | 返回与使用位置                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 项目 `services/hooks/useConversations` 的 `useConversations()` | 返回 `getSnapshot`、`subscribe`、`serviceAvailable`、`refresh`、`loadConversation` 和管理操作；不自动订阅数据。 |
| 同一入口的 `useConversations(selector)`                          | 按需订阅 `ConversationSnapshot` 的列表、详情或加载字段；结果按 `Object.is` 比较。                                 |
| npm 根入口的 `useConversationActions(): ConversationActions`    | canonical Runtime 的底层管理操作；项目代码统一使用自己的 `useConversations()`。                                 |

无 selector 的 `getSnapshot()` 在调用时读取最新值。`subscribe(listener)` 供手动集成使用，需要在 effect 清理中取消。历史列表、缓存继续由会话服务拥有，当前聊天消息由 `useConversation` 读取。

#### 服务方法 \{#服务}

提供 `agent-ui.conversations` 与供 Runtime 消费的 `agent-ui.thread-binding`，依赖 `agent-ui.conversation-data-source`。

| 服务成员                                                                      | 返回值与用途                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `getSnapshot()` / `subscribe(listener: () => void)`                       | 当前 `ConversationSnapshot` / `() => void`，订阅后重新读取快照                          |
| `refresh()`                                                               | `Promise<void>`，更新第一页；已分页加载时保留尾部和末尾游标，第一页已覆盖全量时替换列表                         |
| `loadPage?(cursor)`                                                       | `Promise<void>`，由 Thread Binding 接入原生分页；列表 UI 通过 assistant-ui 的 loadMore 触发 |
| `selectConversation(id)`                                                  | `Promise<ConversationDetail \| undefined>`，服务级详情选择；UI 导航优先使用项目操作 Hook       |
| `loadConversation(id)`                                                    | `Promise<ConversationDetail>`，独立读取详情，不切换当前 Thread                           |
| `deleteConversation(id: string)`                                          | `Promise<void>`，删除业务记录并更新列表                                                 |
| `renameConversation?(id: string, title: string)`                          | `Promise<void>`，重命名并更新已有缓存                                                  |
| `archiveConversation?(id: string)` / `unarchiveConversation?(id: string)` | `Promise<void>`，归档／恢复；数据源需实现相应操作                                            |
| `showConversation(id)` / `showLiveConversation()`                         | 更新业务视图选择，不代替 Runtime 导航                                                     |
| `resetForNewConversation()`                                               | Runtime 已新建／切换后同步服务状态，不自行创建 Thread                                          |

`ConversationSnapshot` 按用途包含：

- 会话数据：`mode`、`conversations`、`activeConversationId?`、`activeConversation?`。
- 加载状态：`listStatus`、`detailStatus`，值为 `idle | loading | ready | error`。
- 分页：`nextCursor?` 为下一页游标，`null` 表示结束；`loadMoreError?` 保留下一页失败信息。`listRevision?` 是列表同步用的内部版本，追加页不改变它。
- 错误信息：`listError?`、`detailError?`、`detailErrorConversationId?`。

需要将历史详情转换成统一消息结构时，从 `/conversation-service` 导入 `projectConversationDetail(detail)`，传入已取得的 `ConversationDetail`，返回投影后的消息列表；完整例子见[读取历史不切换聊天](/development/plugin-interaction.md#读取历史不切换聊天)。校验未知业务响应时，可以使用同入口的 `conversationSummarySchema.safeParse(value)` / `conversationDetailSchema.safeParse(value)`，先处理失败，再将合法结果交给服务。

应用装配使用 `createConversationService({ dataSource })` 创建一次服务，清理时调用其 `dispose()`；其他插件取得已有服务。`createConversationThreadBindingFactory(service)` / `createConversationServiceThreadBinding()` 用于现有 Host 的 Thread 绑定，普通列表或结果卡片无需调用。

[刷新后继续观察未结束的长任务](/development/history-backend.md#刷新后继续观察长任务开发中)开发中，暂不支持；历史加载仅恢复已保存的记录。

<span id="什么时候需要关心"></span>

<span id="怎么让-creator-修改"></span>
