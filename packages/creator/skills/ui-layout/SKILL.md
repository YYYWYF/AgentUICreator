---
name: ui-layout
description: Use for Layout Tree decisions involving Row, Column, Stack, Panel, Slot, dimensions, resizing, placement, and composition of existing PluginInstances.
compatibility: Agent UI Plugin Creator AppUIModel v1 and deterministic Layout Runtime.
allowed-tools: read_file ls glob grep edit_file execute
---

# UI Layout

Express composition through the AppUIModel Layout Tree rather than DOM manipulation or ad-hoc Plugin CSS.

## Node semantics

- `row`: lays out children horizontally. Optional `sizes` correspond by index to `children`.
- `column`: lays out children vertically. Optional `sizes` correspond by index to `children`.
- `stack`: overlays or switches among children; `active` names a direct child id.
- `panel`: wraps one child and may define width, height, min/max width, or resizing.
- `slot`: mounts zero or more PluginInstance ids at a named UI location.

## Layout rules

- Preserve existing child order and regions unless the request says otherwise.
- Use stable, descriptive, unique node and slot ids.
- For a fixed right region, use a Row with the main content first and a right Panel second.
- When a Row `sizes` entry and a child Panel `width` describe the same fixed dimension, update both consistently.
- Use a nested Column for vertical subdivision and Stack only when overlapping or active-view behavior is intended.
- Do not add a PluginInstance until you have confirmed the referenced Plugin exists.
- Do not edit Runtime layout code for an application-specific arrangement.

After editing, verify child counts against `sizes`, PluginInstance mounts, and Panel bounds, then run `pnpm test`.
