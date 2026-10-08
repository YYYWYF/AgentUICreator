---
name: ui-layout
description: Use for Layout Tree decisions involving Row, Column, Stack, Panel, Slot, Sidebar, dimensions, resizing, placement, and composition of existing plugin nodes.
compatibility: Agent UI Plugin Creator AppUIModel and deterministic compiler boundary.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# UI Layout

Express composition through the AppUIModel Layout Tree rather than DOM manipulation or ad-hoc Plugin CSS.

Do not load this Skill for an eligible `insert_plugin_default` request from a
fresh Composition Snapshot. The Host resolves the declared authoring placement,
size, track materialization, and low-level lowering atomically. Load this Skill
when the semantic operation is unavailable, fails closed, or the user requests
custom Layout placement or geometry.

## Node semantics

- `sidebar`: wraps the main `content` and ordered single-plugin navigation `items`.
- `row`: lays out children horizontally. Optional `sizes` correspond by index to `children`.
- `column`: lays out children vertically. Optional `sizes` correspond by index to `children`.
- `stack`: overlays or switches among children; `activeIndex` selects a direct child by index.
- `panel`: wraps one child and may define width, height, min/max width, or resizing.
- `slot`: is a physical structural location with an ordered `plugins` array. It has no persisted id, description, hint, or Runtime slot id.

## Layout rules

- Preserve existing child order and regions unless the request says otherwise.
- Use the observed `nodeRef` only for the current mutation snapshot. Store each visual plugin directly in the Slot where it appears.
- For a fixed right region, use a Row with the main content first and a right Panel second.
- When a Row `sizes` entry and a child Panel `width` describe the same fixed dimension, update both consistently.
- For Row and Column layouts, the parent `sizes` owns the grid tracks. A fixed-size child Panel does not shrink its parent track. For a fixed sidebar, set the parent tracks to `[W, minmax(0, 1fr)]` and use the matching child Panel width when that authoring constraint is also needed. `gap` only controls space between tracks; inspect the parent tracks and child bounds before attributing a visible layout issue to `gap`.
- Creator Row/Column track sizes always use explicit CSS strings. Correct values
  include `"280px"`, `"1fr"`, and `"minmax(0, 1fr)"`; never send numeric
  track sizes through Creator mutation operations. Runtime numeric Row/Column
  sizes represent fractional tracks, not pixels. A fixed sidebar example is
  `["280px", "minmax(0, 1fr)"]`.
- When inserting into a Row or Column that already has `sizes`, pass the new
  child's `size` on `insert_layout_node`, `move_layout_node`, or
  `insert_layout_relative`; a later `update_layout_node_props` cannot rescue an
  earlier sequential operation that already failed. When
  `insert_layout_relative` creates a new sized wrapper, pass `size` and
  `anchorSize` together.
- Use a nested Column for vertical subdivision and Stack only when overlapping or active-view behavior is intended.
- Do not add a plugin node until you have confirmed the referenced Plugin exists.
- Do not edit Runtime layout code for an application-specific arrangement.

For a pure Layout change, start from
`inspect_ui_project({"view":"composition"})`; do not re-read AppUIModel,
manifests, Plugin source, CSS, Services, or generated files when that fresh
snapshot already contains the needed refs, sizes, Slots, instances, capability
summaries, authoring placement/size guidance, Service readiness, Host
guarantees, and constraints. Treat authoring placement and size as defaults:
explicit user intent and the current Composition take precedence. Apply the
change through `mutate_app_ui_model` with
the exact inspected hash. Prefer one batch, use `insert_layout_relative` for
deterministic left/right/above/below placement, and use `$localRef` when a later
operation must reference a node created in the same transaction.

## Generic Sidebar

`sidebar` is a Layout container, not a Plugin. It has `defaultActive: null | itemId`,
ordered `items: [{ id, child: { type: "slot", plugins: [oneVisualPlugin] } }]`, and
`content` containing the ordinary Layout Tree. Never store icons, labels or live
collapse state in AppUIModel. The selected Plugin manifest must declare `sidebar`
with a supported Lucide icon and optional `en-US`/`zh-CN` labels (Plugin name fallback).
Supported icons: `messages-square`, `folder`, `folder-open`, `files`, `search`,
`settings`, `database`, `chart-no-axes-combined`, `list`, `bot`, `book-open`, `star`,
`circle-help`. Inspect the manifest before choosing a Sidebar placement; edit
Plugin navigation metadata only when the user asks to change its icon or label.

Use deterministic `mutate_app_ui_model` operations:

- `insert_sidebar_item`: `sidebarRef`, unique `itemId`, optional `index`, and
  exactly one of `plugin` (new instance) or `instanceId` (move existing instance).
- `remove_sidebar_item`: `sidebarRef`, `itemId`. Removes its composition entry;
  preserves Plugin source. Moving out instead uses `move_plugin` to an observed
  ordinary `layout_slot` or `plugin_slot`; the empty Sidebar item is pruned.
- `reorder_sidebar_items`: `sidebarRef`, `itemIds` containing every item exactly once.
- `update_layout_node_props`: `nodeRef`, `set: { defaultActive: null | itemId }`.

These operations participate in the existing atomic transaction and final
composition validation. For a project without Sidebar, use `replace_layout_node`
with a complete Sidebar container preserving existing Plugin instances in its
`content` and moving selected instances into its items. Do not infer tree changes
from strings or DOM selectors. Desktop rail is 48px with a 280px active panel;
containers narrower than 648px use a scoped Sheet. Only new platform/assistant
presets adopt Sidebar automatically; preserve existing project layouts.
