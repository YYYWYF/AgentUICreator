---
name: app-ui-model
description: Use for AppUIModel v2 composition, LayoutNode, semantic Slot contracts, and PluginInstance changes, especially when adding, removing, resizing, or placing UI regions without changing plugin behavior.
compatibility: Agent UI Plugin Creator AppUIModel v2 and semantic Slot composition.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# AppUIModel

Treat `/project/app-ui/app-ui.json` as the single source of truth for UI composition. Use the bounded project snapshot for navigation and call `inspect_app_ui_model` when exact current content is needed. Submit composition changes through `mutate_app_ui_model` with that inspection's exact hash; do not edit the JSON with generic file tools.

## Decide the change layer

- Change only AppUIModel for layout, size, placement, enabled state, instance props, or composition.
- Reuse an existing UI Plugin by adding a `PluginInstance` and mounting its instance id in a `Slot`.
- Do not change Plugin source for a structural request when an existing Plugin already provides the behavior.
- If new behavior requires Plugin source, use the `ui-plugin-development` skill and keep the change under `/project/plugins/`.

## AppUIModel v2 invariants

- Keep `version` equal to `"2"`.
- Keep physical placement in `root` and semantic composition in top-level `slots`; a Layout `SlotNode` contains only `id` and `slotId`.
- Every LayoutNode `id`, Slot id, and Layout Slot reference must be unique.
- A Row or Column `sizes` array, when present, must have one entry per child.
- A Stack `active` value must name one of its direct children.
- A Panel `minWidth` must not exceed `maxWidth`.
- Each `pluginInstances` key must equal that instance's `id`.
- Every `slots.*.occupants[].instanceId` must exist in `pluginInstances`.
- Do not mount one PluginInstance in more than one Slot.
- Respect `single`, `list`, `keyed`, and `chain` occupant identity rules.
- A Plugin-owned Slot must name an outlet declared by its owner Plugin definition, match that outlet's scope, cardinality, owner props, and fallback contract, and remain reachable from a Layout-owned Slot.
- Inspect `inspect_ui_slots` before replacement; `replaceRisk` reports owner fallback, occupant, and descendant-Slot impact.

## Adding a region

1. Inspect `/project/plugins/` to determine whether a suitable Plugin exists.
2. Inspect its manifest to learn its `pluginId`, data needs, and purpose.
3. In one `mutate_app_ui_model` transaction, add or reuse exactly one PluginInstance.
4. Add the appropriate Panel and physical SlotNode in the Layout Tree, then add its semantic Slot contract.
5. Mount the instance in `occupants` with the identity required by the Slot kind and keep existing regions intact. Multi-operation transactions may pass through an incomplete intermediate state, but the final state must satisfy every invariant.
6. Run `pnpm test`; run `pnpm typecheck` when the change could affect typed source.

Prefer the smallest set of semantic operations. The transaction validates the full model and regenerates the static Registry before either file is committed. If the hash is stale, inspect again instead of guessing or overwriting concurrent changes.

## Hide, remove, and replace

- “先不要显示” means one transaction with `set_instance_enabled(false)` and `unmount_instance`. The instance and Plugin source remain, so the Registry still selects it.
- “移除这个功能” means `unmount_instance` plus `remove_instance`. If it was the last instance, the generated Registry drops the import; Plugin source remains as an unselected asset.
- Replacement must put the new instance in place before removing the old one, preferably with `replace_instance` or one atomic multi-operation transaction. Preserve both source assets.
- Never treat hide, remove, or replace as authorization to delete Plugin source. Permanent source deletion is a separate, gated domain action.
