---
title: 前端消费的 AG-UI 与扩展契约
---

# 前端消费的 AG-UI 与扩展契约

前端把 AG-UI 交给 canonical assistant-ui Conversation Runtime，再通过适配与 Plugin 展示。本页说明消费边界，不实现 Agent 后端，也不另建消息生命周期。

| 输入类别 | 前端投影 | 必须保留 |
| --- | --- | --- |
| RUN_STARTED/FINISHED/ERROR | 当前运行与错误。 | thread/run 身份，结束不直接等于业务成功。 |
| TEXT_MESSAGE_START/CONTENT/END | 流式消息内容。 | messageId、role 和增量顺序。 |
| TOOL_CALL_START/ARGS/END/RESULT | 工具调用、参数与结果。 | toolCallId、名字、结果归属和错误。 |
| STATE_SNAPSHOT / STATE_DELTA | 共享状态与 patch。 | 快照权威性、patch 基础与 schema。 |
| ACTIVITY_SNAPSHOT / ACTIVITY_DELTA | 活动消息，如 agent-plan。 | activityType、messageId、增量基础。 |
| CUSTOM 与命名结构化内容 | 注册的数据 renderer 或应用事件。 | 准确 name、payload 校验、未知类型处理。 |
| 中断与工具待回答 | 审批、问题、恢复。 | 中断身份、允许/拒绝/取消和后端恢复合同。 |

## 常见命名路由

计划的数据消息注册为 `agui-activity/agent-plan`；上下文检索为 `CONTEXT_CONTENT`；图表为 `chart`。命名工具如 `mock_agent_status`、`run_ci_job`、`generate_file` 使用各 Plugin definition 的准确名字。完整片段见对应[Plugin 专页](../plugins/)，不按展示标题猜工具名。

计划内容 `steps` 和 `activeIndex` 由后端发布，activeIndex 为 0 至步骤数的整数。前端不因流结束自动完成计划。状态 snapshot 和 delta、activity snapshot 和 delta 分别按其合同处理，不能把 JSON patch 当成完整内容。

## 工具与结果

后端 toolkit 是 render-only 输入；前端执行经应用 allowlist 与 `AgentFrontendToolSource`，UI registry 不能授权 execute。root-thread 执行合同不扩展到嵌套子代理。

无效结构化数据走 Fallback 或明确错误，不构造虚假成功。文件/来源 URL 仍是外部数据，业务控制访问权限。未识别事件不应破坏已有会话投影。

## 验证

用当前包的 AG-UI schema 校验样例，再验证流顺序、错误、取消、历史加载和恢复。Mock 是确定性证据，不能替代真实后端协议验收。

> 截图待补：脱敏事件序列与消息、工具、计划、状态变化的对应图。
