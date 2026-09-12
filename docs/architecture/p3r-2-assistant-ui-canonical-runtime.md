# P3R-2 assistant-ui Canonical Runtime

## Status and scope

P3R-2 formalizes the already pinned assistant-ui AG-UI integration as
`@agent-ui/runtime-assistant-ui`. The `assistantUiSpike=1` query remains the
only A/B switch and assistant-ui is not the default surface. P3R-2 does not
perform semantic Slot migration, capability completion, default cutover, or
legacy removal.

## One-wire architecture

```text
normal mode
  -> LegacyRuntimeBoundary
  -> one AgUiTransport
  -> AG-UI

assistantUiSpike=1
  -> AssistantUiRuntimeBoundary
  -> @agent-ui/runtime-assistant-ui
  -> one HttpAgent
  -> useAgUiRuntime
  -> AssistantRuntimeProvider
  -> formal AssistantUiConversationSurface
```

Only `useAgUiRuntime` drives `HttpAgent.runAgent()` in assistant-ui mode. The
compatibility, interrupt, application-event, and observation bridges observe
or invoke public assistant-ui Runtime actions; none starts a second wire run.
The legacy `AgUiTransport` is constructed only when `LegacyRuntimeBoundary` is
mounted.

## Package boundary

`packages/runtime-assistant-ui` may depend on the pinned `@ag-ui/client`,
`@assistant-ui/react`, `@assistant-ui/react-ag-ui`, React, and
`@agent-ui/runtime-core`. It does not depend on the generated project's
AppUIModel, Plugin Registry, Slot Registry, Creator, Workspace, or concrete UI
Plugins.

The package owns:

- the one `HttpAgent` and `useAgUiRuntime` composition;
- the `AssistantRuntimeProvider` installation;
- an `AgentRuntime` downstream compatibility projection;
- the thread identity, application event, interrupt, Frontend Tool, and
  observation seams.

## Active Runtime selection

`App.tsx` selects one component lifecycle boundary. Normal mode mounts
`LegacyRuntimeBoundary`, which creates and disposes the legacy transport and
Runtime. Assistant-ui A/B mode mounts `AssistantUiRuntimeBoundary`, which
creates an ephemeral binding and the canonical provider. Shared Plugin actions,
services, ModeShell, and UI composition are created below the active boundary
and receive only that boundary's `AgentRuntime`.

## AgentRuntime compatibility bridge

`AssistantUiAgentRuntimeBridge` projects public `ThreadRuntime` state into the
existing `AgentRuntimeSnapshot` contract. This is downstream compatibility,
not a second protocol parser or lifecycle owner.

- `sendMessage` accepts strings, `{ content: string }`, and text-only input
  parts. It calls `thread.append()` once and resolves only after observing a
  running-to-settled edge. A package-owned operation lock rejects overlap with
  `AGENT_UI_RUNTIME_BUSY`. Media inputs throw
  `AGENT_UI_UNSUPPORTED_INPUT` instead of losing data.
- `abort` calls `thread.cancelRun()`.
- `startNewConversation` calls `threads.switchToNewThread()` and rejects while
  a run is active.
- `resumeInterrupts` validates a complete, unique response set before mapping
  it to the package's public unstable interrupt wrapper.

Messages and executions are projected from assistant-ui `ThreadMessage`
parts. Raw AG-UI events are never re-parsed for those projections. Run and
state projection use `thread.isRunning`, pending interrupts, and the Runtime's
already-merged state. No synthetic run id is created.

## Thread identity seam

`AssistantUiThreadBinding` is the AgentUICreator-owned identity input. The A/B
path uses `createEphemeralAssistantUiThreadBinding()`:

- the active id is stable for the page session;
- a new conversation creates a new UUID and atomically rebinds the one agent;
- reload starts a new session;
- persisted history selection/continuation is not claimed.

The compatibility snapshot's `conversation.id`, the thread-list adapter, and
the `HttpAgent.threadId` all derive from the binding.

## Application events

`AssistantUiApplicationEventSource` installs one passive subscriber on the
same `HttpAgent`. It maps only AG-UI `CUSTOM` events to cloned
`AgentApplicationEvent` values, preserving root/subagent producer identity.
All message, reasoning, tool, state, and run events remain exclusively owned by
`useAgUiRuntime`.

## Interrupt wrapper

The pinned public exports `unstable_getPendingInterrupts` and
`unstable_submitInterruptResponses` are isolated inside the formal package.
Plugins continue to see only `AgentInterrupt` and `AgentInterruptResponse`.
The pinned interrupt shape does not expose subagent producer identity, so the
compatibility projection records root producer until upstream provides a
public field.

The pinned assistant-ui `AgUiResumeEntry` does not expose response metadata.
AgentUICreator's `AgentInterruptResponse` contract still supports metadata for
protocol and Runtime implementations that can represent it. The assistant-ui
compatibility bridge therefore rejects responses containing metadata with
`AGENT_UI_UNSUPPORTED_INTERRUPT_RESPONSE_METADATA` rather than silently
dropping the field. Full metadata parity is deferred until the public upstream
assistant-ui API can represent it.

## Frontend Tool seam

`AssistantUiFrontendToolPort` accepts the existing protocol-independent
`AgentFrontendToolSource` and records the pinned public integration point,
`AssistantRuntime.registerModelContextProvider`. Dynamic toolkit registration,
execution, cancellation, and continuation parity remain deferred to P3R-4.
No legacy transport is retained in assistant-ui mode to emulate Frontend Tools.

## Observation contract

`ConversationObservationSnapshot` is AgentUICreator-owned and contains:

- `schemaVersion`;
- `threadId`;
- `isRunning`;
- tool calls with `toolCallId`, `toolName`, `state`, `args`, optional `result`,
  `error`, and public `messageId`.

The Spike debug overlay consumes `useAssistantUiRuntimeObservation()` rather
than `useAuiState()` or assistant-ui internal store types.

## Runtime duplication matrix

| Mode | Message/run owner | Wire owner | Legacy transport | Compatibility projection |
| --- | --- | --- | --- | --- |
| Normal | AgentUICreator legacy Runtime | `AgUiTransport` | Present | Native |
| assistant-ui A/B | assistant-ui Runtime | one `HttpAgent` | Absent | `AgentRuntimeSnapshot`, `AgentMessage`, `AgentExecution` |

The projections in the final column are read-only downstream views and do not
duplicate network or protocol ownership.

## Deferred capabilities

P3R-3/P3R-4 retain ownership of persisted history continuation, full Frontend
Tool and tool-error continuation parity, attachments, sources, subagent
projection, complete app-state parity, theme bridge follow-up, semantic child
Slots, and final capability-matrix proof. Default cutover and legacy deletion
remain P3R-5/P3R-6 work.
