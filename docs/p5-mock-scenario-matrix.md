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
| Advanced | `nested-subagent-recursive` | Recursive Subagent | Frontend Presentation | Advanced |
| Advanced | `nested-subagent-error` | Nested Subagent Error | Frontend Presentation | Edge case |

The default scenario is `reasoning-tool-success`.

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
fixtures live in `examples/agent-frontend/dev-mock/conversations` and are
enabled independently with `VITE_CONVERSATION_DATA_MODE=mock`. They do not
restore removed `ConversationReplay` data contracts or tool names. Standard
live subagents use `SUBAGENT_STARTED`, child events attributed by
`subagentRunId`, and `SUBAGENT_FINISHED` / `SUBAGENT_ERROR`, rendered through
the canonical nested assistant-ui path.

## Development Endpoint

From `examples/agent-frontend`, start the existing Vite app:

```bash
pnpm --filter @agent-ui/example-agent-frontend dev
```

Select a showcase with `?mockScenario=<scenario-id>`. The default remains
`reasoning-tool-success`. `mockSpeed` controls development timing and can be
used to accelerate long-running showcase steps.

Mock scenarios do not change AppUIModel, Workspace Shell composition, runtime
ownership, or the LangGraph StateSnapshot history contract.
