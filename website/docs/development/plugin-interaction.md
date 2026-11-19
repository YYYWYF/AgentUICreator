---
title: "插件联动与取数"
description: 从插件读取会话、结果和共享数据，并调用输入框、技能、命令与侧栏操作。
---

# 插件联动与取数

插件可以读取已有数据、调用其他插件提供的操作，也可以共享业务选择。下面按需求找入口；默认修改位置为 `src/agent-ui/plugins/<插件ID>/`。

## 按需求找入口

| 我想做什么 | 使用什么 |
| --- | --- |
| 读取当前消息、共享业务状态、运行或审批状态 | [会话状态 Hook](./plugin-api#读取会话状态)：`useAgentMessages()`、`useAgentState()`、`useAgentRun()`、`useAgentInterrupts()` |
| 读取会话列表，或取得指定历史的消息 | [会话服务](/plugins/conversation-service)：订阅快照或调用 `loadConversation(id)`，见[独立读取历史](#读取历史不切换聊天) |
| 结果卡片把文字、引用或附件放进当前输入框 | [Composer](/plugins/composer#hook)：`setText()`、`setQuote()`；附件使用 `useConversationComposer().addAttachment(file)`，调用方处理异步失败 |
| 多个插件共同提供本次发送参数 | 各自调用 [Composer `setData()`](/plugins/composer#请求适配)，由现有输入区统一汇总；填入后不自动发送 |
| 业务插件读取、选择或清除当前技能 | [技能服务](/plugins/skills#服务)：`getSnapshot(threadId)`、`select()`、`clear(threadId)`；技能栏和标签使用同一份选择 |
| 功能启用时向 `/` 菜单增加业务命令 | [命令注册器](/plugins/conversation-command-source#服务)：`register(command)`，停用或卸载时调用返回的注销函数 |
| 消息卡片打开详情侧栏，其他插件跟随当前标签 | [工作台侧栏服务](/plugins/workbench-panel#服务方法与状态)：打开、切换、关闭，以及订阅展开状态和可见标签 |
| 读取已有登录服务的用户资料，或跟随主题、语言 | [账号](/plugins/auth-account#hook)、[主题服务](/plugins/theme-provider#服务)、[语言服务](/plugins/locale-provider#服务)；用户资料只用于展示，不代替接口鉴权 |
| 在对话中显示业务提示，不发送新问题 | [临时通知](/plugins/transient-assistant-messages#hook)：`addMessage()` |
| 给当前工具增加业务按钮，读取参数、结果和状态 | 沿用 renderer 的[工具调用数据](/plugins/tool-fallback#当前工具调用的数据与操作)；提交答案、审批时使用其提供的回调，历史展示保持只读 |

## 从结果插件取得数据

在项目 `plugins/<插件ID>/index.tsx` 的已有组件调用处传入下列回调，就能把同一份数据交给项目的业务组件，无需再次请求或解析页面文字。

| 插件 | 取数入口 | 可以取得什么、用来做什么 |
| --- | --- | --- |
| [图表](/plugins/chart-message#取数与联动) | `renderChart(data)`、`renderItem(item, index, data)` | 图表标题和数值项；组合业务表格、明细入口或导出按钮 |
| [生成文件](/plugins/generated-file-message#取数与联动) | `renderFile(file, tool)` | 文件名、类型和文件数据，默认 `file.data` 为下载地址；增加预览、加入单据等操作 |
| [网页搜索](/plugins/web-search#取数与联动) | `renderSearch(view, tool)` | 查询词、结果集合和搜索状态；组合收藏、选择或查看详情 |
| [检索片段](/plugins/retrieval-chunks#取数与联动) | `renderRetrieval(view, tool)` | 查询词、片段、来源、定位和相关度；打开对应业务文档 |
| [引用来源](/plugins/source-citations-message#取数与联动) | `renderSource(source, index, tool)`、`renderSources(sources, tool)` | URL／文档来源；组合来源列表、文档预览或引用操作 |
| [上下文检索](/plugins/context-retrieval-message#取数与联动) | `renderContent(data, defaultContent)` | 来源与按查询词组织的片段；组合自己的知识库明细 |
| [计划](/plugins/agent-plan-message#取数与联动) | `renderPlan(plan)` | 标题、步骤和当前步骤位置；组合业务步骤视图 |
| [状态](/plugins/agent-status-message#取数与联动) | `renderStatus(view, tool)` | 状态、说明和可用的耗时文字；组合业务状态卡片 |
| [任务进度](/plugins/job-progress-message#取数与联动) | `renderProgress(progress, tool)` | 阶段、进度、结果和可用操作；组合业务进度视图 |

回调接收当前这张卡片处理后的数据；带 `tool` 的入口还会提供原工具调用的参数、结果和状态。回调返回自己的内容时，原默认内容由你决定是否保留。保存、打开详情等业务操作放在用户点击事件里，避免每次渲染或查看历史时重复执行。

需要另一块独立插件同步更新时，把选中的对象交给共享 Service，按下面的方式联动。

## 插件之间共享选择或结果

例如“结果卡片选中工单 → 打开详情侧栏 → 详情插件读取同一工单”：

1. 沿用项目的[工单选择服务](./create-plugin#5-向其他插件提供方法)，由提供方注册一次；结果插件和详情插件都依赖 `tickets.selection`。
2. 调用方再依赖 `agent-ui.workbench-panel`；提前将 `ticket-detail` 登记为[侧栏内容 ID](/plugins/workbench-panel#把插件加入多内容侧栏)。
3. 在点击时更新选择并打开侧栏，详情插件用 `usePluginServiceSnapshot()` 订阅同一个工单服务，读取 `selectedId`。

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

## 当前的读取范围

- 图表、文件、计划等结果插件目前没有独立的全局取数服务，内部解析函数也没有作为公共 API 开放。用上面的回调取得当前对象；需要其他插件持续读取时，通过项目 Service 共享。
- Composer 支持各插件写入自己的 `setData()`，最终请求适配器可以读取汇总的 `pluginData`；目前没有跨插件的 `getData(插件ID)` 或实时订阅接口。多个插件需要同步业务选择时，使用共享 Service。
- 普通 React 组件的内部状态不会自动成为其他插件的数据。共享方法在提供方声明 `provides`，消费方声明 `inject` 或 `optionalInject`；具体注册与订阅步骤见[服务接口](./plugin-api#自定义服务)。
