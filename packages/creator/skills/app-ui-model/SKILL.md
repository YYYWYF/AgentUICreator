---
name: app-ui-model
description: Load for low-level AppUIModel composition changes, including custom add, remove, hide, move, resize, placement, Layout, or nested Plugin Slot changes. The Host-owned insert_plugin_default semantic fast path does not require this Skill.
compatibility: Agent UI Plugin Creator authoring model.
allowed-tools: read_file ls glob grep inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin inspect_agent_ui_sources mutate_app_ui_model purge_ui_plugin ask_user_question
---

# AppUIModel Composition Manual

Use this Skill for low-level Composition changes, not for the Host-owned
`insert_plugin_default` fast path. The semantic operation already carries the
complete desired insertion and the Host deterministically resolves its
authoring-default placement.
AppUIModel owns which Plugin instances exist, whether they are enabled, their
placement, child Slot topology, and the Layout tree that contains visual
regions. Product content, presentation copy, Runtime configuration, and Plugin
behavior belong to application/source or Runtime layers.

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

- Composition owns AppUIModel plugin presence, enabled state, identity,
  placement, child Slot topology, Layout, Panels, Rows, Columns, Stacks, Slots,
  and Slot occupants.
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
- A Plugin node contains only persistent `id`, `pluginId`, `enabled`, and
  optional child `slots` keyed by local Slot name.
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
- A child Slot with `mode: "renderer"` accepts one Plugin that renders the
  current runtime entity through local scoped context. Change its occupant in
  AppUIModel to change presentation. An empty Renderer Slot renders nothing;
  disabling or removing its occupant does not reveal an implicit host or
  assistant-ui fallback. Omitted `mode` remains ordinary content; do not place
  a `requiresRenderScope` Plugin in a Layout or content Slot.
- Layout Slot nodes do not gain descriptions, hints, roles, or accepts lists.

## Semantic operations

- `insert_plugin_default`: insert an existing unselected visual Plugin asset at
  its declared authoring-default placement. The operation accepts only the
  complete Plugin node; never add `anchorRef`, `slotRef`, `size`, `anchorSize`,
  Panel, Row, Column, or other Layout arguments. The Host fails closed when
  placement, anchor, Service readiness, or supported Layout preconditions are
  not uniquely resolved, then the low-level Layout escape hatch remains
  available.
- `insert_plugin`: insert one complete Plugin node into `application`, a
  `layout_slot(slotRef)`, or `plugin_slot(parentInstanceId, slot)`.
- `move_plugin`: relocate an existing Plugin subtree.
- Creator's Productized move path resolves this intent once, then lowers it to
  the Host-only `move_plugin_to` semantic operation. Relative destinations use
  an anchor instance and `before`/`after`; Plugin child Slot destinations use a
  parent instance and declared Slot name. Do not replace this with remove plus
  insert or expose Layout refs to the Resolver.
- `remove_plugin` / `remove_plugin_default`: Host internal Composition removal
  primitives. Never use them as the final user-facing Plugin removal result.
  Permanent removal uses `purge_ui_plugin`; temporary removal uses
  `set_plugin_enabled(false)`.
- `replace_plugin`: replace an instance subtree in place.
- `set_plugin_enabled`: hide or restore an existing instance.
- Layout operations use snapshot-scoped refs. All refs in a transaction are
  bound to the starting snapshot. A new node may declare a transaction-only
  `$localRef` for later operations in that same transaction.

Prefer one complete transaction. The Host parses and compiles the draft,
checks composition and child Slot integrity, regenerates the static Registry,
and commits atomically only when its gates succeed.

## Canonical patterns

### Hide or permanently delete a Plugin

- Explicit hiding or temporarily disabling: `set_plugin_enabled(false)`. Keep
  the instance, Layout, source, Source Lock and all Service Providers. Restore
  with `enabled=true`.
- Explicit permanent deletion including source: inspect the AppUIModel and
  Source inventory, then call `purge_ui_plugin(pluginId, appUIModelHash,
  sourceStateHash)`. Host computes all instances, orphan Provider cleanup,
  Source ownership and dependencies, final registry, verification and one atomic
  transaction. Never supply paths, dependencies or cleanup lists.
- Ambiguous “去掉/删除”: use `ask_user_question` to choose hiding (source kept,
  directly restorable) or permanent deletion (source deleted, later reinstall
  or recreation). Make no writes before the choice; reuse recent clarification.

### Hide or purge a child Plugin

Hide disables the child instance and preserves the parent Slot declaration.
Permanent deletion uses the Host purge tool and removes all instances of the
chosen pluginId. Clarify when the destructive outcome is uncertain.

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

### 1. Ambiguous removal of left conversation history

```text
User request: Remove the left conversation history.
Current composition: row(left panel -> thread-list, main panel -> surface).
Desired state: unclear whether source should remain for direct restoration.
Correct tool: ask_user_question with Hide and Permanently delete choices.
After Hide: set_plugin_enabled(false), keep source and Providers.
After permanent deletion: inspect both hashes and use purge_ui_plugin.
Incorrect: ordinary Composition removal as the final outcome or deleting files.
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
User request: Hide suggested questions.
Current composition: conversation-surface.emptySuggestions contains a
conversation-suggestions instance.
Desired state: the Suggestions occupant is disabled; its source remains.
Owning layer: Composition.
Semantic delta: disable the Suggestions child Plugin instance.
Correct tool: set_plugin_enabled(false).
Incorrect: delete emptySuggestions from the parent manifest or edit the parent.
```

