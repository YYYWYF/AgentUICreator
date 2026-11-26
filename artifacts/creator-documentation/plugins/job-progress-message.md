# 后台任务进度（job-progress-message）

## 功能与效果


![任务运行中的阶段进度](/images/plugins/behavior/job-running.jpg)

运行中的任务：进度条、阶段名称、预计时间和右上角的停止入口一起展示。

展示长任务的阶段进度、预计剩余时间和最终结果，并沿用当前运行已经接入的停止操作。

### 随任务更新阶段进度

插件将工具参数中的阶段列表与当前任务的实时进度组合展示，自动标记当前阶段并显示该阶段的说明。进度数据按工具调用 ID 对应到当前任务。

整体百分比由各阶段权重计算。例如两个阶段的权重为 2 和 1，第一阶段完成、第二阶段完成一半时，整体约为 83%。这部分计算由插件提供，业务页面无需另外合并百分比。

### 显示预计时间与最终结果

运行期间显示任务状态中的预计剩余时间。收到成功、部分完成、失败或取消结果后，卡片切换为对应终态，显示可用的结果说明和耗时，停止入口随之消失。


![任务成功后的结果卡片](/images/plugins/behavior/job-finished.jpg)

同一次任务成功后，进度条填满并显示结果说明；运行时的停止入口已经消失。

部分完成、失败和取消保留各自结果，不会统一显示成全部成功。只收到工具参数结束事件，不表示任务已经成功完成。

### 运行期间停止任务

项目已有当前运行的停止绑定时，运行中的卡片提供停止入口，点击沿用这份绑定。插件不会创建另一套任务控制服务；实际任务是否停止仍由原有运行与 Agent 服务处理。

### 数据不足时保留工具详情

缺少有效阶段参数、当前任务进度，或任务需要用户处理而不适合展示普通进度时，插件回到通用工具详情。修改卡片上的展示值不能代替真实进度和终态数据。

## 数据来源与显示条件

### 接入阶段、实时进度和结束结果 \{#显示条件与数据来源}

需要工具 `run_ci_job` 的参数、`STATE_*` 中的实时进度，以及最终工具结果三部分。`jobs` 的键必须与 `toolCallId` 相同。以下按顺序列出本插件需要的事件；通用运行事件和 SSE 包装见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```jsonl
{"type":"STATE_SNAPSHOT","snapshot":{"jobs":{"job-1":{"stageIndex":0,"stageProgress":0.1,"eta":"约 1 分钟"}}}}
{"type":"TOOL_CALL_START","toolCallId":"job-1","toolCallName":"run_ci_job"}
{"type":"TOOL_CALL_ARGS","toolCallId":"job-1","delta":"{\"target\":\"生成报告\",\"stages\":[{\"name\":\"收集资料\",\"weight\":1},{\"name\":\"生成文件\",\"weight\":2}]}"}
{"type":"TOOL_CALL_END","toolCallId":"job-1"}
{"type":"STATE_DELTA","delta":[{"op":"replace","path":"/jobs/job-1/stageIndex","value":1},{"op":"replace","path":"/jobs/job-1/stageProgress","value":0.5},{"op":"replace","path":"/jobs/job-1/eta","value":"即将完成"}]}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"job-1","role":"tool","content":"{\"status\":\"success\",\"summary\":\"报告已生成\",\"elapsedMs\":2300}"}
```

数据分为工具参数和任务 state：

- **工具参数**：包含非空 `target` 和 `stages` 数组。每阶段提供非空 `name`、数值 `weight`，可含 `description`；业务应使用正权重。
- **任务 state**：每个任务包含数值 `stageIndex`、`stageProgress` 和字符串 `eta`。阶段索引从 0 开始，阶段进度使用 0–1。

`STATE_SNAPSHOT` 是完整 Agent state，已有其他字段时应一起保留；后续 `STATE_DELTA` 使用标准 JSON Patch 更新既有路径。

最终结果可以使用：

