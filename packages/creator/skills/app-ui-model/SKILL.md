---
name: app-ui-model
description: Use for AppUIModel v2 generated layout and PluginInstance mount configuration, especially when adding, removing, resizing, or placing UI regions without changing plugin behavior.
compatibility: Agent UI Plugin Creator AppUIModel v2 and runtime SlotRegistry composition.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# AppUIModel

Treat `/project/app-ui/app-ui.json` as the source of truth for generated layout and PluginInstance configuration. Runtime SlotRegistry owns active contributions. Use the bounded project snapshot for navigation and call `inspect_app_ui_model` when exact current content is needed. Submit composition changes through `mutate_app_ui_model` with that inspection's exact hash; do not edit the JSON with generic file tools.

## Decide the change layer

- Change only AppUIModel for layout, size, placement, enabled state, instance props, or composition.
- Reuse an existing UI Plugin by adding a `PluginInstance` and mounting its instance id in a `Slot`.
- Do not change Plugin source for a structural request when an existing Plugin already provides the behavior.
- If new behavior requires Plugin source, use the `ui-plugin-development` skill and keep the change under `/project/plugins/`.

## AppUIModel v2 invariants

- Keep `version` equal to `"2"`.
- Keep physical placement in `root`; a Layout `SlotNode` contains only `id` and `slotId`.
- Every LayoutNode `id` and Layout `slotId` must be unique.
- A Row or Column `sizes` array, when present, must have one entry per child.
- A Stack `active` value must name one of its direct children.
- A Panel `minWidth` must not exceed `maxWidth`.
- Each `pluginInstances` key must equal that instance's `id`.
- A PluginInstance has at most one ordinary `mount`; its `mount.slotId` must reference either a Layout SlotNode or a Plugin child Slot reachable from the Layout-rooted composition graph.
- `mount === undefined` means the instance has no ordinary UI mount. Headless instances remain supported.
- Use `mount.order` when multiple instances target one Slot; runtime order is `order`, then `instanceId`.

## Adding a region

1. Inspect `/project/plugins/` to determine whether a suitable Plugin exists.
2. Inspect its manifest to learn its `pluginId`, data needs, and purpose.
3. In one `mutate_app_ui_model` transaction, add or reuse exactly one PluginInstance.
4. Add the appropriate Panel and physical SlotNode in the Layout Tree.
5. Set the instance's `mount.slotId` and optional stable `mount.order`, keeping existing regions intact. Multi-operation transactions may pass through an incomplete intermediate state, but the final state must satisfy every invariant.
6. Run `pnpm test`; run `pnpm typecheck` when the change could affect typed source.

Prefer the smallest set of semantic operations. The transaction validates the full model and regenerates the static Registry before either file is committed. If the hash is stale, inspect again instead of guessing or overwriting concurrent changes.

## Hide, remove, and replace

- “先不要显示” means one transaction with `set_instance_enabled(false)` and `unmount_instance`. The instance and Plugin source remain, so the Registry still selects it.
- “移除这个功能” means `unmount_instance` plus `remove_instance`. If it was the last instance, the generated Registry drops the import; Plugin source remains as an unselected asset.
- Replacement must put the new instance in place before removing the old one, preferably with `replace_instance` or one atomic multi-operation transaction. Preserve both source assets.
- Never treat hide, remove, or replace as authorization to delete Plugin source. Permanent source deletion is a separate, gated domain action.
