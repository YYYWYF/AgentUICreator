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
2. Create `/project/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, and accurate `data.messages` or `data.state` flags.
3. Create `index.tsx` with a named React component that accepts `UIPluginComponentProps` and narrows unknown AG-UI data safely.
4. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
6. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
7. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
8. Add exactly one PluginInstance and mount it in the intended AppUIModel Slot through `mutate_app_ui_model`; that transaction updates the generated Registry.
9. Run `pnpm typecheck` and `pnpm test`.

## Contract boundaries

- A Plugin receives `messages`, `state`, `run`, its `instance`, and runtime-provided `actions` through `UIPluginContext`.
- Child Slots and Plugin-declared outlets are intentionally out of scope in this phase.
- Use `context.actions.sendMessage`, `startNewConversation`, `abortRun`, and `updateInstanceProps`; never create a separate Agent Runtime inside a Plugin.
- Keep Plugin dependencies in the generated project and follow its current UI stack and versions.
- For a hard Plugin capability dependency, import its stable Service seam and declare `inject` on `UIPluginDefinition`; do not import the concrete Provider Plugin's source.
- Provide the implementation from the Provider's `setup` with the same stable service name. A missing hard dependency remains pending; optional capabilities omit `inject` and probe with `services.get()`.
- When multiple Plugins share a project-owned capability, reuse its service name and type from `/project/services/*`. If no seam exists, report the missing capability contract instead of placing it inside a concrete Provider directory.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/project/runtime` or `/project/framework` for Plugin-specific behavior.
- Do not rewrite unrelated registration entries.
- Hiding, removing an instance, and replacing a feature all preserve Plugin source. Do not delete a Plugin directory with generic file tools. Permanent source deletion may only use the dedicated gated domain tool after exact authorization and reference checks; if that tool is unavailable, report the gate instead of approximating it.
