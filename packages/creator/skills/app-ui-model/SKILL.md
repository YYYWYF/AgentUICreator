---
name: app-ui-model
description: Use for AppUIModel v1 composition, LayoutNode, Slot, and PluginInstance changes, especially when adding, removing, resizing, or placing UI regions without changing plugin behavior.
compatibility: Agent UI Plugin Creator AppUIModel v1 and Phase 8 Plugin composition.
allowed-tools: read_file ls glob grep edit_file write_file execute
---

# AppUIModel

Treat `/project/app-ui/app-ui.json` as the single source of truth for UI composition. Read it and `/project/framework/contracts/app-ui-model.ts` before editing when the exact schema or an invariant is uncertain.

## Decide the change layer

- Change only AppUIModel for layout, size, placement, enabled state, instance props, or composition.
- Reuse an existing UI Plugin by adding a `PluginInstance` and mounting its instance id in a `Slot`.
- Do not change Plugin source for a structural request when an existing Plugin already provides the behavior.
- If new behavior requires Plugin source, use the `ui-plugin-development` skill and keep the change under `/project/plugins/`.

## AppUIModel v1 invariants

- Keep `version` equal to `"1"`.
- Every LayoutNode `id` and every `slotId` must be unique.
- A Row or Column `sizes` array, when present, must have one entry per child.
- A Stack `active` value must name one of its direct children.
- A Panel `minWidth` must not exceed `maxWidth`.
- Each `pluginInstances` key must equal that instance's `id`.
- Every id mounted by `pluginInstanceIds` must exist in `pluginInstances`.
- Do not mount one PluginInstance in more than one Slot.

## Adding a region

1. Inspect `/project/plugins/` to determine whether a suitable Plugin exists.
2. Inspect its manifest to learn its `pluginId`, data needs, and purpose.
3. Add or reuse exactly one PluginInstance.
4. Add the appropriate Panel and Slot in the Layout Tree.
5. Mount the instance id in that Slot and keep existing regions intact.
6. Run `pnpm test`; run `pnpm typecheck` when the change could affect typed source.

Prefer a small targeted JSON edit. Do not reformat or redesign unrelated parts of the model.
