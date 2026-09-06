---
name: ui-plugin-development
description: Use to inspect, create, or modify UI Plugin manifests, definitions, React components, styles, contexts, and registration when existing Plugins cannot provide the requested frontend behavior.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: read_file ls glob grep edit_file write_file inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model undo_creator_run execute
---

# UI Plugin Development

Inspect project conventions before deciding that Plugin source must change:

- `/project/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `/project/plugins/*/definition.ts` joins a validated manifest to a React component.
- `/project/plugins/*/index.tsx` implements the component.
- `/project/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- `/project/plugins/registry.generated.ts` is the generated production registry and statically imports only definitions selected by AppUIModel. Never edit it or `/project/plugins/index.ts` by hand.
- `/project/framework/contracts/ui-plugin.ts` is the Plugin Contract.
- `/project/agent-contract/agent-events.ts` is the application-owned registry for backend Application Event names and payload schemas.
- `/project/services/*` contains stable project-owned Service seams when multiple Plugins share one capability. Treat these seams as read-only unless the host explicitly authorizes capability-contract work.

## Reuse decision

1. List and inspect existing Plugins.
2. If one already supplies the requested behavior, reuse its `manifest.id` in a PluginInstance and change only AppUIModel.
3. If behavior is missing, create the smallest Plugin that follows the project's existing directory and registration conventions.
4. Add its PluginInstance and Slot composition through AppUIModel. For an existing nested extension point, inspect its exact contract and occupy it without adding a Layout node.

## Safe source editing

- Read every existing Plugin source file in the current run before editing it or replacing it with `write_file`.
- A prior run, project snapshot, `inspect_ui_plugin` result, or remembered source is not a current file observation for generic edit tools.
- If an edit reports `stale-version`, read the file again and reconcile the concurrent content; do not retry the old replacement unchanged.
- A new path is created without overwriting a file that appeared concurrently.
- Use `undo_creator_run` for run-level recovery. Never use Git checkout, reset, or stash to overwrite the user's working tree.

## Creating a Plugin

1. Read `/project/framework/contracts/ui-plugin.ts` and one existing Plugin end to end.
2. Create `/project/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, and accurate `data.messages`, `data.state`, or `data.events` declarations.
3. Create `index.tsx` with a named React component that accepts `UIPluginComponentProps` and narrows unknown AG-UI data safely.
4. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
6. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
7. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
8. Add exactly one PluginInstance and mount it in the intended AppUIModel Slot through `mutate_app_ui_model`; that transaction updates the generated Registry.
9. Run `pnpm typecheck` and `pnpm test`.

## Contract boundaries

- A Plugin receives `conversation`, `messages`, `state`, `run`, `executions`, `interrupts`, scoped `events`, its `instance`, runtime-provided `actions`, and frontend `services` through `UIPluginContext`.
- Before a Plugin consumes a backend Application Event, add its lowercase dot-separated name and strict payload schema to `/project/agent-contract/agent-events.ts`, then declare the same name in `manifest.data.events`. A manifest declaration consumes an application-owned contract; it does not register one.
- Subscribe through `context.events.subscribe`. Never import AG-UI protocol event types into Plugin code, invent a schema inside a Plugin, emit an Application Event from the frontend, or use this channel for persistent state, standard lifecycle, Activity, or local Plugin communication.
- Child Slots and Plugin-declared outlets are intentionally out of scope in this phase.
- Use `context.actions.sendMessage`, `startNewConversation`, `abortRun`, and `updateInstanceProps`; never create a separate Agent Runtime inside a Plugin.
- Keep Plugin dependencies in the generated project and follow its current UI stack and versions.
- Service contracts are owned by the runtime, not individual Plugins:
  - `provides` means this Plugin owns and declares one or more capabilities for the current activation lifecycle.
  - `inject` means this Plugin requires a hard capability dependency before activation.
  - `services.get()` is runtime capability lookup for optional access.
- Provider rules are strict: if `setup` calls `services.provide`, the Plugin **must** declare the same Service Name in `UIPluginDefinition.provides`.
- For a hard capability dependency, import its stable Service seam from `/project/services/*` and declare `inject` on `UIPluginDefinition`; do not import concrete Provider Plugin source.
- Provider implementations must be exposed only through `setup({ services })` + `services.provide(...)`, and the same Service Name must be declared in `provides`.
- Optional dependency behavior must not use `inject`; call `services.get(...)` at runtime and tolerate `undefined`.
- When multiple Plugins share a capability, reuse an existing seam name/type from `/project/services/*` and never invent a synonym service contract.
- Prefer `UIPluginObservableService` only when other Plugins need sustained observation of service-owned state.
- `UIPluginObservableService` requires `getSnapshot()` + `subscribe()`; otherwise prefer a structural interface with explicit methods.
- Structural interface service examples are acceptable, and `EventEmitter`-style ad-hoc emitters should remain project-local, not runtime API additions.
- Do not place capability implementations into `context.actions`.
- Provider implementation lifetime is the Plugin activation lifetime; consumers should always read through runtime services instead of direct imports.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/project/runtime` or `/project/framework` for Plugin-specific behavior.
- Do not rewrite unrelated registration entries.
- Hiding, removing an instance, and replacing a feature all preserve Plugin source. Do not delete a Plugin directory with generic file tools. Permanent source deletion may only use the dedicated gated domain tool after exact authorization and reference checks; if that tool is unavailable, report the gate instead of approximating it.
