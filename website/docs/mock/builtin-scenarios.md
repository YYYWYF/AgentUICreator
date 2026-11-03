---
title: "内置演示场景"
---

# 内置演示场景

设置面板列出官方内置演示场景，覆盖 AG-UI 事件与前端展示。仅用于仓库内部测试的场景不对外提供。

## 场景选择依据

文本与 Markdown 检查基本消息；思考/工具检查流式与结果；审批/问答检查等待用户；状态/计划检查增量；文件、图表和检索检查结构化数据；取消检查能否停止当前任务。SubAgent 任务只验证已收到数据的展示。

首次使用见[启动与连接](/mock/getting-started)；选择测试场景的方法见[Mock 服务](/mock/#验证场景选择)。

## 对照界面选择场景

例如要检查思考与工具展示，在「搜索 Mock」输入 `reasoning-tool-success`，选中「思考、调用工具并回答」。卡片上的 `REASONING_*` 和 `TOOL_CALL_*` 表示它覆盖的事件；上方的播放时长倍率可以放慢输出，方便观察中间状态。

![搜索并选中思考、调用工具并回答场景](/images/guide/mock-scenario-selection.png)

选择后，在已连接 Mock 的 Agent UI 中发送一条消息。下图是该场景的实际回复：可以展开思考过程，检查工具结果与最终回答的排版。

![思考与工具场景的实际回复效果](/images/start/07-demo-conversation.png)

### 检查等待用户与继续回答

选择 `ask-user-question`，先通过 Creator 启用 [`ask-user-question`](/plugins/ask-user-question) 插件，再发送「请先询问我的首页布局偏好，再继续设计」。回复会停在选项处，可检查问题说明、选项和等待期间的停止按钮。

![问答场景等待用户选择首页布局](/images/guide/mock-question.png)

选择「数据总览」后，界面记录选择并继续回答。检查选项提交后是否能顺利续答，以及输入框是否恢复可用。

![提交布局选择后继续回答](/images/guide/mock-question-complete.png)

## 内置场景目录

在「示例与回放」中按场景名称或 ID 选择。提示缺少插件时，先按提示启用，再发送消息。

| 场景 ID | 名称 | 用来测试什么 |
| --- | --- | --- |
| `composer-mention-context` | Composer · Mention Backend Context | 服务端按稳定员工 ID 查询示例花名册，将安全字段注入 AG-UI Context 后回答。 |
| `web-search` | Web Search | 标准 AG-UI 工具调用，通过独立 UI Plugin 展示网页搜索结果。 |
| `retrieval-chunks` | Retrieval Chunks | 标准 AG-UI 工具调用，通过独立 UI Plugin 展示检索片段。 |
| `source-citations` | Tool Result：Source Citations | search_sources 返回应用自定义来源结构，由按工具名注册的界面展示官方 Sources。 |
| `multimodal-input` | Multimodal Input | 发送文本、小图片或 PDF 附件，使用标准 AG-UI 多模态输入。固定回复不代表附件已经验收，请检查实际请求。 |
| `concurrent-conversations` | Concurrent Conversations | 在两个会话分别发送 AAA / BBB，观察交错的慢速 stream 和独立 Stop。 |
| `simple-chat` | Simple Chat | 模拟一次纯文本流式回复。 |
| `markdown-showcase` | Markdown Showcase | 展示 Markdown / GFM 常见文本类型及代码块的流式渲染。 |
| `reasoning-chat` | Reasoning + Message | 模拟一次思考和最终回复。 |
| `reasoning-tool-success` | Reasoning → Tool → Answer | 模拟一次思考、工具调用、再次思考和最终回复。 |
| `parallel-tools` | Parallel Tools | 三个工具以确定性的交错顺序并行执行。 |
| `tool-error` | Run Error During Tool | Tool call 已建立但尚未产生结果时，Agent Run 通过标准 RUN_ERROR 失败。 |
| `approval-resume` | AG-UI Tool Approval | Human in the Loop · Allow / Deny → Resume |
| `agent-state-sync` | AG-UI State → Job Progress | 工具调用关联 CI 作业，随后通过 STATE_DELTA 更新进度卡片。 |
| `nested-subagent-conversation` | AG-UI Subagent → Task Card | 父工具调用启动 Researcher 子任务，返回 SubAgent 事件，在任务卡片中展示子任务消息。 |
| `tool-timeline-thinking` | Thinking → Tool Timeline → Answer | 切换 ThinkingIndicator-only、Reasoning-only、Both；展开三次同名工具的摘要及原始详情。 |
| `thinking-placeholder` | Thinking Placeholder | 持续 reasoning 时的简洁占位演示；启用 ThinkingIndicator 并关闭 Reasoning 展示实例。 |
| `cancel-before-first-output` | Cancel Before First Output | 运行开始后等待 10 秒再输出；等待期间点击 Stop 可查看空响应取消展示。 |
| `file-output` | Tool Result：File Output | Backend generate_file 返回虚拟 PDF URL，由按工具名注册的界面展示官方文件卡片和下载入口。 |
| `frontend-tool-open-dialog` | Frontend Tool · Open Dialog | 标准 AG-UI 工具调用 → 浏览器弹窗能力 → Tool Result → continuation。 |
| `frontend-tool-fill-form` | Human Tool · Conversation Form | 会话内收集多个字段，校验并整体提交 ToolMessage 后继续 Agent。 |
| `ask-user-question` | 询问用户偏好 | Frontend Human Tool · 思考、提问、选择、ToolMessage、继续回答 |
| `multi-message-response` | Multi-message Response | 一次回答包含三条连续 assistant 消息，共用一组 Response 操作。 |
| `data-message-chart` | Data Message / Custom Chart | 标准 AG-UI CUSTOM 在 assistant 消息中渲染图表。 |
| `context-retrieval` | Data Message / Context Retrieval | 标准 AG-UI CUSTOM 上下文检索事件，并在 assistant 消息中显示检索结果。 |
| `nested-subagent-task-group` | AG-UI Subagent Task Group | 返回多个同级 SubAgent 的事件，在界面中形成任务组。 |
| `agent-plan` | AG-UI Activity → AgentPlan | 通过标准 AG-UI Activity 快照和增量更新 AgentPlan。 |
| `agent-status` | Application-defined Tool Args → AgentStatus | 工具参数提供状态文字，工具调用状态决定进行中或完成标记。 |
| `nested-subagent-recursive` | Recursive AG-UI Subagents | 展示 SubAgent A 继续委派任务给 SubAgent B 的嵌套任务卡片。 |
| `nested-subagent-error` | AG-UI Subagent Error | 展示 SubAgent 执行失败的状态，保留错误发生前的消息。 |

继续：[本地数据回放](/mock/local-recordings)。

「询问用户偏好」场景使用正式的 [`ask-user-question`](/plugins/ask-user-question) 插件。先通过 Creator 的启用插件入口添加，Mock 用于演示工具调用、回答和续答。
