# Agent 工作状态（agent-status-message）

状态卡片用简短文字说明当前工作，并随这项工作的运行状态显示进行中或已完成等标记；有耗时数据时也可显示耗时。它不列计划步骤，也不显示完成百分比。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![显示 Agent 当前工作状态（agent-status-message）界面示例](/images/plugins/agent-status-message.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable agent-status-message`，点击下图中的 **「显示 Agent 当前工作状态」**。

![Creator 启用菜单：点击「显示 Agent 当前工作状态」，插件 ID 为 agent-status-message](/images/plugins/enable/agent-status-message.jpg)

## 显示条件与数据来源

**Agent 服务接入：**&#x5F53;前默认注册名仍为 `mock_agent_status`；服务端要使用此准确工具名，或在项目应用层显式调整具名工具注册。文案来自工具参数。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "TOOL_CALL_START",
    "toolCallId": "call-1",
    "toolCallName": "mock_agent_status"
  },
  {
    "type": "TOOL_CALL_ARGS",
    "toolCallId": "call-1",
    "delta": "{\"label\":\"正在分析工作区\",\"elapsed\":\"0:12\"}"
  },
  {
    "type": "TOOL_CALL_END",
    "toolCallId": "call-1"
  },
  {
    "type": "TOOL_CALL_RESULT",
    "messageId": "result-1",
    "toolCallId": "call-1",
    "role": "tool",
    "content": "{\"applied\":true}"
  }
]
```

`label` 必须是非空字符串，`elapsed` 可省略，提供时也须为非空字符串。`elapsed` 只展示服务端文案，不自动计时。工作中、等待中、完成状态由当前工具调用生命周期推导；`applied` 只是示例结果，不驱动状态。错误、未完成或参数无效时回退工具详情。AG-UI 没有名为 `AGENT_STATUS` 的标准事件。

## 定制选项

| 可以改什么  | 效果                    |
| ------ | --------------------- |
| 状态文字   | 修改卡片上的工作说明。           |
| 耗时文字   | 设置要显示的耗时，例如“已用 20 秒”。 |
| 卡片外观   | 调整颜色、背景、字号和间距。        |
| 整张状态卡片 | 重新排列状态标记、说明和耗时。       |

## 需求示例

```text
请修改「显示 Agent 当前工作状态（agent-status-message）」：
修改：状态说明文字设为【正在整理资料】，字号改为【13px】。
保留：真实任务状态的更新。
```

## 属性

打开项目中的 `plugins/agent-status-message/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalAgentStatusMessage`；类型：`AgentStatusMessageProps`。还接受下方列出的工具调用数据、样式和无障碍属性。

| 属性              | 类型                                                                                    | 省略时 / 用途                                     |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `label?`        | `string`                                                                              | 默认从工具输入参数读取                                  |
| `elapsed?`      | `string`                                                                              | 默认从工具输入参数读取耗时                                |
| `state?`        | `'working' \| 'waiting' \| 'done'`                                                    | 默认从工具运行状态推导                                  |
| `renderStatus?` | `(props: ConversationAgentStatusProps, tool: ConversationToolCallProps) => ReactNode` | 自定义状态内容                                      |
| `Fallback?`     | `ComponentType<ConversationToolCallProps>`                                            | 默认 `ConversationToolFallback`；错误、未完成或数据无效时使用 |

### 外观与无障碍属性

以下属性均可选。

| 属性                 | 类型                                    | 用途      |
| ------------------ | ------------------------------------- | ------- |
| `className`        | `string`                              | 整体样式类   |
| `style`            | `CSSProperties`                       | 整体内联样式  |
| `id`               | `string`                              | 元素标识    |
| `role`             | `HTMLAttributes<HTMLElement>['role']` | 无障碍角色   |
| `aria-label`       | `string`                              | 无障碍名称   |
| `aria-describedby` | `string`                              | 描述元素 ID |
| `onClick`          | `MouseEventHandler<HTMLElement>`      | 点击回调    |

### 当前工具调用的数据与操作

这些数据和方法由现有会话传入，类型为 `ConversationToolCallProps`。`toolCallId`、`toolName`、`args`、`status` 是必需字段，其余已列出的字段可选；修改展示时保留原有传参。

| 属性                 | 类型                                                                          | 用途                        |
| ------------------ | --------------------------------------------------------------------------- | ------------------------- |
| `type?`            | `'tool-call'`                                                               | 消息片段类型                    |
| `toolCallId`       | `string`                                                                    | 工具调用 ID                   |
| `toolName`         | `string`                                                                    | 工具名称                      |
| `args`             | `unknown`                                                                   | 解析后的输入参数                  |
| `argsText?`        | `string`                                                                    | 输入参数的文本形式                 |
| `result?`          | `unknown`                                                                   | 工具结果                      |
| `messages?`        | `readonly ConversationMessage[]`                                            | 关联的嵌套消息                   |
| `isError?`         | `boolean`                                                                   | 结果是否为错误                   |
| `status`           | [`ConversationToolCallStatus`](#conversationtoolcallstatus)                 | 工具当前状态：运行中、已完成、未完成或等待用户操作 |
| `addResult?`       | `(result: unknown) => void`                                                 | 提交前端工具结果                  |
| `resumeInterrupt?` | `(payload: unknown) => Promise<void>`                                       | 提交恢复数据，让暂停的任务继续执行         |
| `decisionRequest?` | [`ConversationCommandDecisionRequest`](#conversationcommanddecisionrequest) | 运行环境提供的操作确认请求             |
| `submitDecision?`  | `(decisionType: string) => Promise<void>`                                   | 提交后端支持的决定                 |

该类型允许传入额外字段，但字段是否生效取决于组件实现，不能据此添加任意配置项。

### 类型说明

#### ConversationToolCallStatus

按 `type` 区分工具状态：运行中、已完成、未完成和等待用户操作。

```ts
type ConversationToolCallStatus =
  | { type: 'running' }
  | { type: 'complete' }
  | { type: 'incomplete'; reason?: string; error?: unknown }
  | { type: 'requires-action'; reason?: string };
```

`reason` 是可选原因，`error` 是未完成时的可选错误详情。

#### ConversationCommandDecisionRequest

运行环境提供的操作确认请求。

```ts
interface ConversationCommandDecisionRequest {
  allowedDecisions: readonly string[]; // 后端允许提交的决定标识
  description?: string; // 请求说明
}
```

提交决定时使用 `allowedDecisions` 中的原始标识。

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalAgentStatusMessage } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalAgentStatusMessage>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
