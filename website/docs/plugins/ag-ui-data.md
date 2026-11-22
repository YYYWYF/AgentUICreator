---
title: "AG-UI 数据格式与插件数据接入"
description: 了解 AG-UI 数据格式，查询各插件的数据来源、事件格式和不显示时的检查方法。
---

# AG-UI 数据格式与插件数据接入

**启用插件后，还要有对应的数据或操作才会显示。** 下表及对应插件页面的“显示条件与数据来源”说明服务端事件与数据格式。

## AG-UI 数据格式简介

AG-UI（Agent User Interaction Protocol）是 Agent 与前端之间的交互协议。一次运行中，服务端可以依次发送文字、工具调用、状态更新等事件，前端据此更新会话和插件。接入时需要区分两类数据：

- **前端发出的请求**：默认以 POST 发送 `RunAgentInput` JSON，包含会话 `threadId`、本次运行 `runId`、消息 `messages`，以及 `state`、`tools`、`context`、`forwardedProps` 等字段。完整请求示例见[连接 AG-UI 服务](/development/connect-agent#请求体与响应流)。
- **服务端返回的响应**：本项目使用 SSE 持续传输 AG-UI 事件。每条事件是一个 JSON 对象，由必需的 `type` 区分类型，其余字段取决于事件类型。

例如，下面是一条文字增量事件的 JSON 内容；实际传输时还要加上下文和 SSE 包装，见下一节：

```jsonl
{"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-1","delta":"你好。"}
```

`type` 告诉前端如何处理数据；`messageId` 指定更新哪条消息；`delta` 在这里是追加到消息末尾的文字片段。不同事件中的数据字段含义不同：

| 用途 | 常见事件 | 主要数据字段 |
| --- | --- | --- |
| 运行状态 | `RUN_STARTED`、`RUN_FINISHED`、`RUN_ERROR` | 开始与完成使用 `threadId`、`runId`；失败使用 `message`，可附 `code` |
| 文字回复 | `TEXT_MESSAGE_START/CONTENT/END` | `messageId` 关联同一条消息；开始携带 `role`，内容携带文字 `delta` |
| 工具调用与结果 | `TOOL_CALL_START/ARGS/END/RESULT` | `toolCallId` 关联一次调用；开始携带 `toolCallName`，参数使用 `delta`，结果使用 `content` |
| 共享状态 | `STATE_SNAPSHOT`、`STATE_DELTA` | `snapshot` 提供完整状态；`delta` 是按顺序应用的 JSON Patch 操作数组 |
| 活动卡片 | `ACTIVITY_SNAPSHOT`、`ACTIVITY_DELTA` | `messageId` 关联卡片；快照携带 `activityType`、`content`，增量使用 JSON Patch 格式的 `patch` |
| 思考内容 | `REASONING_START`、`REASONING_MESSAGE_*`、`REASONING_END` | 思考消息通过 `messageId` 关联，文字片段使用 `delta` |
| 自定义业务数据 | `CUSTOM` | `name` 标识业务事件，`value` 携带业务数据，具体结构由对应插件约定 |

会话、运行、消息和工具调用是不同层级：一个 `threadId` 下可以有多次 `runId`，一次运行可以产生多条消息和多次工具调用。各事件只携带自身需要的关联字段，不需要把所有 ID 都加到每条事件上。

**同名字段不代表同一种格式。** 文字 `delta` 是字符串，工具参数 `delta` 是拼接后才能解析的 JSON 字符串，状态 `delta` 是 JSON Patch 数组；`CUSTOM.value` 则可以直接携带业务对象。不能把这些数据统一当作文字或普通对象处理。

以上列出本页常用的事件形式；协议事件说明见 [AG-UI 官方文档](https://docs.ag-ui.com/concepts/events)，各插件实际需要的名称和字段以本页及对应插件页为准。

## 共用的 SSE 格式

Agent 接口返回 `Content-Type: text/event-stream`。每条事件写成一行 `data: {JSON}`，事件之间留一个空行。例如，一次完整的文字回复为：

```text
data: {"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}

data: {"type":"TEXT_MESSAGE_START","messageId":"answer-1","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-1","delta":"你好。"}

data: {"type":"TEXT_MESSAGE_END","messageId":"answer-1"}

data: {"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","outcome":{"type":"success"}}

```

`threadId`、`runId` 应使用当前请求的值；消息和工具调用 ID 应在各自生命周期内保持一致，不同对象使用不同 ID。文字增量使用 `delta`。

插件页的 `jsonl` 示例对应 F12 EventStream 的 **Data** 列：每行一个事件。实际发送时，加上 `data:` 前缀和空行，并补齐本次运行的开始与结束事件。

工具参数和结果对象要放入对应事件字段，不作为独立事件发送。

结束事件的格式分为：

- 正常完成：`RUN_FINISHED`，可携带 `outcome: { "type": "success" }`。
- 等待用户输入：`RUN_FINISHED`，携带 `outcome: { "type": "interrupt", "interrupts": [...] }`，其中 `interrupts` 是非空的中断描述数组。
- 错误：`RUN_ERROR`，携带错误描述 `message`，可附错误码 `code`，例如 `{ "type": "RUN_ERROR", "message": "请求超时", "code": "TIMEOUT" }`。

## 按展示内容找事件

| 插件 | 触发数据 | 示例与显示条件 |
| --- | --- | --- |
| `conversation-surface` | `TEXT_MESSAGE_*`、消息历史及下方各类内容 | [会话界面](./conversation-surface#显示条件与数据来源) |
| `reasoning` | `REASONING_START`、`REASONING_MESSAGE_*`、`REASONING_END` | [思考内容](./reasoning#显示条件与数据来源) |
| `tool-group`、`tool-timeline`、`tool-result` | `TOOL_CALL_START/ARGS/END/RESULT` | [通用工具事件](#通用工具事件) |
| `tool-result` | 工具调用，以及序列化到 `TOOL_CALL_RESULT.content` 的内容数组 | [文本、图片、音视频和文档](./tool-result#显示条件与数据来源) |
| `ask-user-question` | 工具 `ask_user_question` 的调用参数；用户回答后续答 | [提问与答案](./ask-user-question#agent-服务接入) |
| `task-group` | 父工具调用、`SUBAGENT_*` 和带 `subagentRunId` 的子消息 | [SubAgent 任务](./task-group#显示条件与数据来源) |
| `agent-status-message` | 工具 `mock_agent_status` 的参数与调用状态 | [状态文字](./agent-status-message#显示条件与数据来源) |
| `agent-plan-message` | `activityType: "agent-plan"` 的 `ACTIVITY_SNAPSHOT/DELTA` | [权威计划](./agent-plan-message#显示条件与数据来源) |
| `job-progress-message` | 工具 `run_ci_job`，以及 `jobs[toolCallId]` 的 `STATE_*` | [后台进度](./job-progress-message#显示条件与数据来源) |
| `generated-file-message` | 工具 `generate_file` 的 JSON 结果 | [生成文件](./generated-file-message#显示条件与数据来源) |
| `chart-message` | `CUSTOM`，`name: "chart"` | [图表](./chart-message#显示条件与数据来源) |
| `source-citations-message` | 工具 `search_sources` 的 JSON 结果 | [引用来源](./source-citations-message#显示条件与数据来源) |
| `retrieval-chunks` | 工具 `search_docs` 的 JSON 结果 | [文档片段](./retrieval-chunks#显示条件与数据来源) |
| `web-search` | 工具 `web_search` 的 JSON 结果 | [网页搜索](./web-search#显示条件与数据来源) |
| `context-retrieval-message` | `CUSTOM`，`name: "CONTEXT_CONTENT"` | [上下文检索](./context-retrieval-message#显示条件与数据来源) |

### 通用工具事件

下面的调用会交给已启用的工具展示插件；有同名专用 Tool UI 时优先使用专用展示，否则使用 `toolFallback` 位置的 `tool-result`。

```jsonl
{"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"lookup_order"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"orderId\":\"O-1042\"}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"call-1","role":"tool","content":"{\"status\":\"shipped\"}"}
{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","outcome":{"type":"success"}}
```

`TOOL_CALL_ARGS.delta` 是 JSON **字符串增量**，拼接后才得到参数对象。`TOOL_CALL_END` 表示参数传输结束，工具仍可继续执行；`TOOL_CALL_RESULT` 才提供结果。业务 JSON 结果先序列化为 `content` 字符串，由当前适配层解析后交给插件；[多模态工具结果](./tool-result)使用标准内容数组。

仅返回结果而没有对应工具调用，无法可靠建立工具名称、参数和展示路由。具名后端 Tool UI 只负责展示，不会替后端执行工具，也不会把它注册成前端能力。

## 收到数据却没有显示

1. 检查插件是否已注册、实例是否启用、是否组合到正确位置。具名工具和数据消息插件通常位于 `applicationPlugins`；工具分组、思考等展示使用会话的对应语义位置。仅安装 npm 包不会自动启用所有插件。
2. 检查实际 SSE，核对 `type`、工具名、`CUSTOM.name` 或 `activityType`，以及关联 ID。把业务 JSON 放进普通文字回复只会显示文字。
3. 对照插件页检查字段、类型和完成条件。无效图表、计划或上下文可能不渲染；不适合专用展示的工具数据会回退到工具详情。不能从“没有报错”推断数据有效。
4. 进度需要先初始化 state 再应用 JSON Patch；Activity delta 需要同 ID 的快照。单发 delta、发错 ID 或只发最终结果不会产生完整实时过程。
5. 交互需要可用的提交、审批恢复或取消服务；文件与媒体 URL 还需浏览器可访问。看到卡片不代表业务执行、下载或恢复已经成功。

可以先用 Creator 的对应 Mock 场景核对前端，再用真实 Agent 服务验证。接入自定义消息见[自定义 AG-UI 事件与消息渲染](/development/custom-ag-ui-events)。
