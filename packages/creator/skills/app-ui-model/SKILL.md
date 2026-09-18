---
name: app-ui-model
description: Load for every request that changes AppUIModel composition, including simple add, remove, hide, move, resize, placement, props, Layout, or nested Plugin Slot changes.
compatibility: Agent UI Plugin Creator authoring model.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin mutate_app_ui_model execute
---

# AppUIModel Composition Manual

Use this Skill for every Composition change, not only complex Layout work.
AppUIModel owns which Plugin instances exist, whether they are enabled, their
authoring props and placement, and the Layout tree that contains visual regions.

Always reason in this order:

```text
user request
-> authoritative current composition
-> desired final composition
-> semantic delta
-> one atomic mutation when the delta is determinable
```

Do not choose a tool operation from the wording alone.

## Ownership boundary

- Composition owns AppUIModel plugin presence, enabled state, props, placement,
  Layout, Panels, Rows, Columns, Stacks, Slots, and Slot occupants.
- Plugin Behavior owns `/plugins/**` rendering, interaction, and child Slot
  declarations.
- Runtime Capability owns Services, Runtime stores, shared state, and Runtime
  actions.
- Agent Integration owns AG-UI, Frontend Tools, Application Events, and Agent
  contracts.
- A failure in Composition does not authorize Plugin, Runtime, or Agent
  Integration edits.
- Repair only defects introduced by this run or necessarily included in the
  user's requested final state. Report unrelated workspace-integrity blockers.

Treat `/app-ui/app-ui.json` as the editable authoring source of truth. Runtime
IR, Runtime slot ids, compiler-generated Layout ids, contributions, mounts, and
SlotRegistry state are derived and must never be edited or passed to Creator
tools. Use ProjectControl inspections for current facts and
`mutate_app_ui_model` for every Composition write; never edit AppUIModel or the
generated Registry with filesystem tools.

For a pure Composition request, use
`inspect_ui_project({"view":"composition"})` as the authoritative current-state
read. Its fresh snapshot already contains the model hash, compact Layout refs and
sizes, Slots and occupants, current Plugin instances and placement, available
capability summaries, Active Composition, and deterministic Layout constraints.
Each capability summary also carries positive authoring semantics when declared:
user intents, visual role, typical relative placement, recommended size,
Composition ownership, and current required/optional Service readiness. The
snapshot's `hostGuarantees` lists the legality checks performed atomically by
`mutate_app_ui_model`; `postCommitVerificationRequired: true` means admission
success is not full task verification and current-revision Host/Runtime checks
remain required after the commit.
Do not follow it with `list_ui_plugins`, `inspect_app_ui_model`,
`inspect_ui_slots`, manifest/source/CSS reads, Service inspection, or generated
file reads merely to reconfirm those facts. If a fully covered read returns
`OBSERVATION_ALREADY_COVERED`, reuse the snapshot and converge to the mutation.
Do not preflight a Host-guaranteed admission check. A summary with
`requiredServices.status: "resolved"` is authoritative for the current
Composition revision; it does not need a separate Service scan.

## Authoring invariants

- Read visual composition from `root` downward. Layout nodes are structural;
  Layout Slots contain ordered Plugin arrays.
- A Plugin node contains persistent `id`, `pluginId`, `enabled`, optional
  `props`, and optional child `slots` keyed by local Slot name.
- Plugin instance ids are persistent. Inspection `nodeRef` and `slotRef` values
  are snapshot-scoped authoring references.
- Array order is display order; do not create a separate contribution order.
- Row or Column `sizes`, when present, has one entry per child.
- Creator Row/Column track sizes always use explicit CSS strings such as
  `"280px"`, `"1fr"`, or `"minmax(0, 1fr)"`. Never send numeric Row/Column
  track sizes through Creator mutation operations: Runtime numeric Row/Column
  sizes represent fractional tracks, not pixels. Existing persisted numeric
  sizes remain compatible and are not migrated.
- Inserting into a Row or Column that already has `sizes` requires the new
  child's `size` in that same insert or move operation. For
  `insert_layout_relative`, include `size` when the matching parent is sized;
  when the operation creates a new sized wrapper, provide `size` and
  `anchorSize` together.
- Stack `activeIndex`, when present, is a valid child index.
- Panel `minWidth` must not exceed `maxWidth`.
- A Plugin child Slot must be declared by its manifest and obey cardinality.
  The declaration is Parent Plugin capability; its occupants are Composition.
- Layout Slot nodes do not gain descriptions, hints, roles, or accepts lists.

## Semantic operations

- `insert_plugin`: insert one complete Plugin node into `application`, a
  `layout_slot(slotRef)`, or `plugin_slot(parentInstanceId, slot)`.
- `move_plugin`: relocate an existing Plugin subtree.
- `remove_plugin`: remove an instance subtree while preserving Plugin source.
  When removing a Plugin that owns an entire visible Layout region and the user
  wants that region gone, prefer `reflow: "collapse-empty-region"`. Use the
  ordinary operation (or `reflow: "preserve"`) for an existing/shared Slot.
  Do not manually update Row/Column sizes when deterministic reflow expresses
  the requested result.
