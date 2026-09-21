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

## Showcase Catalog

| Section | Scenario ID | Display purpose | Reference level |
|---|---|---|---|
| Basics | `simple-chat` | Minimal text streaming | |
| Basics | `reasoning-chat` | Reasoning → Answer | |
| Basics | `reasoning-tool-success` | Reasoning → Tool → Reasoning → Answer | Recommended |
| Tools | `parallel-tools` | Parallel Tool Calls | |
| Tools | `tool-error` | Tool Call followed by standard `RUN_ERROR` | |
| Human in the Loop | `approval-resume` | Interrupt → Allow/Deny → Resume | |
| State | `agent-state-sync` | `STATE_SNAPSHOT / STATE_DELTA` → JobProgress | Recommended |
| Multi-Agent | `nested-subagent-conversation` | Standard `SUBAGENT_*` → TaskCard | Recommended |
| Multi-Agent | `nested-subagent-task-group` | Sibling Subagents → TaskGroup | Advanced |
| Presentation | `agent-plan` | Application-defined Tool Result → AgentPlan | |
| Presentation | `agent-status` | Application-defined Tool Result → AgentStatus | |
| Advanced | `nested-subagent-recursive` | Recursive Subagent | Advanced |
| Advanced | `nested-subagent-error` | Nested Subagent Error | Edge case |

The default scenario is `reasoning-tool-success`.

`agent-plan` and `agent-status` are application-defined tool contracts. AG-UI
does not define `AgentPlan` or `AgentStatus` events, so these scenarios do not
invent `PLAN_*` or `AGENT_STATUS` protocol events. Their flow is:

```text
TOOL_CALL_START
→ TOOL_CALL_ARGS
→ TOOL_CALL_END
→ TOOL_CALL_RESULT
→ application projector
→ AgentPlan / AgentStatus
```

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

`STEP_*`:

```text
The Mock runner can emit STEP_STARTED / STEP_FINISHED.
The current assistant-ui react-ag-ui integration does not project them.
Therefore STEP lifecycle remains a runner primitive and is not a user-facing scenario.
```

## Legacy Replay Compatibility

The removed `step-lifecycle`, `subagents`, `subagents-out-of-order`, and
`agent-elements-showcase` fixtures are no longer production builtins. The
legacy `mock_dispatch_subagent` toolkit registration, replay renderer, and
`subagent-projection` remain because persisted Conversation Replay fixtures
still contain that tool name.

```text
mock_dispatch_subagent = legacy persisted replay compatibility only
```

It is not a live AG-UI Subagent reference. New live scenarios use
`SUBAGENT_STARTED`, child events attributed by `subagentRunId`, and
`SUBAGENT_FINISHED` / `SUBAGENT_ERROR`, rendered through the canonical nested
assistant-ui path.

## Development Endpoint

From `examples/agent-frontend`, start the existing Vite app:

```bash
pnpm --filter @agent-ui/example-agent-frontend dev
```

Select a showcase with `?mockScenario=<scenario-id>`. The default remains
`reasoning-tool-success`. `mockSpeed` controls development timing and can be
used to accelerate long-running showcase steps.

Mock scenarios do not change AppUIModel, Workspace Shell composition, runtime
ownership, or Conversation Replay data format.
