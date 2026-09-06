---
name: ag-ui-frontend
description: Use for frontend consumption of AG-UI messages, shared state, run status, executions, interrupts, and controlled Application Events through the project Runtime and UIPluginContext.
compatibility: One AG-UI Agent Runtime per generated frontend; Phase 8 permits Plugin source writes while Runtime remains read-only.
allowed-tools: read_file ls glob grep edit_file write_file execute
---

# AG-UI Frontend

Maintain this data flow:

```text
Agent Runtime -> AG-UI -> Frontend State -> UI Plugin -> project UI stack
```

## Current project contract

- `context.messages` contains AG-UI `Message` values, including user, assistant, and tool-related messages represented by the installed AG-UI version.
- `context.state` is shared Agent state and must be narrowed safely before property access.
- `context.run.status` is `idle`, `running`, or `error`; `errorMessage` carries the user-visible failure detail.
- `context.actions` is the only Plugin path for sending a message, aborting a run, or updating instance props.
- `context.events` is the inbound, live-only Application Event channel. A Plugin may subscribe only to names declared in its manifest and registered by `/project/agent-contract/agent-events.ts`.
- `/project/agent-contract/agent-tools.ts` owns the explicit set of frontend capability operations advertised to the Agent.

## Boundaries

- Do not instantiate an AG-UI client or manage a second Agent Runtime inside a Plugin.
- Do not invent a separate public message or state protocol when the Plugin Contract already exposes AG-UI data.
- Event, snapshot, delta, streaming, tool-call, and error normalization belongs in the frontend Runtime layer; Plugins render the normalized context.
- Never expose or import AG-UI `CUSTOM`, `CustomEvent`, `BaseEvent`, `RawEvent`, `rawEvent`, or `@ag-ui/core` from Plugin code. For a backend-originated, application-specific, transient occurrence with no standard AG-UI semantic, define its payload schema in `/project/agent-contract/agent-events.ts` before declaring it in `manifest.data.events`.
- Frontend Tools use standard AG-UI `RunAgentInput.tools`, `TOOL_CALL_*`, `ToolMessage`, and a continuation Run. Never encode a frontend Tool call as `CUSTOM`, a new UserMessage, or a Plugin-specific protocol.
- The Agent calls a capability adapter, never React or a Plugin. Reuse or define a stable Service seam, let a Provider Plugin declare and provide that Service, then expose only the product-authorized operations in `/project/agent-contract/agent-tools.ts`.
- Tool names use `lower_snake_case`; schemas use `z.strictObject(...)` as the single validation and JSON Schema source; handlers resolve Services at execution time and return short serializable results.
- Do not infer that every Service method should be exposed. Capability ownership and Agent exposure permission are separate decisions.
- Plugins must never self-register Frontend Tools or import AG-UI Tool types. They only provide capabilities through the existing Service lifecycle.
- Do not use Application Events for persistent state, activity progress, standard lifecycle, local Plugin-to-Plugin communication, or frontend-to-backend commands. Application Events have no replay, persistence, or history.
- A request for different layout or placement is not an AG-UI Runtime change.
- During Phase 8, implement AG-UI presentation inside `/project/plugins/` while keeping Runtime and Framework source read-only.

For interaction semantics, reason from product needs and AG-UI first. Treat external Agent UI projects as references, not runtime dependencies or public contracts.
