---
name: ui-plugin-development
description: Use to inspect, create, or modify UI Plugin manifests, definitions, React components, styles, contexts, and registration when existing Plugins cannot provide the requested frontend behavior.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: read_file ls glob grep edit_file write_file execute
---

# UI Plugin Development

Inspect project conventions before deciding that Plugin source must change:

- `/project/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `/project/plugins/*/definition.ts` joins a validated manifest to a React component.
- `/project/plugins/*/index.tsx` implements the component.
- `/project/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- `/project/plugins/index.ts` shows static registration conventions.
- `/project/framework/contracts/ui-plugin.ts` is the Plugin Contract.

## Reuse decision

1. List and inspect existing Plugins.
2. If one already supplies the requested behavior, reuse its `manifest.id` in a PluginInstance and change only AppUIModel.
3. If behavior is missing, create the smallest Plugin that follows the project's existing directory and registration conventions.
4. Add its PluginInstance and Slot composition through AppUIModel.

## Creating a Plugin

1. Read `/project/framework/contracts/ui-plugin.ts` and one existing Plugin end to end.
2. Create `/project/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, and accurate `data.messages` or `data.state` flags.
3. Create `index.tsx` with a named React component that accepts `UIPluginComponentProps` and narrows unknown AG-UI data safely.
4. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
5. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
6. Register and export the definition through the existing `/project/plugins/index.ts` convention.
7. Add exactly one PluginInstance and mount it in the intended AppUIModel Slot.
8. Run `pnpm typecheck` and `pnpm test`.

## Contract boundaries

- A Plugin receives `messages`, `state`, `run`, its `instance`, and runtime-provided `actions` through `UIPluginContext`.
- Use `context.actions.sendMessage`, `abortRun`, and `updateInstanceProps`; never create a separate Agent Runtime inside a Plugin.
- Keep Plugin dependencies in the generated project and follow its current UI stack and versions.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/project/runtime` or `/project/framework` for Plugin-specific behavior.
- Do not delete existing Plugins or rewrite unrelated registration entries.
