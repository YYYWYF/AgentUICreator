# 前端工具与自定义工具 UI

前端工具支持两种用法，按业务需要选择：

| 要做什么                      | 怎么接入                                                       | 结果怎么返回                  |
| ------------------------- | ---------------------------------------------------------- | ----------------------- |
| 后端执行工具，前端展示过程和结果          | 在 `toolkit` 中注册 `type: 'backend'`、可选 `display` 和 `render`  | 后端返回 `TOOL_CALL_RESULT` |
| Agent 调用后显示 TSX 组件，等待用户操作 | 在 `toolkit` 中注册 `type: 'human'` 和 `render`                 | 组件调用 `addResult()`      |
| Agent 调用页面方法或业务接口         | 在 `toolkit` 中注册 `type: 'frontend'`、`execute` 和可选的 `render` | `execute()` 返回结果        |

## 后端工具的默认与自定义展示

后端已经负责定义和执行的工具，只需按 AG-UI 的 `toolCallName` 注册前端展示。不传 `render` 时，沿用应用当前选择的默认工具卡片；`display: 'standalone'` 让卡片独立展示，`inline` 则允许进入工具分组，默认是 `inline`。

```tsx
import type { ConversationToolkit } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';
import { OrderTool } from './OrderTool';

const toolkit = {
  ...agentUIProject.baseConversationToolkit,
  bash: {
    type: 'backend',
    display: 'standalone',
  },
  query_order: {
    type: 'backend',
    display: 'standalone',
    render: OrderTool,
  },
} satisfies ConversationToolkit;

<Agent endpoint="/api/agent" toolkit={toolkit} />;
```

这段配置不需要传给后端。`backend` 条目不会作为可执行前端工具上报，`render` 和 `display` 留在前端；工具仍由后端执行并通过工具结果事件返回数据。不注册某个后端工具时，该工具也会使用默认展示。

### `render` 替换哪里

`toolkit[toolName].render` 替换整个工具条目，包括“正在调用／已调用工具”标题、参数、结果及工具自身的展开面板。上面的“3 次工具调用”属于外层分组，不在单个工具的 `render` 内。

如果希望沿用默认标题和外壳，只定制结果，在自己的 `OrderTool` 中复用默认组件：

```tsx
import { ConversationToolResult, type ConversationToolCallProps, type ToolResultProps } from '@za38.03/agent-ui-plugins';
import { OrderResultView } from './components/OrderResultView';

function OrderResult({ result }: ToolResultProps) {
  return <OrderResultView data={result.value} />;
}

export function OrderTool(props: ConversationToolCallProps) {
  return <ConversationToolResult {...props} components={{ Result: OrderResult }} />;
}
```