- `status: "success" | "partial" | "failed" | "cancelled"`，也可放在 `outcome` 内。
- 或使用 `success: true | false`。
- 可选补充 `summary` 和非负 `elapsedMs`。

只发 `TOOL_CALL_END` 不表示作业成功。缺少有效参数、`jobs[toolCallId]` 或终态结果时可能回退工具详情。

项目应用层还须保留现有 Runtime 的 `state`、`abortRun` 到组件的桥接；仅启用消息插件或发送 state 不会创建工具卡片。取消会调用当前运行的停止方法，实际任务取消仍由 Agent 服务处理。


`renderProgress(progress, tool)` 提供阶段、当前阶段位置、阶段进度、结果和可用操作，并保留原工具调用。可据此组合业务进度视图，继续使用提供的取消回调；跨插件传递业务结果见[插件联动与取数](/development/plugin-interaction.md)。

## 常见定制





### 调整进度卡片布局


在已有消息插件入口调整容器宽度。保留现有 `state` 和 `abortRun` 绑定，阶段、结果和停止行为继续由插件处理：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { JobProgressMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/job-progress-message';

export function JobProgressMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    style={{ ...props.style, maxWidth: 480 }} />;
}
```

### 为默认进度卡片增加业务容器 \{#自定义紧凑进度内容}


需要统一页面布局时，可以复用已经组合好的默认进度属性，保留阶段、终态和取消操作：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { JobProgressMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/job-progress-message';
import { JobProgress } from '@za38.03/agent-ui-plugins';

export function JobProgressMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    renderProgress={progress => <section className="project-job"><JobProgress {...progress} /></section>} />;
}
```

## 属性与 API



### API

以下选项用于定制已有工具展示。当前工具的参数、结果和运行状态由原入口提供，正常使用无需重新构造它们。

| 属性                | 类型                                                                        | 省略时 / 用途                                          |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `renderProgress?` | `(props: JobProgressProps, tool: ConversationToolCallProps) => ReactNode` | 自定义整个进度卡片                                         |
| `Fallback?`       | `ComponentType<ConversationToolCallProps>`                                | 默认 `ConversationToolResult`；阶段数据无效或任务状态不适合展示进度时使用 |

任务目标、阶段、进度、耗时和完成结果由工具数据与现有运行环境提供，不提供重复覆盖属性。项目入口仍通过 `state` 传入已有的共享任务状态，通过 `abortRun` 传入停止操作；这是运行环境接线，沿用生成入口即可。

#### 当前工具调用的数据与操作

`renderProgress(progress, tool)` 中，`progress` 是已组合的阶段、进度、结束结果与取消操作，`tool` 是原工具调用。业务卡片需要关联任务时读取 `tool.toolCallId`；显示进度和停止入口时沿用 `progress`，不从工具状态名称猜测完成百分比。

公共字段、状态判断和操作回调见[工具调用参数](/plugins/tool-result.md#当前工具调用的数据与操作)。

#### 阶段权重和完成结果 \{#jobprogressstage}

`stages` 的每项包含 `name: string`、`weight: number` 和可选 `description: string`。名称与说明用于展示，权重用于把各阶段进度合并为整体百分比：

```json ag-ui
[ { "name": "读取材料", "weight": 2 }, { "name": "生成报告", "weight": 1 } ]
```

使用正权重时，以上两个阶段分别占总进度的三分之二和三分之一。`stageIndex` 从 `0` 开始；处于第二阶段且 `stageProgress` 为 `0.5` 时，整体进度约为 83%。`stageProgress` 的展示会限制在 `0` 到 `1`。


任务结束后，`outcome` 用 `status` 区分 `success`（成功）、`partial`（部分完成）、`failed`（失败）、`cancelled`（取消），可选 `summary: string` 显示结果说明。例如 `{ status: 'partial', summary: '已处理 8 个文件，2 个读取失败' }` 应保留部分完成状态，而不是画成全部成功。

这些属性只控制卡片；真实阶段、进度、结束与停止仍来自现有工具和 Host。



