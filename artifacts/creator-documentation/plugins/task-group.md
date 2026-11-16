# SubAgent 任务与结果（task-group）

多个 SubAgent 任务显示为可展开的卡片。用户可以分别查看任务名称、执行状态，以及返回的过程和结果；某个 SubAgent 失败时保留该项失败状态。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![查看 SubAgent 任务与结果（task-group）界面示例](/images/plugins/task-group.png)

## 启用与使用

工作台、悬浮助手和嵌入式助手的新建项目默认启用 `task-group`，组合到 `conversation-surface` 的 `taskGroup` 位置。后端返回符合下方条件的子任务事件时，才会显示任务卡片，无需手动启用。

模板更新不会自动修改已有项目。已有项目尚未添加或已停用本插件时，在 **Creator 输入框**输入 `/enable task-group`，点击下图中的 **「查看 SubAgent 任务与结果」**。

![Creator 启用菜单：点击「查看 SubAgent 任务与结果」，插件 ID 为 task-group](/images/plugins/enable/task-group.jpg)

可使用 Mock 的 `nested-subagent-conversation`、`nested-subagent-task-group`、`nested-subagent-recursive` 和 `nested-subagent-error` 场景，分别检查单个任务、任务分组、递归委派与失败展示，见[内置场景](/mock/builtin-scenarios.md)。

## 显示条件与数据来源

**Agent 服务接入：**&#x5148;创建父工具调用，再通过 `parentToolCallId` 关联 SubAgent。子消息使用同一个 `subagentRunId`。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "TOOL_CALL_START",
    "toolCallId": "delegate-1",
    "toolCallName": "delegate_specialist"
  },
  {
    "type": "TOOL_CALL_ARGS",
    "toolCallId": "delegate-1",
    "delta": "{\"task\":\"检索政策\",\"subagent_type\":\"researcher\"}"
  },
  {
    "type": "TOOL_CALL_END",
    "toolCallId": "delegate-1"
  },
  {
    "type": "SUBAGENT_STARTED",
    "subagentRunId": "research-1",
    "parentToolCallId": "delegate-1",
    "name": "资料研究员"
  },
  {
    "type": "TEXT_MESSAGE_START",
    "messageId": "child-answer-1",
    "role": "assistant",
    "subagentRunId": "research-1"
  },
  {
    "type": "TEXT_MESSAGE_CONTENT",
    "messageId": "child-answer-1",
    "delta": "已找到相关政策。",
    "subagentRunId": "research-1"
  },
  {
    "type": "TEXT_MESSAGE_END",
    "messageId": "child-answer-1",
    "subagentRunId": "research-1"
  },
  {
    "type": "SUBAGENT_FINISHED",
    "subagentRunId": "research-1",
    "outcome": {
      "type": "success"
    },
    "result": {
      "summary": "检索完成"
    }
  },
  {
    "type": "TOOL_CALL_RESULT",
    "messageId": "result-1",
    "toolCallId": "delegate-1",
    "role": "tool",
    "content": "{\"summary\":\"检索完成\"}"
  }
]
```

`delegate_specialist` 是示例业务工具名，可换成业务实际使用的名称。界面按父工具和子任务的 ID 关联消息，将子任务内容显示在对应的任务分组中。完整展示需要父工具调用、子任务生命周期及带归属的消息内容。

多个同级任务分别使用各自的父工具 ID 与 SubAgent 运行 ID。失败时使用 `SUBAGENT_ERROR`（含 `subagentRunId`、`message`），保留已经产生的子消息；父工具结果和终态仍需由后端如实提供。这些事件通过当前会话的 AG-UI 连接发送。

## 定制选项

| 可以改什么 | 效果                    |
| ----- | --------------------- |
| 任务组外观 | 通过项目样式调整任务组的宽度、间距和背景。 |
| 整体排版  | 自定义整组任务卡片的排列和展示。      |

## 需求示例

```text
请修改「查看 SubAgent 任务与结果（task-group）」：
修改：任务卡片改为【纵向排列】，卡片间距设为【12px】，背景改为【浅灰色】。
保留：真实任务名称、状态、结果和原有交互。
```

## 属性

打开项目中的 `plugins/task-group/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalTaskGroupPlugin`；类型：`TaskGroupPluginProps`。

| 属性             | 类型                                                                   | 省略时 / 用途        |
| -------------- | -------------------------------------------------------------------- | --------------- |
| `group?`       | `unknown`                                                            | 会话运行环境提供的当前任务分组 |
| `className?`   | `string`                                                             | 默认任务组的样式类       |
| `renderGroup?` | `(props: ComponentProps<typeof ConversationTaskGroup>) => ReactNode` | 替换整个任务组         |

仅公开上述外观参数，没有根级 `style` 或任意 DOM 属性。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalTaskGroupPlugin } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalTaskGroupPlugin>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