### 4. Move an existing Plugin

```text
User request: Move the existing inspector to the right region.
Current composition: one inspector instance in another Slot; destination known.
Desired state: same persistent instance in the destination.
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
Semantic delta: insert the existing asset with final identity and placement.
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
Correct tools for an eligible authoring-default insertion:
inspect_ui_project(view=composition), then one `mutate_app_ui_model` call with
`insert_plugin_default`; the Host owns deterministic Layout lowering and
post-commit verification. Load this Skill and `ui-layout` only when the
semantic operation is unavailable or the request specifies custom placement.
Incorrect: read the manifest, inspect Services, read Plugin source/CSS, or scan
the project to preflight checks listed in hostGuarantees.
```

### 9. Remove or restore a Renderer presentation

```text
User request: I don't want to show the reasoning process.
Current composition: conversation-surface.reasoningGroup contains the selected
assistant-ui-reasoning Renderer Plugin.
Desired state: reasoning presentation absent while conversation text remains.
Owning layer: Composition.
Semantic delta: disable the reasoningGroup occupant.
Correct tool: set_plugin_enabled(assistant-ui-reasoning-main, false).
Result: reasoningGroup renders nothing; the Host does not reveal a
hidden canonical fallback or modify the assistant-ui Thread.
Incorrect: edit ConversationAdapter, edit assistant-ui Thread/grouping, create
a hidden Renderer Plugin, or modify reasoning Runtime state.

User request: Restore the reasoning process.
Semantic delta: enable the existing assistant-ui-reasoning instance.
Correct tool: insert the existing Plugin instance through Composition.
```


## Recovering an invalid AppUIModel

Healthy Composition uses `mutate_app_ui_model`. On `APP_UI_MODEL_INVALID`, enter the separate Recovery lane:

1. Call `inspect_app_ui_model_source` and read every page. Host reports raw source, exact rawHash, and syntax/schema/composition diagnostics without repair hints.
2. Use user intent, Plugin inventory and Slot contracts to reconstruct a complete legal candidate. Preserve unaffected composition as faithfully as possible; do not redesign unrelated UI.
3. Call `repair_app_ui_model(expectedRawHash, candidateModel)` only with a fresh invalid-source observation. Never use filesystem edit/write to recover app-ui.json. Never use repair when the current model is valid.
4. After success, call `inspect_ui_project(view="composition")` again. All old nodeRefs, slotRefs and Composition observations are invalid.

A hash conflict requires source refresh. A candidate admission failure allows at most one semantic replan using unchanged source. Workspace integrity blockers require stopping instead of repairing another layer. Commit failures are infrastructure failures; the Host transaction rolls back. Host shares candidate admission with ordinary mutation; Recovery does not add a replace operation to the semantic operation union.

AppUIModel health classification excludes Plugin definition/source consistency and inventory integrity. A healthy model with a broken Plugin stays in normal debugging attribution; never use model replacement to repair its owning source. Candidate commit admission still checks these workspace contracts. Compiler diagnostics preserve code, canonical path, Plugin/instance identity and local Slot.

For a hide/purge task, an invalid AppUIModel returns `APP_UI_MODEL_RECOVERY_REMOVAL_BLOCKED`. Stop that removal task and request a separate Recovery task before retrying removal. Removal authority never grants full-model replacement.

## Sidebar layout contract

A `sidebar` wraps `content` and an ordered `items` array. Each item has a unique
`id` and exactly one visual Plugin in its `child` Slot. `defaultActive` is null
or an existing item id and only initializes local runtime selection. Plugin
navigation metadata lives in its manifest (`sidebar.icon`, optional localized
`sidebar.labels`); icons and labels must not be duplicated in AppUIModel.
Runtime Layout Slot nodes continue to contain only Slot IDs, never Plugin IDs.

Use Host `insert_sidebar_item`, `remove_sidebar_item`, `reorder_sidebar_items`
and `update_layout_node_props` operations. Move existing instances into Sidebar
with `insert_sidebar_item.instanceId`; move them back with `move_plugin` to an
observed Slot. Empty Sidebar entries are removed at the end of the atomic batch,
clearing the default only when its item was removed. See `ui-layout` for exact
arguments and supported icon names. Do not persist interaction state or edit
Runtime code to fulfill application composition requests.

### Optional Sidebar Header

`sidebar.header` is an optional ordinary Layout Slot containing at most one visual
Plugin (zero is valid after removal). It needs no manifest navigation metadata.
Inspect its existing Slot ref and use `insert_plugin`, `remove_plugin`,
`replace_plugin`, `move_plugin`, or enable/disable operations just as for any
Layout Slot. `replace_layout_node` can declare an optional Header Slot, including
a transaction-local ref; there is no Header-specific install operation.

For Agent name, logo, description or branding requests, reuse `agent-identity`
and edit `plugins/agent-identity/config.ts`. Its localized defaults use the
`agentIdentity` namespace; custom brand content need not be translated. Do not
edit SidebarFrame, vendor components or create a Service to change identity.
New platform presets select history by default; Assistant presets stay collapsed.
Models without Header retain the legacy navigation rail. A Header with one
enabled navigation item uses a single column without a duplicate history icon.
