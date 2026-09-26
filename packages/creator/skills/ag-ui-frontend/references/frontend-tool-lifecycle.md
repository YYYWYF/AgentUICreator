# Frontend Tool lifecycle contract

Read this reference when creating or modifying Agent-controlled frontend
capabilities, Tool renderers, or their Service integration. These rules apply to
the generated application's chosen UI stack; no particular UI library is required.

## Capability ownership and permission

A Plugin provides an activation-scoped Service. The application explicitly permits
selected operations in `agent-contract/agent-tools.ts`. A Service method is not
an Agent Tool until the application authorizes it. Reuse existing Service seams;
follow the host's Service ownership/authorization flow for new or changed public
contracts. Plugins cannot self-register tools or own another Agent Runtime.

```text
Plugin -> Service capability
Application agent-tools -> allowed operation + schema + handler
Runtime adapter -> assistant-ui native frontend execute
```

Schemas use the project's Zod strict-object contract. Handlers resolve Services
at execution time, recheck availability, honor AbortSignal, and return short
serializable receipts. Service removal must hide tools from subsequent model
requests and produce a clean failure if removal precedes execution.

## Native pipeline and presentation

Use standard AG-UI tools, TOOL_CALL frames, ToolMessage results and continuation.
Do not implement a second executor, fork upstream Runtime, invent a CUSTOM tool
protocol, or send a synthetic UserMessage to report a result. assistant-ui owns
invocation identity, single-fire execution, status, result injection, cancellation
and continuation. Keep upstream types inside the integration adapter.

Backend Tool UI is render-only. Application frontend UI registration does not
supply execute or grant permissions. Available definitions become frontend Toolkit
entries. When permission is absent, named historical renderers use backend Toolkit
entries with render and optional display only; no description, schema or execute.
Upstream filters those entries from model tools. Use Tools({ toolkit }) for both
live and historical UI registration, avoiding deprecated Tool UI registration APIs.
Omit display unless the application explicitly chooses inline or standalone.

## Execute versus render and history

Product actions belong only in execute: opening dialogs, navigation, selection,
editor changes, application mutations, storage/clipboard writes, downloads, form
submission or host actions. Tool renderers project args/result/status only.

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

## Framework integrations

When assistant-ui offers a specialized integration (for example
`@assistant-ui/react-hook-form`), first inspect its canonical product/tool semantics
at the project's pinned upstream revision. Reuse `set_form_field`, `submit_form`
and `reset_form` semantics and React Hook Form, while preserving application-owned
permission and activation-scoped Service capability boundaries. Do not ignore the
integration and invent another vocabulary; do not register tools directly through
an upstream hook when that bypasses application permission. The optional Form Demo
is the reference adaptation; see `docs/architecture/frontend-tool-form-demo.md`.
