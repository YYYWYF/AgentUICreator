---
title: "前端工具与自定义工具 UI"
---

# 前端工具与自定义工具 UI

前端工具让 Agent 请求执行页面动作，例如打开弹窗或填写表单。业务应用决定哪些动作可用，并提供执行方法；工具 UI 只显示参数、状态和结果。

## 接入需求示例

把允许 Agent 调用的页面方法、参数和权限要求发给 Creator，例如：

> 允许助理调用页面现有的 openTicket 方法打开工单。参数为 ticketId，执行前检查当前用户权限；取消后不要继续更新页面。保留已有前端工具。

接入后测试正常打开、参数错误、无权限和取消。重新打开历史记录时，不应再次执行页面操作。当前只支持主会话发起的前端工具调用。

## 宿主页面操作接入

React 宿主可以从 `@za38.03/agent-ui-runtime` 导入 **`createAgentUIFrontendTools`**，把需要开放的页面方法交给 `<Agent frontendTools={tools} />`。这些操作与项目原有前端工具共同生效，不需要导入生成目录中的工具注册器。

```tsx
import { useMemo } from 'react';
import { AgentUIProvider, createAgentUIFrontendTools } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';

export function TicketPage({ openTicket }: {
  openTicket: (id: string) => void;
}) {
  const tools = useMemo(() => createAgentUIFrontendTools([
    {
      name: 'open_ticket',
      description: '在当前页面打开指定工单',
      inputSchema: {
        type: 'object',
        properties: { ticketId: { type: 'string' } },
        required: ['ticketId'],
        additionalProperties: false,
      },
      execute(input, { signal }) {
        if (!input || typeof input !== 'object' ||
            !('ticketId' in input) || typeof input.ticketId !== 'string') {
          throw new Error('INVALID_TICKET_ID');
        }
        signal.throwIfAborted();
        openTicket(input.ticketId);
        return { opened: input.ticketId };
      },
    },
  ]), [openTicket]);

  return <AgentUIProvider><Agent frontendTools={tools} /></AgentUIProvider>;
}
```

新初始化模板已接入 `frontendTools`。已有工程需要同步检查 `application/Agent.tsx` 的属性，以及 `frontendTools` 是否继续传给会话组件，仅升级 npm 依赖不会改写这个项目文件。

把 `./agent-ui` 改成项目实际的 Agent 入口。`openTicket` 连接宿主已有的业务方法；创建工具不会立即执行它，只有 Agent 发起该工具调用才执行。

| 字段 | 用途 |
| --- | --- |
| `name` | 后端可调用的工具名，使用小写字母开头的下划线格式，最多 64 个字符。 |
| `description` | 向 Agent 说明该操作的用途。 |
| `inputSchema` | 向 Agent 声明参数的 JSON Schema，不代替宿主自己的数据与权限检查。 |
| `execute(input, context)` | 执行业务操作。`input` 为 unknown，先校验再使用；context 提供 `signal` 和 `toolCallId`。 |

**异步方法把 `signal` 传给可取消的请求，并在更新页面前再次检查取消状态。** 返回字符串或可 JSON 序列化的数据，结果由原会话的工具执行链回传；抛出的错误会作为工具失败处理。已有操作不会因取消而自动撤销。

用 `useMemo` 保持工具来源稳定；页面方法变化时更新依赖。替换 `frontendTools` 或卸载 Agent 会取消该来源未完成的调用，并忽略迟到结果。被替换的回调如果没有配合 signal，已经开始的业务副作用仍需由宿主自行处理。

同名宿主工具与项目工具会明确报错，**不会覆盖已有工具**。只执行主会话的调用；历史展示不会触发页面操作。需要动态改变可用工具时，可自行实现 npm Core 导出的 `AgentFrontendToolSource`，通过 `subscribe` 和 `getRevision` 通知变化；仍使用相同的 `frontendTools` 属性接入。
