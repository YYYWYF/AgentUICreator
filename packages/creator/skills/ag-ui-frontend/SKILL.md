---
name: ag-ui-frontend
description: Use for frontend consumption of AG-UI messages, shared state, run status, executions, interrupts, and controlled Application Events, Frontend Tools, Agent-controlled frontend capabilities, and browser/client tool execution through project Runtime hooks.
compatibility: One AG-UI Agent connection per Thread; multiple isolated frontend instances reuse canonical Conversation Runtime. Phase 8 permits Plugin source writes while Runtime remains read-only.
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
- `usePluginEvents()` is the inbound, live-only Application Event channel. Subscribe only to names declared in the Plugin manifest and registered through the application's `Agent.appEventSchemas`.
- `usePluginService()` remains the component API for named Plugin capabilities.
- Project frontend-tool modules and the Host's explicit `Agent.frontendTools` source own the operations advertised to the Agent; providing a Plugin Service alone never exposes a tool.

## Boundaries

- Multiple assistants belong in the application layer: use the installed Runtime's `AgentUIProvider` and `AgentUIApplication`, with stable `agentId`, endpoint and per-Agent services. Business components control visibility through `hidden`; keep inactive instances mounted for background runs. Each assistant sends only its own input in its current Thread; only explicit new-conversation actions create a new threadId. Workflow buttons may set `ConversationComposerSend.endpoint` for one send without changing assistant identity. Native continuations and retries retain the original URL. History navigation reopens an explicitly scoped `{ agentId, threadId }`. Use the installed public declarations; do not create a second message store or copy Runtime/Context into Plugins.
- In a shared model, layout edits affect every assistant using it. Inspect application configuration and clarify the affected owner when the requested instance is ambiguous. Creator preview overrides require the specific instance ID and must not retarget other assistants.

- Do not instantiate an AG-UI client or manage a second Agent Runtime inside a Plugin.
- Do not invent a separate public message or state protocol when the Plugin Contract already exposes AG-UI data.
- Event, snapshot, delta, streaming, tool-call, and error normalization belongs in the frontend Runtime layer; Plugins render the normalized hook values.
- Never expose or import AG-UI `CUSTOM`, `CustomEvent`, `BaseEvent`, `RawEvent`, `rawEvent`, or `@ag-ui/core` from Plugin code. Preserve an explicitly supplied backend business event name and payload; never guess an unknown payload shape. Distinguish its consumers: a chat message renderer uses `defineDataMessageUI`, `definition.dataMessageUIs` and `manifest.data.messageUI`, and validates its raw `data`; a live Application Event subscriber uses `Agent.appEventSchemas`, `manifest.data.events` and `usePluginEvents`. Do not add a duplicate subscriber merely to render a chat message. Application schema transforms do not rewrite message data.
- For Application Event subscriptions, reuse an existing schema module; otherwise create an application-owned module relative to actual sourceRoot (for example `agent-contract/agent-events.ts`) and wire it through `Agent.appEventSchemas`. That directory is optional, not a preinstalled Runtime requirement. A Plugin-local schema wired through the application is also valid.
- Frontend Tools use standard AG-UI `RunAgentInput.tools`, `TOOL_CALL_*`, `ToolMessage`, and a continuation Run. Never encode a frontend Tool call as `CUSTOM`, a new UserMessage, or a Plugin-specific protocol.
- For existing Host page operations, use `createAgentUIFrontendTools()` from Runtime and pass the stable source to `<Agent frontendTools={tools} />`. Validate input inside execute and call the existing page/form methods. This path does not require a Provider Plugin, Service registration or generated tool module.
- When a capability is shared by Plugins, reuse or define a stable Service seam, let a Provider Plugin declare and provide it, and expose only the application-authorized operations through project frontend tools.
- Tool names use `lower_snake_case`. Host tools declare JSON Schema and validate unknown input inside execute. Project tools may use `z.strictObject(...)` as the validation/JSON Schema source and resolve Services at execution time. Return short serializable results.
- Do not infer that every Service method should be exposed. Capability ownership and Agent exposure permission are separate decisions.
- Plugins must never self-register Frontend Tools or import AG-UI Tool types. They only provide capabilities through the existing Service lifecycle.
- Do not invent Application Events to replace standard Activity/Tool/Run lifecycle, persistent shared state, local Plugin communication, or frontend commands. An explicitly supplied business-job CUSTOM notification can drive a live panel through the application channel; it does not become standard Runtime execution progress or gain history/replay. A single Plugin's private projection may use component state and update by the supplied business ID. Subscribe in `useEffect` and return the unsubscribe function. Use existing shared state/services when persistence or cross-Plugin sharing is actually required.
- A request for different layout or placement is not an AG-UI Runtime change.
- During Phase 8, implement AG-UI presentation inside `/plugins/` while keeping Runtime and Framework source read-only.