- `replace_plugin`: replace an instance subtree in place.
- `update_plugin_props`: change authoring configuration.
- `set_plugin_enabled`: hide or restore an existing instance.
- Layout operations use snapshot-scoped refs. All refs in a transaction are
  bound to the starting snapshot. A new node may declare a transaction-only
  `$localRef` for later operations in that same transaction.

Prefer one complete transaction. The Host parses and compiles the draft,
checks composition and child Slot integrity, regenerates the static Registry,
and commits atomically only when its gates succeed.

## Canonical patterns

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

## Failure semantics and retry

- `stale_state`: the observation cannot authorize another mutation. Refresh the
  minimum authoritative state and retry; this refresh is not a semantic replan.
- `operation_precondition`: the observation is still valid and no authoring
  state changed. Re-form the semantic delta from that observation and retry at
  most once.
- `workspace_integrity`: stop the current Composition task. Do not edit Plugin
  source, manifests, Services, Runtime, or Agent contracts unless that repair is
  explicitly in the user's requested final state.
- `infrastructure`: follow infrastructure recovery. Do not reinterpret it as
  permission for a different authoring layer.

If an error reports `observationStillValid=true`, reuse the observation. If it
reports false, re-inspect before another mutation. A second semantic retry is
not allowed. Stale-state refreshes do not consume the one semantic replan.

## Golden examples

Each example shows the reasoning contract; ids and refs must come from current
inspection, never from these examples.

### 1. Remove left conversation history

```text
User request: Remove the left conversation history.
Current composition: row(left panel -> thread-list, main panel -> surface).
Desired state: conversation surface only; ConversationService remains.
Owning layer: Composition.
Semantic delta: remove thread-list instance and collapse its dedicated left
Layout region.
Correct tool: one mutate_app_ui_model transaction with
`remove_plugin(reflow="collapse-empty-region")`.
Incorrect: edit thread-list source, edit conversation-surface source, remove
ConversationService, or submit layout removal first as a probing mutation.
```

### 2. Hide left conversation history

```text
User request: Hide the history for now.
Current composition: enabled thread-list in the left region.
Desired state: same composition and Layout, instance disabled.
Owning layer: Composition.
Semantic delta: enabled true -> false.
Correct tool: set_plugin_enabled(false).
Incorrect: remove the instance, delete the left Layout, or edit CSS/source.
```

### 3. Remove Suggestions

```text
User request: Remove suggested questions.
Current composition: conversation-surface.emptySuggestions contains a
conversation-suggestions instance.
Desired state: the child Slot remains declared but has no Suggestions occupant.
Owning layer: Composition.
Semantic delta: remove the Suggestions child Plugin instance.
Correct tool: remove_plugin.
Incorrect: delete emptySuggestions from the parent manifest or edit the parent.
```

### 4. Move an existing Plugin

```text
User request: Move the existing inspector to the right region.
Current composition: one inspector instance in another Slot; destination known.
Desired state: same persistent instance and props in the destination.
Owning layer: Composition.
Semantic delta: placement only.
Correct tool: move_plugin.
Incorrect: remove plus insert, create a new Plugin, or copy Plugin source.
```

### 5. Resize the left panel

```text
User request: Make the left panel 320px wide.
Current composition: left Panel identified by current nodeRef.
Desired state: same subtree with width 320.
Owning layer: Composition.
Semantic delta: one Layout property update.
Correct tool: update_layout_node_props using the current snapshot ref.
Incorrect: edit Plugin CSS or persist a runtime Layout id.
```

### 6. Add an existing Theme Switch

```text
User request: Add a theme switch.
Current composition: Theme Switch asset exists but is not selected.
Desired state: one enabled instance in the requested or uniquely resolved Slot.
Owning layer: Composition.
Semantic delta: insert the existing asset with final props and placement.
Correct tools: inspect_ui_project(view=composition), then insert_plugin in one
mutation.
Incorrect: create a duplicate Theme Switch Plugin or add Runtime theme state.
```

### 7. Remove UI entry versus capability

```text
User request A: Remove the history entry from the UI.
Desired state A: visual instance and now-unused Layout region are absent.
Owning layer A: Composition.

User request B: Completely remove history capability.
Desired state B: capability, providers, and consumers may all change.
Owning layers B: Runtime Capability plus any explicitly required Composition or
Plugin Behavior changes, after inspecting consumers.

Incorrect: interpret request A as authorization to delete a Service or source.
```

### 8. Add conversation management

```text
User request: Add conversation management.
Current composition: conversation-surface is mounted;
conversation-thread-list is an unselected capability whose authoring intents
cover conversation management/history/selection, whose visual role is
conversation navigation, whose typical placement is before conversation-surface,
and whose required Services are resolved. No product default width is declared
by this capability. Desired state: an enabled conversation-thread-list in a
valid sized region before the existing conversation surface; existing
ConversationService remains.
Owning layer: Composition.
Semantic delta: insert the recommended left Layout region and the existing
capability in one atomic mutation.
Correct tools: inspect_ui_project(view=composition), load app-ui-model and
ui-layout, then mutate_app_ui_model.
Incorrect: read the manifest, inspect Services, read Plugin source/CSS, or scan
the project to preflight checks listed in hostGuarantees.
```
