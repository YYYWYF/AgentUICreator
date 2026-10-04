# Creating a Plugin


1. Classify the Plugin, decide whether it should be Creator-operable, and define its Runtime, Composition, and optional Creator Authoring contracts.
2. Read the relevant declarations in `<sourceRoot>/framework/contracts/ui-plugin.ts` and one
   closest existing Plugin end to end. A self-contained local-state Plugin does
   not need every unrelated Runtime and child-Slot declaration in that contract.
3. For a new visible Plugin, draft its manifest and call `preflight_ui_plugin_placement` with the current AppUIModel hash, capability catalog revision, and intended instance id before writing source. Use its canonical `defaultPlacement` only if it matches the user's location and lifecycle. A rejection requires a same-semantics repair or a user decision; do not switch to application scope, another side, or a conditional Slot as fallback. Preflight does not verify source, Services, or narrow Runtime geometry, and the final mutation checks again. Once eligible, proceed to locale edits and the atomic `create_ui_plugin` call; further source searches need a specific unresolved API.
4. Create `<sourceRoot>/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, accurate `data.messages`, `data.state`, or `data.events` declarations, and the authoring contract when Add/Restore is intended.
   `data.messages`, `data.state`, and `data.messageUI` are booleans for AG-UI subscriptions; `data.events` is an array of event names. Local React `useState` is private Plugin state and does not belong in `manifest.data`.
5. Create `index.tsx` with a named React component. When an existing project component implements the requested UI, this may be a thin adapter importing it; do not recreate that UI for Plugin self-containment. Accept `UIPluginComponentProps` only when it needs `renderSlot`; read Agent and instance data through Runtime Context hooks in the adapter and narrow unknown state safely.
6. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
   Import the component with `from "./index"` when it lives in the required `index.tsx`. Do not also create `index.ts` as a barrel: TypeScript resolves `./index` to that file first and can make the component import circular. Do not add a `.tsx` extension to the import; the Host TypeScript configuration does not enable that syntax.
   Declare every service a built-in hook consumes. `useAgentUILocale` needs `AGENT_UI_LOCALE_SERVICE`; `useAgentUIThemeMode` needs `AGENT_UI_THEME_SERVICE`, each in `inject` or `optionalInject` as appropriate. Theme CSS tokens alone do not need the theme hook.
7. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
   Import a Plugin stylesheet once. For ordinary action buttons, use the
   project's inspected public Button facade when one exists.
8. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
9. Submit `pluginId` and all currently known new Plugin files together in one `create_ui_plugin` call, using `relativePath` values inside that Plugin directory. It requires `manifest.json`, `definition.ts`, and `index.tsx`, is create-only, and transactionally rolls back the whole call on failure. Never use it to replace an existing Plugin directory or file.
10. Run `validate_creator_changes`. Fix returned diagnostics with `read_file` plus `edit_file`, then validate the new revision again.
11. Add exactly one AppUIPluginNode through `mutate_app_ui_model`. When an
    eligible relative `defaultPlacement` declares the intended side panel,
    use `insert_plugin_default` so the Host places it beside the anchor in the
    public Layout and preserves the Platform drawer track. Do not insert it into
    the conversation's existing Slot or nest a Row inside its Panel. Use a
    low-level Layout operation only for a different authorized location after
    checking its root track and responsive contract. An Application Gate goes
    at application scope. The transaction updates the generated Registry.
12. Because composition changes the Activity revision, run `validate_creator_changes` again for the final revision.
13. In `static_and_runtime` mode, call `inspect_runtime_errors`. Fresh current-hash evidence with zero current errors is required before claiming Runtime success. In `static_only` mode, stop after current-revision static validation and do not claim Runtime success.
