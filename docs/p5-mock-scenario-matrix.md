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
| Basics | `reasoning-chat` | Reasoning → Answer | Backend Reference | |
| Basics | `reasoning-tool-success` | Reasoning → Tool → Reasoning → Answer | Backend Reference | Recommended |
| Tools | `parallel-tools` | Parallel Tool Calls | Backend Reference | |
| Tools | `tool-error` | Tool Call followed by standard `RUN_ERROR` | Backend Reference | |
| Human in the Loop | `approval-resume` | Interrupt → Allow/Deny → Resume | Backend Reference | |
| State | `agent-state-sync` | `STATE_SNAPSHOT / STATE_DELTA` → JobProgress | Backend Reference | Recommended |
| Multi-Agent | `nested-subagent-conversation` | Standard `SUBAGENT_*` → TaskCard | Backend Reference | Recommended |
| Multi-Agent | `nested-subagent-task-group` | Sibling Subagents → TaskGroup | Frontend Presentation | Advanced |
| Presentation | `agent-plan` | Application-defined Tool Args → AgentPlan | Frontend Presentation | |
| Presentation | `agent-status` | Application-defined Tool Args → AgentStatus | Frontend Presentation | |
| Presentation | `file-output` | Backend Tool Result → named Tool UI → File / Download | Frontend Presentation | Recommended |
| Advanced | `nested-subagent-recursive` | Recursive Subagent | Frontend Presentation | Advanced |
| Advanced | `nested-subagent-error` | Nested Subagent Error | Frontend Presentation | Edge case |

The default scenario is `reasoning-tool-success`.

`file-output` demonstrates the standard `generate_file` backend Tool lifecycle.
Its JSON string result is converted by the pinned react-ag-ui into an object and
rendered by `plugin/generated-file-message` through `ConversationFile`. The URL
is virtual; no file is generated or fetched by the renderer. See
[Multimodal Output Phase 1](architecture/multimodal-output-phase-1.md) for the
Tool-local schema, ownership, download contract and AG-UI 1.0 migration boundary.

`agent-plan` and `agent-status` are application-defined frontend tool contracts.
AG-UI does not define `AgentPlan` or `AgentStatus` events, so these scenarios do
not invent `PLAN_*` or `AGENT_STATUS` protocol events. Their flow is:

```text
TOOL_CALL_START
→ TOOL_CALL_ARGS (application-defined Tool Args)
→ application projector → AgentPlan / AgentStatus
→ TOOL_CALL_END
→ TOOL_CALL_RESULT (acknowledgement)
```

The presentation does not depend on `TOOL_CALL_RESULT`.

`AgentPlan` reads `steps` and `activeIndex` from Tool Args.

`AgentStatus` reads `label` and `elapsed` from Tool Args and derives its state
from the frontend `ConversationToolCallProps.status` (`running` → `working`,
`requires-action` → `waiting`, `complete` → `done`). It may therefore render
while the Tool Call is still running.

`TOOL_CALL_RESULT` only represents the terminal acknowledgement of the
application-defined tool. `application projector → AgentPlan / AgentStatus` is
a frontend presentation step, not an AG-UI wire event. The runner wire stream
remains `TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END → TOOL_CALL_RESULT`.

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

**2026-09-27 状态：尚未闭环验收。** 当前 pinned assistant-ui
`da9a624496ae97864ae30e90f85c7533092a228d` 的官方 TaskCard transcript
没有向 `MessagePrimitive.Parts` 传入 Reasoning renderer，也没有挂载
canonical `MessagePrimitive.Error`。Runtime 已有 reasoning 数据与
`incomplete/error` 状态，但对应 UI 断言失败。该 Element 当前也没有 transcript
override；仓库 upstream guard 禁止本地 Element presentation patch。
在这些展示缺口解决并通过增量测试与浏览器检查前，不应宣称完整 Streaming
验收通过。

本次提交交付测试与验收记录，不修改 production renderer。前端 focused suite
共 16 项：11 项通过、5 项失败。新增的普通、递归、错误测试各有展示断言失败；
原有最终态 reasoning／error 展示测试也仍失败。`expect.soft` 用于让同一测试
继续检查后续生命周期，失败仍会使测试及整个 suite 返回非零退出码；没有
skip、expected-failure 或 test-only renderer 替换。Mock 协议 suite 的 8 项通过。

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
