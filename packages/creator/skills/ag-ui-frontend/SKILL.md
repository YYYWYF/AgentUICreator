---
name: ag-ui-frontend
description: Use for frontend consumption of AG-UI messages, shared state, run status, executions, interrupts, and controlled Application Events, Frontend Tools, Agent-controlled frontend capabilities, and browser/client tool execution through project Runtime hooks.
compatibility: One AG-UI Agent Runtime per generated frontend; Phase 8 permits Plugin source writes while Runtime remains read-only.
allowed-tools: read_file ls glob grep edit_file write_file execute
---

# AG-UI Frontend

Maintain this data flow:

```text
AG-UI / Mock transport -> Agent Runtime -> Runtime Context Hooks -> UI Plugin -> project UI stack
```

## Current project contract

- `useAgentMessages()` returns normalized Agent messages, including user, assistant, reasoning, activity, and tool-related messages represented by Runtime Core.
- `useAgentState<TState>()` returns shared Agent state and must be narrowed safely before property access.
- `useAgentRun().status` is `idle`, `running`, `awaiting-input`, or `error`; a run error carries the user-visible failure detail.
- `useAgentExecutions()` exposes each Tool, Reasoning, Step, and Subagent lifecycle directly. Never replace local execution status with a generic Run loading flag.
- `useAgentInterrupts()` returns only current pending interrupts.
- `usePluginActions()` exposes instance-scoped Agent commands; `useAgentRuntimeActions()` exposes only Agent Runtime commands. Runtime-only UI state belongs in a named service or runtime store, not in AppUIModel composition.
- `usePluginEvents()` is the inbound, live-only Application Event channel. A Plugin may subscribe only to names declared in its manifest and registered by `/agent-contract/agent-events.ts`.
- `usePluginService()` remains the component API for named Plugin capabilities.
- `/agent-contract/agent-tools.ts` owns the explicit set of frontend capability operations advertised to the Agent.

## Boundaries

- Do not instantiate an AG-UI client or manage a second Agent Runtime inside a Plugin.
- Do not invent a separate public message or state protocol when the Plugin Contract already exposes AG-UI data.
- Event, snapshot, delta, streaming, tool-call, and error normalization belongs in the frontend Runtime layer; Plugins render the normalized hook values.
- Never expose or import AG-UI `CUSTOM`, `CustomEvent`, `BaseEvent`, `RawEvent`, `rawEvent`, or `@ag-ui/core` from Plugin code. For a backend-originated, application-specific, transient occurrence with no standard AG-UI semantic, define its payload schema in `/agent-contract/agent-events.ts` before declaring it in `manifest.data.events`. Preserve explicitly supplied event names exactly; recommend lowercase dot-separated naming only when the application has not chosen a name, and never guess an unknown backend payload shape.
- Frontend Tools use standard AG-UI `RunAgentInput.tools`, `TOOL_CALL_*`, `ToolMessage`, and a continuation Run. Never encode a frontend Tool call as `CUSTOM`, a new UserMessage, or a Plugin-specific protocol.
- The Agent calls a capability adapter, never React or a Plugin. Reuse or define a stable Service seam, let a Provider Plugin declare and provide that Service, then expose only the product-authorized operations in `/agent-contract/agent-tools.ts`.
- Tool names use `lower_snake_case`; schemas use `z.strictObject(...)` as the single validation and JSON Schema source; handlers resolve Services at execution time and return short serializable results.
- Do not infer that every Service method should be exposed. Capability ownership and Agent exposure permission are separate decisions.
- Plugins must never self-register Frontend Tools or import AG-UI Tool types. They only provide capabilities through the existing Service lifecycle.
- Do not use Application Events for persistent state, activity progress, standard lifecycle, local Plugin-to-Plugin communication, or frontend-to-backend commands. Application Events have no replay, persistence, or history.
- A request for different layout or placement is not an AG-UI Runtime change.
- During Phase 8, implement AG-UI presentation inside `/plugins/` while keeping Runtime and Framework source read-only.

For interaction semantics, reason from product needs and AG-UI first. Treat external Agent UI projects as references, not runtime dependencies or public contracts.

## Frontend Tool execution and replay contract

For capability or renderer integration details, read the packaged
[Frontend Tool lifecycle reference](references/frontend-tool-lifecycle.md).

1. Product side effects belong only in Tool `execute`: open dialog, navigate,
   select item, change editor file, modify application state, write storage, copy
   clipboard, download, call mutation API, submit form, or trigger a host action.
2. A Tool renderer is a replayable projection. Assume history load, thread/branch
   switch, remount, React StrictMode and virtualization can mount it again.
   `render / mount useEffect != tool invocation`.
3. Never implement Agent behavior with
   `useEffect(() => capability.doSomething(), [])`. Instead use
   `execute -> capability.doSomething()` and `render -> args/result/status`.
   UI measurement, ResizeObserver, subscription cleanup, focus and animation
   effects remain legitimate.
