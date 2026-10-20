---
name: ag-ui-frontend
description: Use for frontend consumption of AG-UI messages, shared state, run status, executions, interrupts, and controlled Application Events, Frontend Tools, Agent-controlled frontend capabilities, and browser/client tool execution through project Runtime hooks.
compatibility: One AG-UI Agent Runtime per generated frontend; Phase 8 permits Plugin source writes while Runtime remains read-only.
allowed-tools: enable_creator_tools read_file ls glob grep edit_file
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
   `Runtime adapter -> Agent UI native frontend execute`. Plugins never
   register Tools. Preserve root-only execution scope until subagent attribution
   has its own contract. Do not add another TOOL_CALL executor or CUSTOM protocol.

## Official integrations

When Agent UI provides a specialized integration:

1. Inspect the official integration at the project's pinned upstream revision first.
2. Reuse its public semantic contracts where possible.
3. Do not bypass AgentUICreator application permission.
4. Model reusable adaptation as an Integration, not as a Demo Plugin.

React Hook Form: reuse `@za38.03/agent-ui-plugins/form-tools.formTools` through
`integration/react-hook-form`. Use ordinary RHF `useForm()` plus an application
Service and `createReactHookFormFrontendTools({ serviceName, fields, expose })`.
`expose` is mandatory and has no default. Do not call `useAssistantForm()` or
`aui.modelContext.register(...)`; combining those with the factory creates duplicate
registration and bypasses application permission.

Integration installation != automatic Agent permission. Only application
frontend-tool modules included in the generated allowlist expose operations.
Integrations can be pluginless and tool-less. Demo consumers own UI, field names,
Service lifecycle and replayable receipts; the Integration owns reusable contracts.

## Agent UI Generative UI

`@za38.03/agent-ui-plugins/generative-ui` is the canonical component vocabulary and
renderer. Prefer official vocabulary before creating custom components. Inspect
the project's installed version: do not infer capabilities from unreleased
source or from the presence of related CSS selectors.

- Install optional `integration/generative-ui` for the shared factory, official
  styled vocabulary and Action Registry. It requires the Registry-managed
  `agent-component/generative-ui`; neither is a default Foundation.
- `createAgentUIGenerativeUI` exposes `present()` and `promptUser()` capabilities.
  Capability availability does not grant Agent permission. Do not automatically
  mount or advertise `present` / `prompt_user`; explicit Tool authorization requires a separate product decision.
- Use the pinned package types and official Form `$input` collection; do not infer availability from CSS selectors.
- Keep optional source provenance and official styles under Source Registry;
  regenerate from the pinned package-owned upstream source. CSS permits only
  mechanical `.agent-ui-conversation` selector scoping, with no visual redesign.

## Localization ownership

Vendor-owned code must remain locale-agnostic and unmodified; all product
localization is owned by AgentUICreator composition, adapters, plugins, and Host
UI. New user-visible copy must use the existing `useAgentUILocale` namespace and
complete `en-US` / `zh-CN` dictionaries. Do not create per-Plugin i18n hooks or
language conditionals. Preserve protocol IDs, enums, schema and persisted fields;
locale is a view concern. Prefer public props/composition, then owned adapters.
If upstream lacks a seam, record a localization gap instead of modifying vendor.
Include `pnpm check:i18n` where available and check new copy during upgrades.
