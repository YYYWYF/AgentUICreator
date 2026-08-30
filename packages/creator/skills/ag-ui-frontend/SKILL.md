---
name: ag-ui-frontend
description: Use for frontend consumption of AG-UI messages, shared state, run status, errors, tool messages, and user or assistant messages through the project Runtime and UIPluginContext.
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

## Boundaries

- Do not instantiate an AG-UI client or manage a second Agent Runtime inside a Plugin.
- Do not invent a separate public message or state protocol when the Plugin Contract already exposes AG-UI data.
- Event, snapshot, delta, streaming, tool-call, and error normalization belongs in the frontend Runtime layer; Plugins render the normalized context.
- A request for different layout or placement is not an AG-UI Runtime change.
- During Phase 8, implement AG-UI presentation inside `/project/plugins/` while keeping Runtime and Framework source read-only.

For interaction semantics, reason from product needs and AG-UI first. Treat external Agent UI projects as references, not runtime dependencies or public contracts.
