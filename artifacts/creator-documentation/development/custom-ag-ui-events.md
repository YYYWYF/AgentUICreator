# 自定义 AG-UI 事件与消息渲染

下面以“工单摘要”为例。Agent 返回的 `CUSTOM` 事件会自动转成消息，按以下步骤定义数据类型并注册渲染组件，即可显示工单卡片。

本页用于新增业务事件与消息卡片。已有图表或工具结果只需调整样式、属性或 renderer 时，见[手动修改插件：已有结果的渲染定制](/development/component-customization.md#已有结果的渲染定制)。

文件路径均相对于生成目录，默认是 `src/agent-ui/`。示例使用 React 和 TypeScript。

相关代码放在同一个插件目录：

```text
plugins/ticket-summary-message/
  data.ts         # 事件名和数据类型
  index.tsx       # 消息组件、文案和渲染注册
  manifest.json   # 插件声明
  definition.ts   # 插件入口
```

## 1. Agent 事件输出

在现有 AG-UI 运行流中返回：

```jsonl
{"type":"CUSTOM","name":"app.ticket.summary","value":{"ticket_id":"T-1042","title":"无法登录工作台"}}
```

`name` 用于匹配渲染器，`value` 会作为渲染组件的 `data` 传入。

## 2. 定义事件数据类型

新建 `plugins/ticket-summary-message/data.ts`，按事件的 `value` 定义数据类型：

```ts
export const TICKET_SUMMARY_EVENT = 'app.ticket.summary';

export interface TicketSummaryData {
  ticket_id: string;
  title: string;
}
```

消息渲染直接接收 `CUSTOM.value`，无需配置 `Agent.appEventSchemas`。

## 3. 消息组件实现

先在项目共享的多语言文案文件中添加 `ticketSummary` 这一组文案，用于工单摘要卡片的标题，保留文件中其他已有文案。多语言文案的组织方式见[主题与多语言](/development/plugin-api.md#主题与多语言)：

```ts
// application/i18n/messages.ts：将 ticketSummary 添加到已有的中英文文案中。
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = { ticketSummary: { heading: '工单摘要' } };
const enUS: typeof zhCN = { ticketSummary: { heading: 'Ticket summary' } };
const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };
export function getProjectMessages(locale: AgentUILocaleCode) { return messages[locale]; }
```

新建同目录的 `index.tsx`，组件读取对应语言的工单摘要标题：

```tsx
import { defineDataMessageUI, useLocaleCode } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';
import { TICKET_SUMMARY_EVENT, type TicketSummaryData } from './data';

export function TicketSummaryMessage({ data }: { data: TicketSummaryData }) {
  const labels = getProjectMessages(useLocaleCode()).ticketSummary;

  return <section aria-label={labels.heading}>
    <h3>{labels.heading}</h3>
    <p>{data.ticket_id}：{data.title}</p>
  </section>;
}

export const ticketSummaryUI = defineDataMessageUI<TicketSummaryData>({
  name: TICKET_SUMMARY_EVENT,
  render: TicketSummaryMessage,
});
```

这里的 `name` 必须与后端事件名一致，组件直接读取 `data` 渲染。

## 4. 插件注册与启用

新建 `plugins/ticket-summary-message/manifest.json`：

```json
{
  "id": "ticket-summary-message",
  "name": "Ticket summary message",
  "description": "Displays ticket summaries.",
  "version": "0.0.1",
  "capabilities": ["headless"],
  "data": { "messageUI": true }
}
```

新建同目录的 `definition.ts`：

```ts
import {
  parseUIPluginManifest,
  type UIPluginDefinition,
} from '@za38.03/agent-ui-plugins/contracts';
import { ticketSummaryUI } from './index';
import manifest from './manifest.json';

const definition: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  dataMessageUIs: [ticketSummaryUI],
  Component: () => null,
};

export default definition;
```

在 AppUIModel 已有的 `applicationPlugins` 数组中追加：

```json
{
  "pluginId": "ticket-summary-message",
  "id": "ticket-summary-message-main",
  "enabled": true
}
```

按[注册步骤](/development/create-plugin.md#4-插件注册与验证)更新插件注册表，也可以让 Creator 完成注册。每个消息名只启用一个渲染器。

## 5. 渲染验证

运行项目已有的类型检查和构建，再让 Agent 返回第 1 步的事件。会话中应显示：

```text
工单摘要
T-1042：无法登录工作台
```

再检查中英文切换是否生效。

需要让其他插件订阅实时业务通知时，见[订阅业务事件](/development/plugin-api.md#订阅业务事件)。

## 工具结果流式输出

工具执行期间，可以在同一条 AG-UI 流中发送 `CUSTOM` 事件，名称固定为 `TOOL_CALL_STREAM_RESULT`。先正常发送该工具的 `TOOL_CALL_START`、参数和 `TOOL_CALL_END`，再发送输出片段：

```jsonl
{"type":"CUSTOM","name":"TOOL_CALL_STREAM_RESULT","value":{"toolCallId":"call_1","messageId":"result_1","content":"第一行输出\n"}}
{"type":"CUSTOM","name":"TOOL_CALL_STREAM_RESULT","value":{"toolCallId":"call_1","messageId":"result_1","content":"第二行输出\n"}}
{"type":"TOOL_CALL_RESULT","toolCallId":"call_1","messageId":"result_1","content":"第一行输出\n第二行输出\n","role":"tool"}
```

- `value.toolCallId` 必须对应当前运行已开始的工具调用；`value.content` 是本次新增的字符串，不是累计全文。`value.messageId` 可省略，不作为归并依据。
- 前端按工具调用分别累加并更新已有工具卡片；多个工具交错输出也不会混在一起。子 Agent 事件在顶层携带与工具调用一致的 `subagentRunId`。
- 中间结果通过工具 renderer 的 `result` 展示，`isPreliminary` 为 `true`；不会创建已完成的工具消息，也不会提交客户端工具结果。默认工具卡片保留原有折叠设置，展开后可查看实时输出。
- 标准 `TOOL_CALL_RESULT` 表示结束，其完整内容替换临时累计内容，不再追加。最终结果仍支持原有 JSON 和多模态内容格式；结束后的迟到片段会被忽略。
- 取消或失败时保留已经显示的片段，状态遵循原会话生命周期。临时片段不会自动持久化，刷新后的结果以业务后端提供的历史为准。

此能力由 Runtime 自动接入，不需要新增插件、Data Message UI 或 `appEventSchemas`。统一 `useConversation` 的消息 `content` 也包含中间 `result`；直接读取 assistant-ui 原生工具调用的 `result` 不包含这份展示补充，向模型发送的历史仍采用标准工具结果。若业务另外订阅该 `CUSTOM` 事件，仍按本页的业务事件订阅规则声明 Schema 和订阅。
