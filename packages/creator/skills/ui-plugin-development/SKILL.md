---
name: ui-plugin-development
description: Use to inspect, create, or modify UI Plugin manifests, definitions, React components, styles, contexts, and registration when existing Plugins cannot provide the requested frontend behavior.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: read_file ls glob grep edit_file create_ui_plugin inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin inspect_ui_plugin_source_references mutate_app_ui_model validate_creator_changes inspect_runtime_errors
---

# UI Plugin Development

Inspect project conventions before deciding that Plugin source must change:

- `/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `/plugins/*/definition.ts` joins a validated manifest to a React component.
- `/plugins/*/index.tsx` implements the component.
- `/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- `/plugins/registry.generated.ts` is the generated production registry and statically imports only definitions selected by AppUIModel. Never edit it or `/plugins/index.ts` by hand.
- `/framework/contracts/ui-plugin.ts` is the Plugin Contract.
- `/agent-contract/agent-events.ts` is the application-owned registry for backend Application Event names and payload schemas.
- `/agent-contract/agent-tools.ts` is the application-owned allowlist for capability operations exposed to the Agent.
- `/services/*` contains stable project-owned Service seams when multiple Plugins share one capability. Treat these seams as read-only unless the host explicitly authorizes capability-contract work.

## Reuse decision

1. List and inspect existing Plugins.
2. If one already supplies the requested behavior, reuse its `manifest.id` in a PluginInstance and change only AppUIModel.
3. If behavior is missing, create the smallest Plugin that follows the project's existing directory and registration conventions.
4. Add its PluginInstance and Slot composition through AppUIModel. For an existing nested extension point, inspect its exact contract and occupy it without adding a Layout node.

## Safe source editing

- Read every existing Plugin source file in the current run before editing it with `edit_file`.
- A prior run, project snapshot, `inspect_ui_plugin` result, or remembered source is not a current file observation for generic edit tools.
- If an edit reports `stale-version`, read the file again and reconcile the concurrent content; do not retry the old replacement unchanged.
- A new path is created without overwriting a file that appeared concurrently.
- Source creation and edits are recorded in the Creator transaction receipt for Host-level undo. Never use Git checkout, reset, or stash to overwrite the user's working tree.

## Creating a Plugin

