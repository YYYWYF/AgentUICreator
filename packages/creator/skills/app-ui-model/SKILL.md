---
name: app-ui-model
description: Use for AppUIModel v3 layout and nested plugin composition, especially when adding, removing, resizing, or placing UI regions without changing plugin behavior.
compatibility: Agent UI Plugin Creator AppUIModel v3 authoring model.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# AppUIModel

Treat `/app-ui/app-ui.json` as the only editable source of truth for generated layout and plugin configuration. The Runtime Model, Runtime slot ids, contributions, and SlotRegistry state are deterministic compiler output and must never be edited or passed to Creator tools.

Use the bounded project snapshot for navigation and call `inspect_app_ui_model` when exact current content is needed. Submit composition changes through `mutate_app_ui_model` with that inspection's exact hash; do not edit the JSON with generic file tools.

## Decide the change layer

- Change only AppUIModel for layout, size, placement, enabled state, plugin props, or composition.
- Reuse an existing UI Plugin by inserting a plugin node at the Layout Slot or parent plugin local Slot where it appears.
- Put headless providers and Application Gates in top-level `applicationPlugins`; they do not occupy visual Slots.
- Do not change Plugin source for a structural request when an existing Plugin already provides the behavior.
- If new behavior requires Plugin source, use the `ui-plugin-development` skill and keep the change under `/plugins/`.

## AppUIModel v3 invariants

- Keep `version` equal to `"3"`.
- Read visual composition from `root` downward. A Layout Slot contains `id`, `description`, and its ordered `plugins` array; it has no `slotId`.
- A plugin node contains `id`, `pluginId`, `enabled`, optional `props`, and optional `slots` keyed by instance-local Slot name.
- Array order is display order. Do not express contribution order separately.
- Every LayoutNode id and plugin instance id must be unique.
- A Row or Column `sizes` array, when present, must have one entry per child.
- A Stack `active` value must name one of its direct children.
- A Panel `minWidth` must not exceed `maxWidth`.
- A plugin local Slot must be declared by that plugin's manifest and satisfy its `one` or `many` cardinality and required/optional rule.
- Never add an `accepts` list. Plugin descriptions say what plugins are; Slot descriptions say what their locations are for. Creator chooses the match.

## Semantic operations

- `insert_plugin`: insert a complete plugin node into `{type:"application"}`, `{type:"layout_slot", slotNodeId}`, or `{type:"plugin_slot", parentInstanceId, slot}`.
- `move_plugin`: relocate an existing plugin subtree to one of those targets.
- `remove_plugin`: remove an existing plugin subtree without deleting its source.
- `replace_plugin`: replace a plugin subtree in place.
- `update_plugin_props` and `set_plugin_enabled`: update the named authoring node.

Prefer one complete transaction. The transaction parses the draft, compiles it with deterministic `compileAppUIModel()`, performs Runtime composition validation, regenerates the static Registry, and commits only if all gates succeed. If the hash is stale, inspect again instead of guessing or overwriting concurrent changes.

## Hide, remove, and replace

- “先不要显示” means `set_plugin_enabled(false)`; keep the node in its current authoring location.
- “移除这个功能” means `remove_plugin`. Plugin source remains as an unselected asset if no other node selects it.
- Replacement should use `replace_plugin` with the complete replacement node.
- Never treat hide, remove, or replace as authorization to delete Plugin source. Permanent source deletion is a separate, gated domain action.