For interaction semantics, reason from product needs and AG-UI first. Treat external Agent UI projects as references, not runtime dependencies or public contracts.

## History, attachments, speech and feedback services

These capabilities have built-in defaults and project-owned service wiring.
Business connection options use Agent props or project-owned implementations;
keep server credentials out of browser code. Before connecting a business
history, upload, transcription or feedback service, read
[service configuration](references/service-configuration.md).
Users supply missing endpoint/authentication/payload details. Creator edits
project wiring and services/ HTTP integration with ordinary read/edit/create
tools. Optional Service preflight tools check topology, public declarations and
current references without separate user confirmation. Explain the affected
operations and shared callers, preserve explicit custom adapters and Plugin
layout, and report applied changes and verification accurately.

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
6. Keep `Plugin -> Service` for Plugin-shared capabilities; existing Host page
   methods can be exposed directly through `Agent.frontendTools`. Both use
   `Application -> allowed operation` and `Runtime adapter -> Agent UI native frontend execute`. Plugins never
   register Tools. Preserve root-only execution scope until subagent attribution
   has its own contract. Do not add another TOOL_CALL executor or CUSTOM protocol.

## Official integrations

When Agent UI provides a specialized integration:

1. Inspect the official integration at the project's pinned upstream revision first.
2. Reuse its public semantic contracts where possible.
3. Do not bypass AgentUICreator application permission.
4. Model reusable adaptation as an Integration, not as a Demo Plugin.

Business forms use the existing Host frontend-tool API with the project's installed form library. Reuse its field setters, validation and business submit method. There is no form-specific factory or automatically exposed form operation. See the packaged public Frontend Tools guide for the AntD Form example.

Integration installation != automatic Agent permission. Operations are exposed
only by application frontend-tool modules or an explicitly supplied Host source.
Integrations can be pluginless and tool-less. Demo consumers own UI, field names,
Service lifecycle and replayable receipts; the Integration owns reusable contracts.

## Agent UI Generative UI

`@za38.03/agent-ui-plugins/generative-ui` is the canonical component vocabulary and
renderer. Prefer official vocabulary before creating custom components. Inspect
the project's installed version: do not infer capabilities from unreleased
source or from the presence of related CSS selectors.

- Install optional `integration/generative-ui` for the shared factory, official
  styled vocabulary, Action Registry and public component export. These files
  are managed together as one optional Integration, not a default Foundation.
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
UI. Reuse existing official domain copy through `useAgentUILocale(namespace)`;
`Agent.locales` overrides only existing keys, not arbitrary new namespaces. For
new business copy, reuse or create a project-owned shared messages module with
domain namespaces and complete `en-US` / `zh-CN` parity. Select messages there
with the unified `useAgentUILocaleCode()` value and pass messages to presentation
helpers; do not create per-Plugin i18n hooks, language branches or another locale
state. See the packaged Plugin API's localization example. Preserve protocol IDs, enums, schema and persisted fields;
locale is a view concern. Prefer public props/composition, then owned adapters.
If upstream lacks a seam, record a localization gap instead of modifying vendor.
Include `pnpm check:i18n` where available and check new copy during upgrades.
