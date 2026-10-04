# Mock Scenario Catalog

The Mock Agent is a development-only simulator. It emits standard
`@ag-ui/core` events and exercises the same live frontend path as a real Agent
endpoint:

```text
Mock Scenario
→ @ag-ui/core events
→ HTTP SSE
→ @ag-ui/client HttpAgent
→ @assistant-ui/react-ag-ui
→ Conversation Runtime
→ assistant-ui
```

The Vite Mock endpoint and Scenario Studio expose the showcase catalog only.
Regression fixtures remain available through `@agent-ui/mock-agent` imports and
direct `runMockScenario()` calls.

Live Mock Agent scenarios and synthetic Conversation History fixtures are
separate catalogs. The Mock Agent emits AG-UI events; Mock History serves
LangGraph `StateSnapshot` data and never emits AG-UI events.

## Backend Reference Profile

```text
AG-UI: 0.0.59
Transport: HTTP SSE
Consumer: @assistant-ui/react-ag-ui
```

Scenarios marked `backend` are intended as backend implementation references.
Application-defined presentation scenarios are marked `frontend`, and
regression fixtures are marked `internal`.

The profile uses these wire-level rules:

- `TOOL_CALL_ARGS.delta` is streamed text containing JSON arguments.
- `TOOL_CALL_END` means argument streaming has finished; it does not mean tool execution has finished.
- `TOOL_CALL_RESULT.content` is a string in the current 0.0.59 profile.
- `subagentRunId` identifies event attribution; it does not create isolated subagent state.

The `approval-resume` fixture contains one interrupt. Production implementations
correlate resume entries by `interruptId`, not by array position.

## Showcase Catalog

| Section | Scenario ID | Display purpose | Audience | Reference level |
|---|---|---|---|---|
| Basics | `simple-chat` | Minimal text streaming | Backend Reference | |
| Basics | `markdown-showcase` | Markdown / GFM streaming showcase | Backend Reference | |
| Basics | `reasoning-chat` | Reasoning → Answer | Backend Reference | |
| Basics | `reasoning-tool-success` | Reasoning → Tool → Reasoning → Answer | Backend Reference | Recommended |
| Tools | `parallel-tools` | Parallel Tool Calls | Backend Reference | |
| Tools | `tool-error` | Tool Call followed by standard `RUN_ERROR` | Backend Reference | |
| Human in the Loop | `approval-resume` | Interrupt → Allow/Deny → Resume | Backend Reference | |
| State | `agent-state-sync` | `STATE_SNAPSHOT / STATE_DELTA` → JobProgress | Backend Reference | Recommended |
| Multi-Agent | `nested-subagent-conversation` | Standard `SUBAGENT_*` → TaskCard | Backend Reference | Recommended |
| Multi-Agent | `nested-subagent-task-group` | Sibling Subagents → TaskGroup | Frontend Presentation | Advanced |
| Presentation | `agent-plan` | `ACTIVITY_SNAPSHOT / ACTIVITY_DELTA` → AgentPlan | Frontend Presentation | |
| Advanced | `resumable-agent-plan` | Run Resume + Activity Snapshot → AgentPlan | Frontend Presentation | Advanced |
| Presentation | `agent-status` | Application-defined Tool Args → AgentStatus | Frontend Presentation | |
| Presentation | `file-output` | Backend Tool Result → named Tool UI → File / Download | Frontend Presentation | Recommended |
| Advanced | `nested-subagent-recursive` | Recursive Subagent | Frontend Presentation | Advanced |
| Advanced | `nested-subagent-error` | Nested Subagent Error | Frontend Presentation | Edge case |

The default scenario is `reasoning-tool-success`.

`simple-chat` and `markdown-showcase` use the same standard AG-UI text lifecycle:
`TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT... → TEXT_MESSAGE_END`.
Only the text carried in `TEXT_MESSAGE_CONTENT.delta` differs: plain text for
`simple-chat`, Markdown / GFM text for `markdown-showcase`. Markdown parsing and
rendering belong to frontend presentation, not the AG-UI wire protocol.

