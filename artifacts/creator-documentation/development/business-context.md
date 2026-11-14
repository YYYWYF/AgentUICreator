# 业务上下文与 Agent 通知

让 Agent 读取当前选中订单，或让页面在收到 Agent 通知后更新业务区，分别使用 `getRunContext` 与业务事件订阅。这些入口复用当前 AG-UI 连接，不需要另开一个接口轮询会话。

## 1. 请求上下文注入

修改业务挂载文件，例如 `src/AssistantPage.tsx`：

```tsx
import { Agent } from './agent-ui';

export function AssistantPage({ orderId, status }: { orderId: string; status: string }) {
  return <Agent endpoint="/api/agent" getRunContext={() => [{
    description: 'selectedOrder',
    value: JSON.stringify({ orderId, status }),
  }]} />;
}
```

下一次发送、工具续跑或审批恢复时，POST 的 AG-UI 请求包含：

```json
{
  "context": [
    { "description": "selectedOrder", "value": "{\"orderId\":\"O-1042\",\"status\":\"shipped\"}" }
  ]
}
```

这里只列出局部字段，其余请求结构见[AG-UI 请求体](/development/connect-agent.md#请求体与响应流)。`description` 和 `value` 都是字符串，后端按双方约定解析 value。回调同步读取当前数据，不能 async；需要调用业务接口时先由页面加载，再从 props/state/store 读取。页面变化不会自动推送到正在执行的运行。

转换函数可放在 `src/agent-ui/services/run-context.ts`，在回调中调用它；不能把函数或数据放进布局 JSON。业务凭据和权限仍由后端校验。回调抛错会通过 `onError` 报告，但运行继续发送且缺少这次上下文；关键授权不能依赖该回调。

## 2. Agent 业务通知

假设业务要接收“已选中工单”，Agent 在当前 SSE 中发送：

```text
data: {"type":"CUSTOM","name":"app.ticket.selected","value":{"ticketId":"T-1042"}}

```

事件放在已有运行的开始／结束之间。`value` 到达应用事件订阅时名为 `payload`。这是一条实时通知，不是另一个 HTTP 响应或完整会话快照。

新建 `src/agent-ui/services/app-events.ts`，使用项目已有 `zod` 校验协议：

```ts
import { z } from 'zod';

export const ticketSelectedSchema = z.object({ ticketId: z.string().min(1) });
export const appEventSchemas = { 'app.ticket.selected': ticketSelectedSchema };
```

在业务页面的共享 Provider 中挂载订阅组件和 Agent：

```tsx
import { AgentUIProvider, useAgentUIAppEvent } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';
import { appEventSchemas, ticketSelectedSchema } from './agent-ui/services/app-events';

function TicketEvents({ onSelect }: { onSelect: (id: string) => void }) {
  useAgentUIAppEvent('app.ticket.selected', event => {
    const result = ticketSelectedSchema.safeParse(event.payload);
    if (result.success) onSelect(result.data.ticketId);
  });
  return null;
}

export function AssistantPage({ onSelect }: { onSelect: (id: string) => void }) {
  return <AgentUIProvider>
    <TicketEvents onSelect={onSelect} />
    <Agent endpoint="/api/agent" appEventSchemas={appEventSchemas} />
  </AgentUIProvider>;
}
```

已有事件表时合并新项，保留其余 Schema。宿主订阅仍检查 payload，因为泛型不执行校验。插件内部订阅另外需要在 manifest 的 `data.events` 声明消费名，见[插件事件接口](/development/plugin-api.md#订阅业务事件)。

业务字段不同时在 `services/app-events.ts` 的 Schema 中校验／转换，再由订阅组件调用现有业务方法。不要重连底层流或在历史卡片挂载时执行业务操作。需要展示卡片时，另按[自定义消息渲染](/development/custom-ag-ui-events.md)注册；事件 Schema 的转换不改写消息原始 data。

## 3. 数据接入方式选择

| 需求                      | 入口                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 下一次运行读取页面选择             | `getRunContext`                                                                                        |
| Agent 请求执行一个页面动作并得到执行结果 | [frontendTools](/development/frontend-tools.md)                                                        |
| 页面收到一次业务通知              | `CUSTOM` + 业务事件订阅；只接实时事件，不重放历史                                                                         |
| Agent 持续更新共享状态          | 标准 `STATE_SNAPSHOT/STATE_DELTA`，插件通过 `useAgentState()` 读取；见[状态 API](/development/plugin-api.md#读取会话状态) |
| 暂停等待用户审批并继续原运行          | 当前中断集合 + `resumeInterrupts()`，见[审批提交](/development/react-host-control.md#提交审批或补充信息)                    |

## 4. 验证

更新页面选择再发送，检查请求 context 已变化。通知测试正确、缺字段与错误类型的数据；切换会话、卸载订阅后不得继续更新旧页面。刷新加载历史不应再次选择工单。需要刷新恢复的业务状态应由持久化服务或明确共享状态恢复。