4. Results must carry a historical receipt sufficient to render args/result/status
   without checking today's application state. An opened dialog result can contain
   `{ opened: true, title: "Settings" }`; history does not require it to stay open.
5. History restoration must never execute Frontend Tools. An execute on history
   load is a Runtime bug; do not patch it with renderer `isHistory` workarounds.
6. Keep `Plugin -> Service`, `Application agent-tools -> allowed operation`,
   `Runtime adapter -> assistant-ui native frontend execute`. Plugins never
   register Tools. Preserve root-only execution scope until subagent attribution
   has its own contract. Do not add another TOOL_CALL executor or CUSTOM protocol.

## Official integrations

When assistant-ui provides a specialized integration:

1. Inspect the official integration at the project's pinned upstream revision first.
2. Reuse its public semantic contracts where possible.
3. Do not bypass AgentUICreator application permission.
4. Model reusable adaptation as an Integration, not as a Demo Plugin.

React Hook Form: reuse `@assistant-ui/react-hook-form.formTools` through
`integration/react-hook-form`. Use ordinary RHF `useForm()` plus an application
Service and `createReactHookFormFrontendTools({ serviceName, fields, expose })`.
`expose` is mandatory and has no default. Do not call `useAssistantForm()` or
`aui.modelContext.register(...)`; combining those with the factory creates duplicate
registration and bypasses application permission.

Integration installation != automatic Agent permission. Only application
frontend-tool modules included in the generated allowlist expose operations.
Integrations can be pluginless and tool-less. Demo consumers own UI, field names,
Service lifecycle and replayable receipts; the Integration owns reusable contracts.

## A2UI

A2UI is not a CUSTOM event and is not a Frontend Tool. Backend surfaces use
standard `ACTIVITY_SNAPSHOT`, `activityType: "a2ui-surface"`, and
`content.a2ui_operations` (the Mock reference uses v0.9 operations).
`@assistant-ui/react-ag-ui.useAgUiRuntime` is the only surface converter;
`integration/a2ui` owns the official renderer and action bridge through project
facades. Install it as an optional, pluginless Integration; do not edit AppUIModel.

The integration registers only the backend/render-only `present` Toolkit entry.
Never advertise `present` in `RunAgentInput.tools` merely to render an A2UI
surface. Plugins must not parse A2UI, import `@assistant-ui/react-ag-ui`, directly
use `useAgUiSendA2uiAction`, register `present`, or translate CUSTOM into A2UI.
Use the public `useConversationA2uiAction` facade within the Conversation Runtime
provider; native actions use `forwardedProps.a2uiAction.userAction` in a new Run
without a new UserMessage, Tool result or resume entry. Do not implement another
action continuation coordinator.

Use only `defaultGenerativeUILibrary` in this stage. Custom catalogs require a
separate authorization contract. Renderer mounts must not send actions; replay
and in-memory revisit are projections. Persisted cold A2UI history requires a
separate backend ActivityMessage contract and is not implied by LangGraph history.


## assistant-ui Generative UI

`@assistant-ui/react-generative-ui` is the canonical component vocabulary and
renderer. Prefer official vocabulary before creating custom components. Inspect
the project's installed version: do not infer capabilities from unreleased
source or from the presence of related CSS selectors.

- Install optional `integration/generative-ui` for the shared factory, official
  styled vocabulary and Action Registry. It requires the Registry-managed
  `agent-component/assistant-ui-generative-ui`; neither is a default Foundation.
- A2UI is a protocol transport into the official Generative UI vocabulary:
  `ACTIVITY_SNAPSHOT → official A2UI converter → official renderer`.
  A2UI does not own the component library or styles. Do not implement its parser,
  reducer or Basic Catalog mappings in Plugin or application code.
- `createAgentUIGenerativeUI` exposes `present()` and `promptUser()` capabilities.
  Capability availability does not grant Agent permission. Do not automatically
  mount or advertise `present` / `prompt_user`. A2UI uses only a backend render
  projection; explicit Tool authorization requires a separate product decision.
- The fixed 0.0.21 release lacks Slider, CheckboxGroup, `$field` and
  Input.defaultValue. ChoicePicker does not implement multipleSelection.
  Use supported controls and official Form `$input` collection; never fabricate
  these missing APIs or describe Table/Chart as A2UI Basic Catalog components.
- Keep optional source provenance and official styles under Source Registry;
  regenerate from the pinned local assistant-ui source. CSS permits only
  mechanical `.agent-ui-conversation` selector scoping, with no visual redesign.
- assistant-ui supports restored A2UI activity history, but the current LangGraph
  checkpoint adapter does not define Activity persistence. Do not claim cold
  history support or add a frontend cache.
