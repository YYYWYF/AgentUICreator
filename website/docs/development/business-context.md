---
title: "给 Agent 传递业务参数"
---

# 给 Agent 传递业务参数

发送消息时，可以给 Agent 附带当前订单、租户、业务场景等参数。

页面参数用 `ctx`，页面摘要用 `getRunContext`。要发送 @、/ 等选中对象，见[插件发送参数](./composer-sources#插件提供数据composer-组装请求)；需要异步准备参数或申请会话 ID，使用 [`beforeRequest`](./connect-agent#发送前准备请求)。

## 业务参数 ctx

在 `<Agent />` 上设置 `ctx`，每次发送消息时都会带上这些默认参数：

```tsx
<Agent
  endpoint="/api/agent"
  ctx={{ tenantId: 'tenant-1', scene: 'order-detail' }}
/>
```

在业务组件中通过 [`useAgent()`](./react-host-control) 发送消息时，可以传入本次参数：

```ts
const host = useAgent();

await host.sendMessage('分析这个订单', {
  ctx: { orderId: 'O-1042', scene: 'order-analysis' },
});
```

该请求包含：

```json ag-ui
{
  "forwardedProps": {
    "ctx": {
      "tenantId": "tenant-1",
      "scene": "order-analysis",
      "orderId": "O-1042"
    }
  }
}
```

默认参数与本次参数会合并，同名参数以 `sendMessage` 中传入的值为准。后端从 `input.forwardedProps.ctx` 读取参数。

合并只处理第一层，同名嵌套对象会整体替换；`null` 会保留。本次参数在提交时取得独立快照，随该次消息的重试、工具续传和中断恢复保留，不成为下一条消息的默认参数。

`ctx` 使用 JSON 对象，日期等值先转为字符串。函数、循环引用等无效值会报 `AGENT_UI_INVALID_CTX`。身份和权限仍由后端校验。

## 通过 context 传递参数

受 AG-UI 格式限制，`context` 必须是 `[{ description: string, value: string }]` 这样的数组，每个条目的 `description` 和 `value` 都只能是字符串。传递对象时，需要先用 `JSON.stringify()` 转成字符串。

推荐在需要按条目提供选中文本、页面内容摘要等文本信息时使用。订单 ID、租户 ID、筛选条件等普通业务参数，推荐使用上面的 `ctx`。

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

发送消息时，请求体中的 `context` 如下：

```json ag-ui
{
  "context": [
    { "description": "selectedOrder", "value": "{\"orderId\":\"O-1042\",\"status\":\"shipped\"}" }
  ]
}
```

`description` 用来标识数据，后端按业务约定处理对应的 `value`。`getRunContext` 可以从页面的 props、state 或 store 读取当前数据。

`getRunContext` 同步读取已有数据，读取失败会报告 `onError`，请求继续。需要等待接口、准备失败时停止发送，使用 [`beforeRequest`](./connect-agent#发送前准备请求)。
