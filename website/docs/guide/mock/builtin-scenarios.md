---
title: "选择内置演示场景"
---

# 选择内置演示场景

设置面板的公开场景集合是 `showcaseMockScenarios`。它合并后端协议参考和前端呈现演示；仅用于组件回归的输入/引用 fixture 不全部出现在面板中。

## 按验证目标选用

文本与 Markdown 检查基本消息；思考/工具检查流式与结果；审批/问答检查等待用户；状态/计划检查增量；文件、图表和检索检查结构化数据；取消/恢复检查生命周期。SubAgent 任务只验证已收到数据的展示。

选择场景后核对资源要求、启动、连接助理，再发送消息。速度只调整演示时序，不表示真实 Agent 性能。缺少前端工具执行服务或 renderer 时先补前提，不用错误截图宣称功能成功。

## 当前公开场景

以下 ID 来自实际集合。标题是场景数据；具体 UI 可能由 locale 层翻译。资源 ID 是安装目录身份，不翻译。

| 场景 ID | 标题 | 用途 | 所需资源声明 |
| --- | --- | --- | --- |
| `composer-mention-context` | Composer · Mention Backend Context | 服务端按稳定员工 ID 查询示例花名册，将安全字段注入 AG-UI Context 后回答。 | `conversation-lexical-input`、`conversation-command-source`、`conversation-mention`、`composer-trigger-demo` |
| `web-search` | Web Search | 标准 AG-UI 工具调用，通过独立 UI Plugin 展示网页搜索结果。 | `web-search` |
| `retrieval-chunks` | Retrieval Chunks | 标准 AG-UI 工具调用，通过独立 UI Plugin 展示检索片段。 | `retrieval-chunks` |
| `source-citations` | Tool Result：Source Citations | search_sources 返回应用自定义来源结构，由 named Tool UI 展示官方 Sources。 | `source-citations-message` |
| `multimodal-input` | Multimodal Input | 发送文本、小图片或 PDF 附件，使用标准 AG-UI 多模态输入。固定回复不代表附件已经验收，请检查实际请求。 | 无额外声明，仍需基础会话组合 |
| `concurrent-conversations` | Concurrent Conversations | 在两个会话分别发送 AAA / BBB，观察交错的慢速 stream 和独立 Stop。 | 无额外声明，仍需基础会话组合 |
| `simple-chat` | Simple Chat | 模拟一次纯文本流式回复。 | 无额外声明，仍需基础会话组合 |
| `markdown-showcase` | Markdown Showcase | 展示 Markdown / GFM 常见文本类型及代码块的流式渲染。 | 无额外声明，仍需基础会话组合 |
| `reasoning-chat` | Reasoning + Message | 模拟一次思考和最终回复。 | `reasoning` |
| `reasoning-tool-success` | Reasoning → Tool → Answer | 模拟一次思考、工具调用、再次思考和最终回复。 | `reasoning`、`tool-group`、`tool-approval` |
| `parallel-tools` | Parallel Tools | 三个工具以确定性的交错顺序并行执行。 | `tool-group`、`tool-approval` |
| `tool-error` | Run Error During Tool | Tool call 已建立但尚未产生结果时，Agent Run 通过标准 RUN_ERROR 失败。 | `tool-group`、`tool-approval` |
| `approval-resume` | AG-UI Tool Approval | Human in the Loop · Allow / Deny → Resume | `reasoning`、`tool-group`、`tool-approval` |
| `agent-state-sync` | AG-UI State → Job Progress | 使用 ToolCall 锚定 CI Job，再通过 STATE_DELTA 实时推进 transcript 中的 Agent UI JobProgress。 | `tool-group`、`tool-approval`、`job-progress-message` |
| `nested-subagent-conversation` | AG-UI Subagent → Task Card | 标准 AG-UI Subagent 参考案例：父 ToolCall 启动 Researcher，SUBAGENT_* 事件由 react-ag-ui 投影为 nested messages，最终由 Agent UI TaskCard 展示。 | `reasoning`、`tool-group`、`tool-approval`、`task-group` |
| `tool-timeline-thinking` | Thinking → Tool Timeline → Answer | 切换 ThinkingIndicator-only、Reasoning-only、Both；展开三次同名工具的摘要及原始详情。 | `tool-timeline`、`thinking-indicator`、`reasoning`、`tool-approval` |
| `thinking-placeholder` | Thinking Placeholder | 持续 reasoning 时的简洁占位演示；启用 ThinkingIndicator 并关闭 Reasoning 展示实例。 | `thinking-indicator` |
| `resumable-long-run` | 长任务：刷新后继续 | 首段输出后刷新页面，重新订阅同一个 Mock Run。 | 无额外声明，仍需基础会话组合 |
| `resumable-agent-plan` | AgentPlan Activity：刷新后继续 | 刷新后恢复同一个 Run 的最新 Activity 快照，并继续接收增量。 | `agent-plan-message` |
| `cancel-before-first-output` | Cancel Before First Output | 运行开始后等待 10 秒再输出；等待期间点击 Stop 可查看空响应取消展示。 | 无额外声明，仍需基础会话组合 |
| `file-output` | Tool Result：File Output | Backend generate_file 返回虚拟 PDF URL，由 named Tool UI 展示官方文件卡片和下载入口。 | `generated-file-message`、`tool-group`、`tool-approval` |
| `frontend-tool-open-dialog` | Frontend Tool · Open Dialog | 标准 AG-UI 工具调用 → 浏览器弹窗能力 → Tool Result → continuation。 | `frontend-tool-dialog-demo` |
| `frontend-tool-fill-form` | Human Tool · Conversation Form | 会话内收集多个字段，校验并整体提交 ToolMessage 后继续 Agent。 | `human-form-demo` |
| `ask-user-question` | 询问用户偏好 | Frontend Human Tool · 思考、提问、选择、ToolMessage、继续回答 | `ask-user-question-demo` |
| `multi-message-response` | Multi-message Response | 一次回答包含三条连续 assistant 消息，共用一组 Response 操作。 | 无额外声明，仍需基础会话组合 |
| `data-message-chart` | Data Message / Custom Chart | 标准 AG-UI CUSTOM 在 assistant 消息中渲染图表。 | `chart-message` |
| `context-retrieval` | Data Message / Context Retrieval | 标准 AG-UI CUSTOM 上下文检索事件，并在 assistant 消息中显示检索结果。 | `context-retrieval-message` |
| `nested-subagent-task-group` | AG-UI Subagent Task Group | 多个 sibling nested Subagent 通过标准 AG-UI 事件自然组成 official TaskGroup。 | `reasoning`、`tool-group`、`tool-approval`、`task-group` |
| `agent-plan` | AG-UI Activity → AgentPlan | 通过标准 AG-UI Activity 快照和增量权威更新 AgentPlan。 | `agent-plan-message` |
| `agent-status` | Application-defined Tool Args → AgentStatus | 用 application-defined tool args 提供 AgentStatus 文案；state 由前端 ToolCall 状态推导。 | `tool-group`、`tool-approval`、`agent-status-message` |
| `nested-subagent-recursive` | Recursive AG-UI Subagents | 通过标准 AG-UI attribution 展示 Subagent A 委托 child Tool 并递归生成 Subagent B 的 nested TaskCard。 | `reasoning`、`tool-group`、`tool-approval`、`task-group` |
| `nested-subagent-error` | AG-UI Subagent Error | 展示带有归属内容的 SUBAGENT_ERROR nested reference case：nested assistant message 标记为 incomplete/error，保留错误前的 transcript。 | `tool-group`、`tool-approval`、`task-group` |

## 演示与业务的区别

前端工具仍由浏览器服务 execute；历史与持久恢复由开发 store 模拟，不证明业务后端可恢复。Mock 返回预设内容，不根据用户问题调用模型。不要向真实业务系统发送演示写操作。

切换场景前等待或停止当前运行，必要时新建会话隔离状态。复现时记录场景 ID、速度、包身份、语言、主题和启用组合。

> 截图待补：面板实际分组、场景详情与资源要求；另拍推理工具、审批、计划、结构化结果及取消恢复各一组。

继续：[自定义场景](./author-scenarios)、[JSONL 回放](./local-recordings)。
