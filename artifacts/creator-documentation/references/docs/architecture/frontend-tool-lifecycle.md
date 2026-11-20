# Frontend Tool lifecycle

The application owns Agent exposure permission in `agent-contract/agent-tools.ts`.
A Plugin owns and provides an activation-scoped Service capability. Providing a
Service never registers an Agent Tool. The dialog demo's capability owner is
`frontend-tool-dialog-demo`; its consumer is the application-owned
`open_demo_dialog` tool through the project Service seam `services/demo-dialog.ts`.

```text
Plugin activation -> Service capability
                            ^
Application allowlist -> AppFrontendToolRuntime
                            |
                            v
runtime adapter -> assistant-ui Tools({ toolkit })
                            |
                            v
RunAgentInput.tools -> Agent decision -> TOOL_CALL_START / ARGS / END
                            |
                            v
native execute -> capability side effect -> result -> ToolMessage
                            |
                            v
standard continuation run -> assistant response
```

## Owners and integration

`AgentFrontendToolSource` remains protocol independent. Its schema, allowlist,
validation, Service availability and error conversion are application concerns.
The small adapter in `packages/runtime/src/tools` converts definitions
into native frontend Toolkit entries. `ConversationToolkit` is the single public
registration surface for human components, explicit frontend execute callbacks,
and backend renderers. Host/application frontend entries explicitly grant
execution permission; Plugin capability contributions still do not self-authorize
browser tools. A same-name backend entry may supply render/display for a permitted
source, but never supplies its schema or execution permission. Human/frontend
entries colliding with an existing source fail rather than replacing its executor.
Disabled frontend entries become backend render-only entries. No separate frontend
UI registry is exposed. A missing specialized UI uses the locale-aware generic
`ConversationToolResult` from the React facade.

assistant-ui owns detection, invocation identity, single-fire execution, status,
result injection, cancellation and continuation. We do not implement a second
TOOL_CALL executor, fork upstream runtime, or synthesize CUSTOM tool calls.
The native pipeline runs deferred browser tools after a successful run settles,
so a later backend result or interrupt can prevent execution.

## Execute versus render

For automatically executed frontend tools, product actions occur inside execute:
opening dialogs, navigation, selecting items, editor changes, storage writes,
clipboard, downloads, mutations and host commands. Tool UI renders args/result/status.
Human tools instead collect user input in a TSX component and submit with addResult;
they need no execute callback. Neither kind may mutate services or invoke Agent
actions on mount. Legitimate UI effects include measurement, ResizeObserver,
subscriptions, focus, animation and cleanup; there is no blanket useEffect ban.

Results must describe what happened independently of current application state.
`{ opened: true, title: "Settings" }` displays a historical receipt even after the
user closes the dialog. Tool UI mount never means execute.

## History and React lifecycle

Resolved stored calls and results are loaded into the existing assistant-ui thread
history adapter. History loading, thread/branch switching, remounts, StrictMode and
renderer remounts must not invoke execute. If restoration executes a tool,
repair the runtime boundary rather than adding an isHistory renderer workaround.
Backend entries in toolkit remain available for history even when their Service is
absent. They become backend render-only Toolkit entries, with no description,
parameters or execute, and are filtered from the model tools. Both live and historical renderers use Tools({ toolkit }). Display is forwarded only when the application explicitly chooses it,
preserving the upstream default otherwise.

## Availability and cancellation

AppFrontendToolRuntime observes PluginServiceRuntime subscriptions. Connection,
activation, removal and disconnection recompute available names. Its revision only
changes when the advertised set changes. The provider subscribes with
useSyncExternalStore and rebuilds native toolkit configuration. Every execute
rechecks Service availability and validates args with Zod. The adapter preserves
toolCallId and AbortSignal; pre-aborted calls have no side effect. Host toolkit
callbacks use the native toolCallId/abortSignal/human context and are cancelled on
run cancellation, toolkit replacement or provider unmount. Async capability
handlers must honor their signal; cancellation cannot undo a completed action.
Errors propagate through native tool error handling. Standard ToolMessage results
are sent on the continuation run, with no invented user message or resume protocol.

## Supported producer scope

This integration exposes root-thread Frontend Tools only. Native execution context
contains toolCallId/abortSignal/human but no subagent producer attribution.
The root adapter therefore supplies `{ type: "root" }` for root calls only.
Subagent Tool parts are upstream presentation, not an execution attribution seam.
Do not promote subagent calls into root calls or claim subagent execution support.
New human protocols, approval policies, result streaming and subagent attribution
are outside this change.

## Dialog demo and regression coverage

The current AppUIModel mounts the dialog Provider Plugin alongside the conversation
surface. Its controlled Base UI Dialog reads the Service snapshot. Only
`open_demo_dialog.execute` opens it. The model-visible tool is hidden when this
Plugin is disabled or its Service is absent. DevStudio's
`Frontend Tool：Open Dialog` scenario emits standard Tool frames without a backend
result, then recognizes the current turn's ToolMessage and streams a confirmation.
Each fresh user turn creates a new call id; prior results cannot satisfy a new turn.
The generic runner uses ToolMessage.error for failure and treats content as an
opaque receipt rather than inspecting dialog-specific fields. The fixed demo is
manual-only and does not declare Add/Restore authoring metadata.

Creator skills read their bundled `ag-ui-frontend/references/frontend-tool-lifecycle.md`,
which ships under the package's existing skills publication scope; this repository
document remains the architecture reference for maintainers.

Regression cases cover availability revisions, schema/error/signal adaptation,
native live execution once, result/continuation, later streaming frames, thread
revisit after closing, cold resolved history and StrictMode remount. Tests are
implementation artifacts; delivery does not imply those checks have been run.
