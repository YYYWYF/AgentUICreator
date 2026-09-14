---
name: ui-layout
description: Use for Layout Tree decisions involving Row, Column, Stack, Panel, Slot, dimensions, resizing, placement, and composition of existing plugin nodes.
compatibility: Agent UI Plugin Creator AppUIModel v3 and deterministic compiler boundary.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# UI Layout

Express composition through the AppUIModel Layout Tree rather than DOM manipulation or ad-hoc Plugin CSS.

## Node semantics

- `row`: lays out children horizontally. Optional `sizes` correspond by index to `children`.
- `column`: lays out children vertically. Optional `sizes` correspond by index to `children`.
- `stack`: overlays or switches among children; `active` names a direct child id.
- `panel`: wraps one child and may define width, height, min/max width, or resizing.
- `slot`: describes a physical authoring location with a unique `id`, useful `description`, and ordered `plugins` array. It never contains a Runtime slot id.

## Layout rules

- Preserve existing child order and regions unless the request says otherwise.
- Use stable, descriptive, unique node and Slot ids. Store each visual plugin directly in the Slot where it appears.
- For a fixed right region, use a Row with the main content first and a right Panel second.
- When a Row `sizes` entry and a child Panel `width` describe the same fixed dimension, update both consistently.
- Use a nested Column for vertical subdivision and Stack only when overlapping or active-view behavior is intended.
- Do not add a plugin node until you have confirmed the referenced Plugin exists.
- Do not edit Runtime layout code for an application-specific arrangement.

Apply the change through `mutate_app_ui_model` with the exact inspected hash. The transaction verifies child counts against `sizes`, nested Slot contracts, Panel bounds, deterministic compilation, and Registry generation before committing; then run the relevant project validation commands.
