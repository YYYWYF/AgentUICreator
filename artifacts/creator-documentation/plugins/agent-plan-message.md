# 任务计划与完成状态（agent-plan-message）


![计划正在执行第一步](/images/plugins/behavior/plan-running.jpg)

图中第一步正在执行并显示说明，完成数量为 0 / 4；后续步骤尚未开始。

将 Agent 提供的计划展示为步骤列表，自动区分已完成、当前执行和未开始的步骤，并随计划消息更新完成进度。

## 展示当前计划

收到有效计划后，插件显示计划标题、步骤、完成数量和进度条。每一步可以包含名称和说明，当前步骤有说明时会一起显示。

计划来自 Agent 发送的结构化消息，插件不会根据工具调用次数、思考文字或经过的时间自行生成计划。

## 当前步骤与完成进度

计划中的 `activeIndex` 表示当前步骤，索引从 0 开始：位于它之前的步骤显示为完成，当前项显示为执行中，其余项显示为未开始。

例如两步计划从 `0` 更新到 `1` 时，第一步自动变为完成，第二步成为当前步骤；更新到 `2`，即步骤总数时，全部步骤显示完成。这些变化由计划数据驱动，无需用户分别设置每一步的图标或完成状态。

## 同一计划持续更新

后续消息使用同一个计划消息 ID 更新当前步骤或其他内容，现有卡片随之更新。计划完成位置只表达 Agent 上报的计划进展，不会在前端执行下一步任务。


![计划全部步骤完成](/images/plugins/behavior/plan-finished.jpg)

同一份计划更新到末尾后，完成数量变为 4 / 4，所有步骤显示完成标记。

原始计划的数据结构无效时不显示卡片，展示属性不能代替一份有效计划。

## 接入计划消息 \{#显示条件与数据来源}

计划由 `activityType: "agent-plan"` 的 Activity 快照提供，后续 delta 更新同一个 `messageId`。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```jsonl
{"type":"ACTIVITY_SNAPSHOT","messageId":"plan-1","activityType":"agent-plan","replace":true,"content":{"title":"生成报告","steps":[{"id":"search","label":"检索资料"},{"id":"write","label":"生成报告"}],"activeIndex":0}}
{"type":"ACTIVITY_DELTA","messageId":"plan-1","activityType":"agent-plan","patch":[{"op":"replace","path":"/activeIndex","value":1}]}
{"type":"ACTIVITY_DELTA","messageId":"plan-1","activityType":"agent-plan","patch":[{"op":"replace","path":"/activeIndex","value":2}]}
```

- **步骤**：`steps` 每项需要非空 `label`，可含非空 `id`、字符串 `description`。
- **标题**：`title` 可省略。
- **当前步骤**：`activeIndex` 是从 0 开始的整数；之前的步骤视为完成，等于 `steps.length` 时全部完成。

无效数据不显示计划。

先发完整快照，再逐条发送 JSON Patch；恢复实时运行时先重发最新完整快照。Runtime 将其映射到具名消息 `agui-activity/agent-plan`，服务端仍发送 `ACTIVITY_*`。工具次数、思考文字和耗时不会自动生成或推进计划。


`renderPlan(plan)` 提供计划标题、`steps` 和 `activeIndex`，可直接交给项目的业务步骤组件。它读取当前计划卡片的数据；需要独立插件同步业务选择或结果时，使用[共享 Service](/development/plugin-interaction.md#插件之间共享选择或结果)。


## 调整计划卡片间距


在已有消息插件入口调整外观，继续让计划消息决定当前步骤：

```tsx
import type { ComponentProps } from 'react';
import { AgentPlanMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-plan-message';

export function AgentPlanMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    style={{ ...props.style, padding: 12 }} />;
}
```

## 使用项目自己的步骤列表 \{#用有序列表显示步骤}


`renderPlan` 接收已解析的计划。需要替换整个版式时，应继续表达已完成和当前步骤，而不是把它们降为一组普通文字：

```tsx
import type { ComponentProps } from 'react';
import { AgentPlanMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-plan-message';

export function AgentPlanMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    renderPlan={plan => (
      <ol>{plan.steps.map((step, index) => (
        <li key={typeof step === 'string' ? index : step.id ?? index}
          aria-current={index === plan.activeIndex ? 'step' : undefined}
          data-completed={index < plan.activeIndex}>
          {typeof step === 'string' ? step : step.label}
        </li>
      ))}</ol>
    )} />;
}
```

这会替换默认标题、完成计数和进度条；需要这些内容时由业务版式补充。原始计划校验仍由插件负责。

## API

以下选项用于定制已有消息展示。`data` 由已注册的消息入口提供；正常使用无需另建一份展示数据。



还支持 `className`、`style`、`id`、`role`、`aria-label`、`aria-describedby` 和 `onClick`。

| 属性            | 类型                                                 | 省略时 / 用途                 |
| ------------- | -------------------------------------------------- | ------------------------ |
| `data`        | `unknown`                                          | 必需，由会话传入的计划消息；数据无法解析时不显示 |
| `renderPlan?` | `(props: ConversationAgentPlanProps) => ReactNode` | 自定义整个计划内容                |

标题、步骤与当前步骤索引均从 `data` 解析，不提供重复覆盖属性。

### 步骤内容与当前步骤 \{#conversationagentplanstep}

`steps` 可直接使用字符串数组；需要标题、说明和稳定标识时，每项使用 `{ id?: string; label: string; description?: string }`。

```json
[ { "id": "read", "label": "读取材料", "description": "确认范围与约束" }, { "id": "answer", "label": "整理答复" } ]
```

消息数据中的 `activeIndex` 从 `0` 开始，值为 `1` 会高亮第二步；它是展示位置，不会执行步骤。`renderPlan(plan)` 收到已组合的标题、步骤和索引，可按前面的有序列表示例改变排版。原始消息 `data` 仍需通过校验。






