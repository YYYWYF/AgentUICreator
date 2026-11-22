# 插件联动与取数

插件可以读取已有数据、调用其他插件提供的操作，也可以共享业务选择。下面按需求找入口；默认修改位置为 `src/agent-ui/plugins/<插件ID>/`。

## 按需求找入口

| 我想做什么                  | 使用什么                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读取当前消息、共享业务状态、运行或审批状态  | [会话状态 Hook](/development/plugin-api.md#读取会话状态)：`useAgentRuntime(snapshot => snapshot.messages)`、`useAgentRuntime(snapshot => snapshot.state)`、`useAgentRuntime(snapshot => snapshot.run)`、`useAgentRuntime(snapshot => snapshot.interrupts)` |
| 读取会话列表，或取得指定历史的消息      | [会话服务](/plugins/conversation-service.md)：订阅快照或调用 `loadConversation(id)`，见[独立读取历史](#读取历史不切换聊天)                                                                                                                                                |
| 结果卡片把文字、引用或附件放进当前输入框   | [Composer](/plugins/composer.md#hook)：`setText()`、`setQuote()`；附件使用 `useComposer().addAttachment(file)`，调用方处理异步失败                                                                                                                            |
| 多个插件共同提供本次发送参数         | 各自调用 [Composer `setData()`](/plugins/composer.md#请求适配)，由现有输入区统一汇总；填入后不自动发送                                                                                                                                                                   |
| 业务插件读取、选择或清除当前技能       | [Skills Service（开发中）](/plugins/skills.md#hook)：`conversation.skills` 管理选择与取消；`skills-selection` 订阅同一 Service 显示预览                                                                                                                            |
| 功能启用时向 `/` 菜单增加业务命令    | [命令注册器](/plugins/conversation-command-source.md#服务)：`register(command)`，停用或卸载时调用返回的注销函数                                                                                                                                                      |
| 消息卡片打开详情侧栏，其他插件跟随当前标签  | [工作台侧栏服务](/plugins/workbench-panel.md#服务方法与状态)：打开、切换、关闭，以及订阅展开状态和可见标签                                                                                                                                                                        |
| 读取已有登录服务的用户资料，或跟随主题、语言 | [账号](/plugins/auth-account.md#hook)、[主题服务](/plugins/theme-provider.md#服务)、[语言服务](/plugins/locale-provider.md#服务)；用户资料只用于展示，不代替接口鉴权                                                                                                           |
| 在对话中显示业务提示，不发送新问题      | [临时通知](#临时通知)：`addMessage()`                                                                                                                                                                                                                 |
| 给当前工具增加业务按钮，读取参数、结果和状态 | 沿用 renderer 的[工具调用数据](/plugins/tool-result.md#当前工具调用的数据与操作)；提交答案、审批时使用其提供的回调，历史展示保持只读                                                                                                                                                        |

## 从结果插件取得数据

在项目 `plugins/<插件ID>/index.tsx` 的已有组件调用处传入下列回调，就能把同一份数据交给项目的业务组件，无需再次请求或解析页面文字。

| 插件                                                   | 取数入口                                                               | 可以取得什么、用来做什么                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| [图表](/plugins/chart-message.md#取数与联动)                | `renderChart(data)`、`renderItem(item, index, data)`                | 图表标题和数值项；组合业务表格、明细入口或导出按钮                     |
| [生成文件](/plugins/generated-file-message.md#取数与联动)     | `renderFile(file, tool)`                                           | 文件名、类型和文件数据，默认 `file.data` 为下载地址；增加预览、加入单据等操作 |
| [网页搜索](/plugins/web-search.md#取数与联动)                 | `renderSearch(view, tool)`                                         | 查询词、结果集合和搜索状态；组合收藏、选择或查看详情                    |
| [检索片段](/plugins/retrieval-chunks.md#取数与联动)           | `renderRetrieval(view, tool)`                                      | 查询词、片段、来源、定位和相关度；打开对应业务文档                     |
| [引用来源](/plugins/source-citations-message.md#取数与联动)   | `renderSource(source, index, tool)`、`renderSources(sources, tool)` | URL／文档来源；组合来源列表、文档预览或引用操作                     |
| [上下文检索](/plugins/context-retrieval-message.md#取数与联动) | `renderContent(data, defaultContent)`                              | 来源与按查询词组织的片段；组合自己的知识库明细                       |
| [计划](/plugins/agent-plan-message.md#取数与联动)           | `renderPlan(plan)`                                                 | 标题、步骤和当前步骤位置；组合业务步骤视图                         |
| [状态](/plugins/agent-status-message.md#取数与联动)         | `renderStatus(view, tool)`                                         | 状态、说明和可用的耗时文字；组合业务状态卡片                        |
| [任务进度](/plugins/job-progress-message.md#取数与联动)       | `renderProgress(progress, tool)`                                   | 阶段、进度、结果和可用操作；组合业务进度视图                        |

回调接收当前这张卡片处理后的数据；带 `tool` 的入口还会提供原工具调用的参数、结果和状态。回调返回自己的内容时，原默认内容由你决定是否保留。保存、打开详情等业务操作放在用户点击事件里，避免每次渲染或查看历史时重复执行。

需要另一块独立插件同步更新时，把选中的对象交给共享 Service，按下面的方式联动。

## 插件之间共享选择或结果

例如“结果卡片选中工单 → 打开详情侧栏 → 详情插件读取同一工单”：

1. 沿用项目的[工单选择服务](/development/create-plugin.md#5-向其他插件提供方法)，由提供方注册一次；结果插件和详情插件都依赖 `tickets.selection`。
2. 调用方再依赖 `agent-ui.workbench-panel`；提前将 `ticket-detail` 登记为[侧栏内容 ID](/plugins/workbench-panel.md#把插件加入多内容侧栏)。
3. 在点击时更新选择并打开侧栏，详情插件用 `usePluginService()` 订阅同一个工单服务，读取 `selectedId`。

下面的组件放在调用方插件中，`label` 来自项目文案；其定义的 `inject` 需包含上述两个服务：

```tsx
import { usePluginService } from '@za38.03/agent-ui-plugins';
import { WORKBENCH_PANEL_SERVICE, type WorkbenchPanelService }
  from '@za38.03/agent-ui-plugins/workbench-panel';
import type { TicketSelectionService } from '../../services/ticket-selection';

export function OpenTicket({ ticketId, label }: { ticketId: string; label: string }) {
  const tickets = usePluginService<TicketSelectionService>('tickets.selection');
  const panel = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  return <button type="button" disabled={!tickets || !panel} onClick={() => {
    tickets?.select(ticketId);
    panel?.open('ticket-detail');
  }}>{label}</button>;
}
```

同一 Service 也可以保存选中的文件、搜索结果或其他业务对象，接口由项目定义。各插件使用同一个 Agent 内的现有服务，不分别创建存储。侧栏的 `open(id)` 只负责打开内容，业务数据通过共享服务传递。

## 读取历史，不切换聊天

做历史比较或摘要插件时，在调用方定义的 `inject` 中加入 `agent-ui.conversations`，然后在插件中定义下面的 Hook：

```tsx
import { usePluginService } from '@za38.03/agent-ui-plugins';
import {
  AGENT_UI_CONVERSATION_SERVICE, projectConversationDetail,
  type ConversationService,
} from '@za38.03/agent-ui-plugins/conversation-service';

export function useReadConversationMessages() {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  return async (threadId: string) => {
    if (!service) throw new Error('CONVERSATION_SERVICE_UNAVAILABLE');
    const detail = await service.loadConversation(threadId);
    return projectConversationDetail(detail);
  };
}
```

在按钮处理函数中调用并处理失败，返回的消息可交给比较、摘要等业务组件。只需要业务历史原格式时直接读取 `detail.history`。这次读取不会切换当前聊天，也不会发送问题或启动运行。

## 在对话中显示业务提示 \{#临时通知}

在已有会话内的业务组件中，从 Plugins 根入口导入 `useTransientMessages()`。操作成功后调用 `addMessage()`，就会在当前聊天中显示提示。下面的 `save` 接业务保存方法，`label`、`successText` 来自项目文案，`onError` 接项目错误处理：

```tsx
import { useState } from 'react';
import { useTransientMessages } from '@za38.03/agent-ui-plugins';

export function SaveWithNotice({ save, label, successText, onError }: {
  save: () => Promise<void>;
  label: string;
  successText: string;
  onError: (error: unknown) => void;
}) {
  const { addMessage } = useTransientMessages();
  const [pending, setPending] = useState(false);
  return <button type="button" disabled={pending} onClick={async () => {
    if (pending) return;
    setPending(true);
    try {
      await save();
      addMessage({ role: 'system', text: successText });
    } catch (error: unknown) { onError(error); }
    finally { setPending(false); }
  }}>{label}</button>;
}
```

`role` 可用 `system`、`assistant` 或 `user`，分别显示为居中、助理或用户提示。错误提示增加 `type: 'error'`。提示不发送给 Agent，也不保存到聊天历史；刷新页面后消失。

## 当前的读取范围

- 图表、文件、计划等结果插件目前没有独立的全局取数服务，内部解析函数也没有作为公共 API 开放。用上面的回调取得当前对象；需要其他插件持续读取时，通过项目 Service 共享。
- `useComposer().data` 可读取当前草稿汇总的数据，Hook 会跟随变化更新；各插件通过 `setData()` 写入自己的数据。需要在发送后继续共享业务选择时，使用共享 Service。
- 普通 React 组件的内部状态不会自动成为其他插件的数据。共享方法在提供方声明 `provides`，消费方声明 `inject` 或 `optionalInject`；具体注册与订阅步骤见[服务接口](/development/plugin-api.md#自定义服务)。
