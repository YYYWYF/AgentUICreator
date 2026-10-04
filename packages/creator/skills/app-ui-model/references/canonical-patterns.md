# Canonical patterns


### Remove a visual region

1. Resolve the visible feature to its Plugin instance.
2. Inspect its authoring target and containing Layout structure.
3. Derive the desired final Layout tree.
4. Remove the Plugin instance.
5. If its containing Layout region is now unnecessary, collapse or remove that
   Layout structure in the same transaction.

Do not edit either the removed Plugin source or neighboring Plugin source, and
do not remove a Service merely because its visual consumer was removed.

### Hide versus remove versus remove capability

- “先隐藏/先不要显示” -> `set_plugin_enabled(false)` and retain Layout.
- “去掉这个 UI/区域” -> `remove_plugin` with
  `reflow: "collapse-empty-region"` when the Plugin owns a dedicated visible
  region; otherwise use ordinary `remove_plugin` and preserve the Slot.
- “彻底删除能力” -> analyze Runtime Capability ownership and consumers; this
  is not automatically a Composition-only request.

### Remove a child Plugin

When a parent Plugin contributes a child Slot and the user removes the visual
feature occupying it, remove the child Plugin instance. Do not delete the
Parent Plugin's Slot declaration. Slot declaration is capability; occupant is
composition.

### Reuse an optional capability

Use the Composition Snapshot capability summaries to find an existing
unselected or disabled asset. Insert, enable, or reconfigure it before
considering new Plugin source. A Composition request to add an existing Theme
Switch is not Plugin creation.

### Move and resize

Use `move_plugin` for Plugin relocation. Use Layout operations and current
snapshot refs for region moves and sizing. Include all already-known related
size adjustments in the same transaction. A fixed sidebar track should be
written explicitly, for example:

```text
["280px", "minmax(0, 1fr)"]
```
