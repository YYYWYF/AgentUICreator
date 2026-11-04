---
title: "自定义 AG-UI 事件与消息渲染"
description: 按步骤将自定义 CUSTOM 事件解析并显示为消息卡片。
---

# 自定义 AG-UI 事件与消息渲染

下面以“工单摘要”为例。Runtime 会将 `CUSTOM` 事件自动转成消息，你只需编写解析函数，再注册对应的插件渲染器。

文件路径均相对于生成目录，默认是 `src/agent-ui/`。示例使用项目已有的 React 和 `zod`。

相关代码放在同一个插件目录：

```text
plugins/ticket-summary-message/
  schema.ts       # 数据解析
  index.tsx       # 消息组件、文案和渲染注册
  manifest.json   # 插件声明
  definition.ts   # 插件入口
```

## 1. 让 Agent 返回事件

在现有 AG-UI 运行流中返回：

```json
{
  "type": "CUSTOM",
  "name": "app.ticket.summary",
  "value": {
    "ticket_id": "T-1042",
    "title": "无法登录工作台"
  }
}
```

`name` 用于匹配渲染器，`value` 会作为渲染组件的 `data` 传入。

## 2. 编写解析函数并配置事件

新建 `plugins/ticket-summary-message/schema.ts`，校验数据并转换字段：

```ts
import { z } from 'zod';

export const TICKET_SUMMARY_EVENT = 'app.ticket.summary';

export const ticketSummarySchema = z.object({
  ticket_id: z.string().min(1),
  title: z.string().min(1),
}).transform(value => ({
  ticketId: value.ticket_id,
  title: value.title,
}));

export function parseTicketSummary(data: unknown) {
  return ticketSummarySchema.safeParse(data);
}
```

在使用 `Agent` 的页面（例如 `src/App.tsx`）传入事件配置：

```tsx
import { Agent } from './agent-ui';
import { TICKET_SUMMARY_EVENT, ticketSummarySchema } from './agent-ui/plugins/ticket-summary-message/schema';

const appEventSchemas = { [TICKET_SUMMARY_EVENT]: ticketSummarySchema };

export function App() {
  return <Agent appEventSchemas={appEventSchemas} />;
}
```

消息组件仍需调用解析函数处理收到的原始数据。

## 3. 编写消息组件

先在项目共享消息模块中添加 `ticketSummary` 领域，保留其他已有领域；组织方式见[主题与多语言](./plugin-api#主题与多语言)：

```ts
// application/i18n/messages.ts：将这个领域合并进已有的双语表。
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = { ticketSummary: { heading: '工单摘要', invalid: '工单数据格式不正确。' } };
const enUS: typeof zhCN = { ticketSummary: { heading: 'Ticket summary', invalid: 'Invalid ticket data.' } };
const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };
export function getProjectMessages(locale: AgentUILocaleCode) { return messages[locale]; }
```

新建同目录的 `index.tsx`，组件消费共享领域文案：

```tsx
import { defineDataMessageUI, useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';
import { TICKET_SUMMARY_EVENT, parseTicketSummary } from './schema';

export function TicketSummaryMessage({ data }: { data: unknown }) {
  const labels = getProjectMessages(useAgentUILocaleCode()).ticketSummary;
  const result = parseTicketSummary(data);
  if (!result.success) return <p role="alert">{labels.invalid}</p>;

  return <section aria-label={labels.heading}>
    <h3>{labels.heading}</h3>
    <p>{result.data.ticketId}：{result.data.title}</p>
  </section>;
}

export const ticketSummaryUI = defineDataMessageUI<unknown>({
  name: TICKET_SUMMARY_EVENT,
  render: TicketSummaryMessage,
});
```

这里的 `name` 必须与后端事件名一致。组件通过 `parseTicketSummary(data)` 取得解析结果后渲染。

## 4. 注册并启用插件

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

按[注册步骤](./create-plugin#4-更新注册并检查)更新插件注册表，也可以让 Creator 完成注册。每个消息名只启用一个渲染器。

## 5. 检查结果

运行项目已有的类型检查和构建，再让 Agent 返回第 1 步的事件。会话中应显示：

```text
工单摘要
T-1042：无法登录工作台
```

再检查一次缺少字段的数据是否显示错误提示，以及中英文切换是否生效。

需要让其他插件订阅实时业务通知时，见[订阅业务事件](./plugin-api#订阅业务事件)。
