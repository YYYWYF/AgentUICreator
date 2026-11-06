---
title: "插件显示条件与 AG-UI 数据"
description: 查询各插件的数据来源、AG-UI 事件格式和不显示时的检查方法。
---

# 插件显示条件与 AG-UI 数据

**启用插件后，还要有对应的数据或操作才会显示。** 下表及对应插件页面的“显示条件与数据来源”说明服务端事件与数据格式；组件属性表用于定制展示，不能替代服务端事件。

本文按当前实现说明协议。AG-UI 定义事件结构；`chart`、`CONTEXT_CONTENT`、`run_ci_job` 等名称和业务字段是当前插件约定，不是 AG-UI 的内置事件类型。插件 ID、工具名和消息名用途不同，必须使用各页面列出的准确名称。

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

各插件页的 JSON 数组表示**依次发送的事件**，便于阅读；HTTP 响应仍逐条使用上面的 SSE 格式，不返回整个数组。除页面特别列出的中断结束事件外，将示例放在同一轮 `RUN_STARTED` 与 `RUN_FINISHED` 之间。中断使用 `outcome.type: "interrupt"`，失败使用 `RUN_ERROR`，不能在失败或中断后再追加成功结束。

## 按展示内容找事件

| 插件 | 触发数据 | 示例与显示条件 |
| --- | --- | --- |
| `conversation-surface` | `TEXT_MESSAGE_*`、消息历史及下方各类内容 | [会话界面](./conversation-surface#显示条件与数据来源) |
| `reasoning` | `REASONING_START`、`REASONING_MESSAGE_*`、`REASONING_END` | [思考内容](./reasoning#显示条件与数据来源) |
| `tool-group`、`tool-timeline`、`tool-fallback` | `TOOL_CALL_START/ARGS/END/RESULT` | [通用工具事件](#通用工具事件) |
| `tool-result` | 工具调用，以及 `TOOL_CALL_RESULT.content` 内容数组 | [文本、图片、音视频和文档](./tool-result#启用与使用) |
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

下面的调用会交给已启用的工具展示插件；有同名专用 Tool UI 时优先使用专用展示，否则使用 `toolFallback` 位置的 `tool-result` 或 `tool-fallback`。

```json
[
  { "type": "TOOL_CALL_START", "toolCallId": "call-1", "toolCallName": "lookup_order" },
  { "type": "TOOL_CALL_ARGS", "toolCallId": "call-1", "delta": "{\"orderId\":\"O-1042\"}" },
  { "type": "TOOL_CALL_END", "toolCallId": "call-1" },
  { "type": "TOOL_CALL_RESULT", "messageId": "result-1", "toolCallId": "call-1", "role": "tool", "content": "{\"status\":\"shipped\"}" }
]
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