`markdown-showcase` is a visual regression fixture for the current renderer.
It covers h1–h6, bold / italic / strikethrough, inline code, a link, a multiline
blockquote, unordered / nested / ordered / task lists, a horizontal rule, a
table with default / center / right alignment, and TypeScript / JSON fenced
code blocks (including a long line). It uses the existing
`ConversationMarkdownText → MarkdownTextPrimitive → @assistant-ui/react-markdown`
path and `remark-gfm`; it adds no renderer, custom events or extension plugins.
Mermaid, math, embedded HTML, footnotes and custom directives are outside this
fixture's scope. Code headers, language labels, copy buttons, overflow and
incomplete Markdown during streaming remain presentation checks.

Protocol coverage is in `packages/mock-agent/tests/markdown-showcase.test.ts`;
focused presentation coverage is in
`packages/react/tests/migrated/assistant-ui-markdown-showcase.test.tsx`, using
standard scenario events through `useAgUiRuntime` and the existing Markdown
component. Browser observation is still needed for streaming layout, overflow
and Footer actions.

`file-output` demonstrates the standard `generate_file` backend Tool lifecycle.
Its JSON string result is converted by the pinned react-ag-ui into an object and
rendered by `plugin/generated-file-message` through `ConversationFile`. The URL
is virtual; no file is generated or fetched by the renderer. See
[Multimodal Output Phase 1](architecture/multimodal-output-phase-1.md) for the
Tool-local schema, ownership, download contract and AG-UI 1.0 migration boundary.

`agent-plan` uses the standard AG-UI Activity lifecycle. The backend sends a
complete `agent-plan` snapshot and then JSON Patch deltas to `activeIndex`;
`react-ag-ui` projects them into one `agui-activity/agent-plan` Data Message
Part, which the AgentPlan resource renders. Progress is authoritative backend
activity, not a frontend inference.

`agent-status` remains an application-defined frontend Tool contract. AG-UI
does not define a dedicated AgentStatus event, so the scenario does not invent
an `AGENT_STATUS` protocol event. Its flow is:

```text
TOOL_CALL_START
→ TOOL_CALL_ARGS (application-defined Tool Args)
→ application projector → AgentStatus
→ TOOL_CALL_END
→ TOOL_CALL_RESULT (acknowledgement)
```

`AgentStatus` reads `label` and `elapsed` from Tool Args and derives its state
from the frontend `ConversationToolCallProps.status` (`running` → `working`,
`requires-action` → `waiting`, `complete` → `done`). It may therefore render
while the Tool Call is still running.

The AgentPlan event flow is `RUN_STARTED → ACTIVITY_SNAPSHOT → ACTIVITY_DELTA* →
TEXT_MESSAGE_* → RUN_FINISHED`. Refresh recovery replays the latest complete
snapshot before subsequent deltas. Old completed history is not guaranteed to
restore a Plan.

`resumable-agent-plan` exercises that live-run contract across a refresh. The
first connection emits `RUN_STARTED`, an `agent-plan` snapshot at `activeIndex: 0`,
and a delta to `activeIndex: 1`. Reattaching the existing run emits a complete
snapshot at `activeIndex: 1`, followed by deltas to `2` and `3`, then
`RUN_FINISHED`. The process-owned mock run remains at `runCount === 1`; recovery
does not start another Agent invocation. Backend Activity is authoritative;
Tool Args and reasoning text do not create or advance the Plan.

JobProgress remains `ToolCall + STATE_SNAPSHOT / STATE_DELTA`; the CI Tool Result
must provide an explicit terminal outcome. A completed stage index does not
imply success.

`tool-error` describes a run failure during a Tool Call. The event is
`RUN_ERROR`; there is no `TOOL_ERROR` event.

## Regression Fixtures

These fixtures retain implementation coverage but are not user-facing catalog
entries:

| Scenario ID | Regression purpose |
|---|---|
| `reasoning-long-preview` | Long reasoning, scrolling, and disclosure behavior |
| `multi-tool` | Sequential Tool lifecycle |
| `tool-long-running` | Long pending/loading/cancel behavior |
| `subagent-lifecycle` | Pure `SUBAGENT_*` protocol lifecycle |

All regression fixtures have audience `internal` and are excluded from the
ordinary Scenario Studio selector.

`STEP_*`:

```text
The Mock runner can emit STEP_STARTED / STEP_FINISHED.
The current assistant-ui react-ag-ui integration does not project them.
Therefore STEP lifecycle remains a runner primitive and is not a user-facing scenario.
```