1. Read `/framework/contracts/ui-plugin.ts` and one closest existing Plugin end to end.
2. Create `/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, and accurate `data.messages`, `data.state`, or `data.events` declarations.
3. Create `index.tsx` with a named React component. Accept `UIPluginComponentProps` only when it needs `renderSlot`; read Agent and instance data through Runtime Context hooks and narrow unknown state safely.
4. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
5. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
6. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
7. Submit `pluginId` and all currently known new Plugin files together in one `create_ui_plugin` call. It requires `manifest.json`, `definition.ts`, and `index.tsx`, is create-only, and transactionally rolls back the whole call on failure. Never use it to replace an existing Plugin directory or file.
8. Run `validate_creator_changes`. Fix returned diagnostics with `read_file` plus `edit_file`, then validate the new revision again.
9. Add exactly one PluginInstance and mount it in the intended AppUIModel Slot through `mutate_app_ui_model`; that transaction updates the generated Registry.
10. Because composition changes the Activity revision, run `validate_creator_changes` again for the final revision.
11. Call `inspect_runtime_errors`. Fresh current-hash evidence with zero current errors is required before claiming Runtime success.

## Development completion loop

Use the following loop autonomously when Plugin code is required:

```text
Reuse
-> Modify/Create source
-> Static Validation
-> Composition
-> Static Validation for the final revision
-> Runtime Verification
-> Repair when needed
-> Completion
```

- A static validation failure is normal development evidence, not a Tool failure. Read its bounded diagnostics, repair the relevant source, and validate the new revision.
- A current Runtime error requires source inspection, repair, another current-revision static validation, and fresh Runtime verification.
- Runtime evidence received before the latest source mutation is stale even when the AppUIModel hash did not change.
- Stop after two unsuccessful automatic repair rounds and report passed checks plus remaining diagnostics.
- When Runtime is unavailable in a headless or CLI session, state exactly that static validation passed but no Runtime verification evidence is available. Never claim Runtime success without fresh evidence.

## Contract boundaries

- Read Agent data through the domain hooks exported by `/runtime/context`: `useAgentConversation`, `useAgentMessages`, `useAgentState`, `useAgentRun`, `useAgentExecutions`, and `useAgentInterrupts`. Use `useAgentRuntimeSnapshot` only when the component genuinely needs the complete snapshot.
- Read the current instance scope through `usePluginInstance`, `usePluginActions`, and `usePluginEvents`. Never recreate a combined context prop or pass Runtime snapshot fields through component props.
- Before a Plugin consumes a backend Application Event, add its lowercase dot-separated name and strict payload schema to `/agent-contract/agent-events.ts`, then declare the same name in `manifest.data.events`. A manifest declaration consumes an application-owned contract; it does not register one.
- Subscribe through `usePluginEvents().subscribe`. Never import AG-UI protocol event types into Plugin code, invent a schema inside a Plugin, emit an Application Event from the frontend, or use this channel for persistent state, standard lifecycle, Activity, or local Plugin communication.
- Child Slots and Plugin-declared outlets are intentionally out of scope in this phase.
- Use `usePluginActions()` for instance-scoped actions including `updateInstanceProps`; `useAgentRuntimeActions()` is available when only Agent commands are needed. Never create a separate Agent Runtime inside a Plugin.
- Keep Plugin dependencies in the generated project and follow its current UI stack and versions.
- Service contracts are stable project-owned capability seams, not concrete
  Provider Plugins or Runtime Core actions:
  - `provides` means this Plugin owns and declares one or more capabilities for the current activation lifecycle.
  - `inject` means this Plugin requires a hard capability dependency before activation.
  - `usePluginService()` is runtime capability lookup for component access; `setup({ services })` remains the non-React activation API.
- Provider rules are strict: if `setup` calls `services.provide`, the Plugin **must** declare the same Service Name in `UIPluginDefinition.provides`.
- For a hard capability dependency, import its stable Service seam from `/services/*` and declare `inject` on `UIPluginDefinition`; do not import concrete Provider Plugin source.
- Provider implementations must be exposed only through `setup({ services })` + `services.provide(...)`, and the same Service Name must be declared in `provides`.
- Optional dependency behavior must not use `inject`; call `usePluginService(...)` in the component and tolerate `undefined`.
- When multiple Plugins share a capability, reuse an existing seam name/type from `/services/*` and never invent a synonym service contract.
- Prefer `UIPluginObservableService` only when other Plugins need sustained observation of service-owned state.
- `UIPluginObservableService` requires `getSnapshot()` + `subscribe()`; otherwise prefer a structural interface with explicit methods.
- Structural interface service examples are acceptable, and `EventEmitter`-style ad-hoc emitters should remain project-local, not runtime API additions.
- Do not place capability implementations into Plugin actions or Agent Runtime actions.
- A Frontend Tool is an Agent-facing adapter for a selected capability operation; it is not a Plugin capability and is not registered by a Plugin.
- When the product explicitly asks the Agent to invoke frontend behavior, first reuse an existing stable Service seam, have the Provider Plugin declare `provides`, and expose the selected operation from `/agent-contract/agent-tools.ts`. If no suitable seam exists, report that new Service source requires its own dedicated domain gate; never use `create_ui_plugin` to write `/services`.
- Frontend Tool names use `lower_snake_case`, inputs use `z.strictObject(...)`, descriptions explain when to call the Tool plus what it does and does not do, and results stay short, structured, and serializable.
- Frontend Tool handlers call `services.get(...)` and must tolerate a capability disappearing before execution. Never bind a Tool to a React component, ref, DOM query, Plugin instance, or concrete Provider implementation.
- Do not automatically expose every Service method. A Service may have zero, one, or many explicitly authorized Frontend Tools.
- Never generate `context.tools.register(...)`, `services.registerTool(...)`, `plugin.registerTool(...)`, or another Plugin self-registration API. Frontend Tool exposure is an Application permission boundary.
- Provider implementation lifetime is the Plugin activation lifetime; consumers should always read through runtime services instead of direct imports.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/runtime` or `/framework` for Plugin-specific behavior.
- Do not rewrite unrelated registration entries.
- Hiding, removing an instance, and replacing a feature all preserve Plugin source. Do not delete a Plugin directory with generic file tools. Permanent source deletion may only use the dedicated gated domain tool after exact authorization and reference checks; if that tool is unavailable, report the gate instead of approximating it.