`OrderResultView` 是项目自己的业务组件，`data` 接收 `unknown` 并校验业务结果。它应处理执行期间的部分结果，不在渲染时重新查询或执行工具。`components.Result` 只替换结果区域；名称、参数、审批和错误保持默认。图片等片段可以通过 `components.Image` 单独替换；`renderToolCall({ header, defaultView })` 只负责统一布局。详见[工具结果展示](/plugins/tool-result.md#业务渲染)。

## 渲染组件，等待用户操作

例如，让 Agent 显示一个选择组件，用户选完后再继续回复。只需注册组件，不需要 `execute()`。

### 1. 注册组件工具

```tsx
import type { ConversationToolkit } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';
import { SelectItemTool } from './SelectItemTool';

const toolkit = {
  ...agentUIProject.baseConversationToolkit,
  select_item: {
    type: 'human',
    display: 'standalone',
    description: '显示选择界面，等待用户选择一项',
    parameters: {
      type: 'object', properties: {}, additionalProperties: false,
    },
    render: SelectItemTool,
  },
} satisfies ConversationToolkit;

<Agent endpoint="/api/agent" toolkit={toolkit} />;
```

把 `./agent-ui` 和 `/api/agent` 换成项目实际入口和接口。已有其他工具配置时一并保留，每个工具名只注册一次。

### 2. 在组件中提交结果

`SelectItemTool.tsx` 接收当前调用的参数、状态和提交方法。下面的 `BusinessSelector` 代表自己的业务组件，具体界面由业务实现：

```tsx
import {
  useConversationCanAnswerToolCall,
  type ConversationToolCallProps,
} from '@za38.03/agent-ui-plugins';
import { BusinessSelector } from './components/BusinessSelector';

export function SelectItemTool({ args, result, status, addResult }: ConversationToolCallProps) {
  const canAnswer = useConversationCanAnswerToolCall();
  const waiting = status.type === 'requires-action'
    && canAnswer && result === undefined && typeof addResult === 'function';

  return <BusinessSelector
    input={args}
    result={result}
    onConfirm={waiting ? (selected: { id: string }) => addResult?.(selected) : undefined}
  />;
}
```

`input`、`result`、`onConfirm` 是示例业务组件的属性，换成自己的组件接口。`args` 是 Agent 传来的参数；调用 `addResult(data)` 后，框架会回传结果并请求后端继续运行。取消选择时也可以提交 `{ cancelled: true }`。

历史记录会再次渲染组件，应根据 `result` 展示当时的结果，并仅在允许回答时提供提交入口。更多属性见[工具调用属性](/plugins/ask-user-question.md#当前工具调用的数据与操作)。内置[询问用户](/plugins/ask-user-question.md)也使用这种方式。

<figure className="plugin-preview">

![内置询问用户工具的题目和可选答案](/images/plugins/human-interaction-question.png)

<figcaption>内置问答工具的界面参考：工具卡片等待用户选择并提交，再由原会话继续回答。BusinessSelector 的具体外观由项目实现。</figcaption>
</figure>

## 宿主页面操作接入

需要直接调用页面方法、填写现有表单或请求接口时，在同一个 `toolkit` 中配置 `type: 'frontend'` 和 `execute`。需要自定义展示时，直接加 `render`：

```tsx
import { useMemo } from 'react';
import type { ConversationToolkit } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';
import { OpenTicketToolCard } from './components/OpenTicketToolCard';

export function PageAgent({ openTicket }: {
  openTicket: (id: string, signal: AbortSignal) => Promise<void>;
}) {
  const toolkit = useMemo(() => ({
    ...agentUIProject.baseConversationToolkit,
    open_ticket: {
      type: 'frontend',
      description: '在页面中打开指定工单',
      parameters: {
        type: 'object',
        properties: { ticketId: { type: 'string' } },
        required: ['ticketId'],
        additionalProperties: false,
      },
      async execute(input, { abortSignal }) {
        if (typeof input.ticketId !== 'string') throw new Error('INVALID_TICKET_ID');
        await openTicket(input.ticketId, abortSignal);
        abortSignal.throwIfAborted();
        return { opened: input.ticketId };
      },
      render: OpenTicketToolCard,
    },
  } satisfies ConversationToolkit), [openTicket]);

  return <Agent endpoint="/api/agent" toolkit={toolkit} />;
}
```

将自己的业务方法传给 `openTicket`。`execute()` 返回字符串或可 JSON 序列化的数据，失败时抛出错误。异步操作等待完成后再返回，并将 `abortSignal` 传给业务方法处理取消。

`OpenTicketToolCard` 是自己编写的 TSX 组件，接收与前一节相同的工具调用属性，读取 `args`、`result`、`status`、`isError` 展示调用情况。这里由 `execute()` 返回结果；不需要自定义卡片时省略 `render`，使用默认展示。

用 `useMemo` 和稳定的业务回调保持工具集合稳定。停止运行、替换工具集合或卸载 Agent 会取消未完成的调用，已发生的业务操作不会自动撤销。

### 已有项目工具来源

已有项目通过 `frontendTools` 或 Service 管理执行许可时，可以继续使用。为这些工具配置展示，直接在 `toolkit` 中添加同名的 `type: 'backend'`、`render` 和可选 `display`，执行方法和参数仍由原工具来源提供。

只注册这样的展示组件不会开放执行权限；工具不可用时，组件仍用于显示历史结果。同名工具不能再同时声明另一套 `frontend` 或 `human` 执行方式。

## 两种方式都需要了解的行为

- **工具名**：每个工具名只注册一次。`frontend` 工具的名称以小写字母开头，仅使用小写字母、数字和下划线，最多 64 个字符。
- **后端配合**：需要由前端执行或等待用户回答的工具，其声明随请求的 `tools` 发送。后端发出工具调用，结束本轮运行，再接收工具结果并继续回复。`type: 'backend'` 的展示注册不走这一执行流程；事件格式见 [AG-UI 数据](/plugins/ag-ui-data.md)。
- **执行许可**：应用显式注册 `frontend` 工具即允许执行，设置 `disabled: true` 可停止对 Agent 开放并保留历史展示。
- **展示组件**：使用 TSX 编写，文案接入[统一语言层](/development/localization.md)。不要在渲染或挂载时自动执行业务操作，以免查看历史时重复执行。
- **后续消息参数**：工具结果用于本次调用；后续消息也需要的数据，在页面保存并传给 `Agent.ctx`，见[传递业务参数](/development/business-context.md)。