## Capability Coverage

| Capability | Current owner | Fixture or status |
|---|---|---|
| Markdown / GFM text | Frontend presentation | `markdown-showcase`; standard AG-UI text streaming |
| Agent Elements | Mock Agent | `agent-plan`, `agent-status` |
| Subagents | Mock Agent | `nested-subagent-conversation`, `nested-subagent-task-group`, and related regression fixtures |
| Reasoning + Tool | Mock Agent | `reasoning-tool-success` |
| Tool Error | Mock Agent | `tool-error` |
| Long live reasoning | Mock Agent | `reasoning-long-preview` regression fixture |
| Long persisted transcript | Mock Conversation History | `mock-history-long` |
| Image and file content | Mock Conversation History | `mock-history-attachments`; LangGraph message parts render inline |
| Persisted Sources | Conversation History | `DEFERRED` |
| Live AG-UI Sources | AG-UI profile 0.0.59 | `DEFERRED`; no private event is added |

`packages/mock-agent` remains the live AG-UI simulator. Synthetic checkpoint
fixtures live in `packages/mock-agent/src/conversations` and are
enabled independently with `VITE_CONVERSATION_DATA_MODE=mock`. They remain
separate from live Mock Agent protocols. Standard live subagents use
`SUBAGENT_STARTED`, child events attributed by
`subagentRunId`, and `SUBAGENT_FINISHED` / `SUBAGENT_ERROR`, rendered through
the canonical nested assistant-ui path.

## Subagent Streaming 验收边界

`nested-subagent-conversation` 继续作为标准 Streaming Reference；递归与错误
场景分别复用 `nested-subagent-recursive` 和 `nested-subagent-error`。
这些场景已经包含 preparation、reasoning、execution 和逐字输出延迟，
无需增加另一套 streaming Scenario 或 Subagent state store。

前端增量测试位于
`packages/react/tests/migrated/assistant-ui-nested-subagent.test.tsx`。
test-only `StreamingScenarioAgent` 直接消费 `runMockScenario()` async iterator，
每个事件立即交给 `AbstractAgent` Observable，再由真实 `useAgUiRuntime`
投影到 `ToolCallMessagePart.messages`。它使用 fake timers，并允许在事件交付后
暂停 iterator，以分别检查同一 tick 中相邻的 `SUBAGENT_FINISHED` 与 parent
`TOOL_CALL_RESULT`；不提前收集事件，也不自行解析／投影 Subagent 状态。

覆盖范围包括：运行中的 TaskCard、部分 reasoning、child tool 的参数结束与
结果生命周期、部分文本增长、nested completion metadata、parent result、
最终 Run／Footer、递归 B 在 A 完成前出现、错误前内容保留，以及 unsubscribe
取消。原有 `ScenarioEventAgent` 仍用于最终态测试。

**2026-09-27 状态：focused Streaming 与 product presentation 验收闭环。**
测试拆成严格的 Streaming Contract Tests、product positive acceptance 与
Upstream Presentation Gap Tests。前两者分别走固定版本官方 TaskCard 与真实
`TaskGroupPlugin` / `ConversationTaskGroup` 产品路径，验证相同的逐事件生命周期。
focused suite 共 19 项，全部通过，没有 skip、expected-failure 或 soft assertion。

固定 assistant-ui revision `da9a624496ae97864ae30e90f85c7533092a228d`
的原生 TaskCard 仍没有 reasoning renderer、canonical nested error UI 或
transcript override。两个独立 gap test 使用未修改的官方 TaskGroup，正向检查
canonical message 中的 reasoning、`incomplete/error`、errorCode 与保留的文本，
并断言其官方 transcript 目前缺少对应展示。测试校验 lock revision；未来官方
修复后，gap test 应失败，提醒移除产品组合并将 positive acceptance 切回原生路径。

产品补齐位于 `@agent-ui/react` 的现有 `ConversationTaskGroup` facade，
内部最小 composition 复用官方 TaskCard shell、状态/计时 helpers、审批和 tool
fallback。nested transcript 仅消费 `ToolCallMessagePart.messages`，通过
`ReadonlyThreadProvider`、`MessagePrimitive.Root/Parts`、现有
`ConversationMarkdownText` / `ConversationReasoning` 与
`ConversationCanonicalMessageError` 渲染。工具具名 UI 仍由 canonical toolkit
优先匹配，未知 nested tool 继续递归进入同一 presentation。readonly transcript
保留官方审批边界，group indices/counts 继续来自 assistant-ui。没有修改 vendor、
AG-UI Runtime 或 react-ag-ui，也没有新增 Subagent state、store 或 parser。

