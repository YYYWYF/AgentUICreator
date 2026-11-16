# Frontend Tool lifecycle contract

Read this reference when creating or modifying Agent-controlled frontend
capabilities, Tool renderers, or their Service integration. These rules apply to
the generated application's chosen UI stack; no particular UI library is required.

## Capability ownership and permission

A Plugin provides an activation-scoped Service. The application explicitly permits
selected operations through project frontend-tool modules or the Host's
`Agent.frontendTools` source or explicit `toolkit` frontend entries. A Service method is not an Agent Tool until the
application authorizes it. Existing Host page methods do not require a new Plugin
or Service. For Plugin-shared capabilities, reuse existing Service seams and
preserve Service ownership and public contracts. Plugins cannot self-register
tools or own another Agent Runtime.

```text
Plugin -> Service capability
Application agent-tools -> allowed operation + schema + handler
Runtime adapter -> Agent UI native frontend execute
```

Schemas use the project's Zod strict-object contract. Handlers resolve Services
at execution time, recheck availability, honor AbortSignal, and return short
serializable receipts. Service removal must hide tools from subsequent model
requests and produce a clean failure if removal precedes execution.

## Native pipeline and presentation

Use standard AG-UI tools, TOOL_CALL frames, ToolMessage results and continuation.
Do not implement a second executor, fork upstream Runtime, invent a CUSTOM tool
protocol, or send a synthetic UserMessage to report a result. Agent UI owns
invocation identity, single-fire execution, status, result injection, cancellation
and continuation. Keep upstream types inside the integration adapter.

Use one `toolkit` for human components, frontend execute callbacks and backend
renderers. Explicit application/Host frontend entries grant execution permission.
Backend entries are presentation only and may supply render/display for a same-name
application-owned source. Available source definitions become frontend Toolkit
entries; competing human/frontend executors must fail on name collisions. When permission is absent, named historical renderers use backend Toolkit
entries with render and optional display only; no description, schema or execute.
Upstream filters those entries from model tools. Use Tools({ toolkit }) for both
live and historical UI registration, avoiding deprecated Tool UI registration APIs.
Omit display unless the application explicitly chooses inline or standalone.

## Execute versus render and history

For automatically executed frontend tools, product actions belong in execute: opening dialogs, navigation, selection,
editor changes, application mutations, storage/clipboard writes, downloads, form
submission or host actions. Tool renderers project args/result/status. Human tools collect user input through
a TSX component and submit addResult without execute; submission must be gated by
requires-action, the runtime answer capability and addResult availability.

Assume history loading, thread/branch switching, remounts, StrictMode and
virtualization can mount renderers again. Mount never means invoke. Do not call
capabilities in a renderer mount effect. UI measurement, focus, ResizeObserver,
subscriptions, animations and cleanup are legitimate component lifecycle effects;
there is no blanket ban on useEffect.

Results describe what happened independently of current application state.
For example, `{ opened: true, title: "Settings" }` records an opened dialog even
if the user closed it later. History displays this receipt without reopening it.
Resolved history must never execute tools. Repair an execution-on-history Runtime
bug at the integration boundary; do not hide it with renderer isHistory checks.

## Producer scope and regressions

The current native execute context supplies toolCallId/abortSignal/human without
subagent attribution. Keep this integration root-only; do not relabel subagent
calls as root or claim support for their capability execution. Approval policy,
Human protocols and result streaming need separate product contracts.

When validation is authorized, cover capability unavailable at the first render,
Provider mount making it available, removal hiding it again, execution rechecks,
identity/signal forwarding, live single-fire execution, standard result and
continuation, subsequent streaming frames, resolved cold history, thread revisits,
and StrictMode. A ToolMessage's standard error field marks failure; the runner
must not infer success from a tool-specific receipt field such as opened.

## Business page and form integration

A Host page can use `<Agent toolkit={toolkit} />` with type frontend,
parameters, execute and optional render. The native execution context supplies
abortSignal, toolCallId and human. Keep toolkit/callback identity stable; cancellation,
replacement and unmount cancel pending callbacks. Disabled frontend entries retain
only historical rendering. Existing source-based applications can continue using
`createAgentUIFrontendTools()` and `<Agent frontendTools={tools} />`; their renderers
now also belong in toolkit, as backend entries without execution permission.
The application owns field names, argument validation, form-library calls and
business submission. No form-specific Integration, Provider Plugin or Service
registration is required for this Host path. Plugin-shared capabilities retain
the activation-scoped Service path described above. Both sources use the same
canonical execution, result and continuation pipeline.

Reuse the project's installed form library. Validate unknown input before field
mutation; honor cancellation; return what actually happened. Only expose the
operations requested by the application. Filling does not imply submission.
History and renderer mounts never execute form operations.