ownership guard 保持严格 hash / provenance / inventory 检查。本次修正了
其 inventory 扫描遗漏目录前缀的既有错误，并增加两个 TaskCard 文件的篡改
检测；官方 Element、lock hash 与 provenance 均未修改。guard 的 9 项通过，
`@agent-ui/react` typecheck、build 与 public declaration boundary 通过。

扩展检查中的旧 public API 文本断言、generated fixture URL 与 scoped integration
fixture 已修复：按实际 const export 检查 response aliases，使用文件系统路径
定位 generated fixture，声明 optional theme service 与 response Footer Slot，并
展开官方默认折叠的 tool group 后验证其内容。具名 Tool UI 的 standalone
行为仍被保留。相关 5 个 React 测试文件共 41 项全部通过。

通过的产品 positive acceptance 包括：完成前 partial reasoning/text、A/B 递归
reasoning、child tool running/result、错误前文本、错误后的 canonical alert、
内容与 message identity 保留、无重复 card/message、独立 parent result，及仅在
`RUN_FINISHED` 后出现的最终 Footer。由此可声明：Subagent reasoning, text,
nested tools, recursive subagents, completion and error states are incrementally
rendered end-to-end through the tested product presentation path。

本机浏览器检查使用现有 Host 与 `nested-subagent-conversation`（仅通过启动
环境变量将 speed 设为 10，未更改 Scenario）：观察到 working TaskCard、完成前
partial reasoning、child tool 从 Searching files 到 Searched files / result，以及
partial text。旧 Host 的 conversation-surface 导致的
`Unknown Conversation renderer Slot "assistantResponseFooter"` 已修复：Host
`ensure` 通过正式 Source protocol 更新已安装且未修改的 managed plugins，
Footer/action Source items 补齐默认父插件依赖并提升版本，旧 message Footer
使用薄兼容 wrapper 保留 Slot 所有权。真实旧版 surface/Footer 文件与 lock/hash
升级回归同时检查 AppUIModel 保留、自定义文件保护和重复升级无改动。
Source Registry 的依赖与版本检查共 10 项通过。
fresh Host 的三种模式、两个 sourceRoot 与旧版升级回归共 7 项通过，包含
正式协议增删 visual Plugin 和独立生产构建。fixture 补齐现有 Tailwind 样式
依赖／Vite 插件，使用可移除的 visual child Slot probe，保留 Headless 生命周期
保护。`@agent-ui/project-control` 与 `@agent-ui/react` typecheck 通过。

升级后浏览器最终态通过：TaskCard 为 done，仅一个 card、一个 nested message
及一个 Footer；Stop generating 消失，Copy、Refresh、Export as Markdown 均
出现，没有 Plugin error。Footer 在 parent Run streaming 时仍未出现。
此次人工检查限定于 sandbox Host 的 conversation 场景，递归／错误的逐事件
行为由 focused acceptance 覆盖；不能等同于所有 Host / Mock Studio 的人工
Demo 已通过。完整 workspace suite 尚未通过，本次不作全量绿色声明。

```bash
pnpm --filter @agent-ui/mock-agent test tests/p6-nested-subagent.test.ts
pnpm --filter @agent-ui/react test tests/migrated/assistant-ui-nested-subagent.test.tsx
```

前者验证标准事件、归属、顺序和节奏；后者验证官方 Runtime 与真实 UI 的
增量行为。测试通过、workspace validation 通过、浏览器 Demo 通过和代码推送
是独立的交付事实。

## Development Endpoint

From `examples/creator-host-sandbox`, start the existing Vite app:

```bash
pnpm --filter @agent-ui/creator-host-sandbox dev
```

Select a showcase with `?mockScenario=<scenario-id>`. The default remains
`reasoning-tool-success`. `mockSpeed` controls development timing and can be
used to accelerate long-running showcase steps.

Mock scenarios do not change AppUIModel, Workspace Shell composition, runtime
ownership, or the LangGraph StateSnapshot history contract.
