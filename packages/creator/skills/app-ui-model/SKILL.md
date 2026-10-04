---
name: app-ui-model
description: Load for low-level AppUIModel composition changes, including custom add, remove, hide, move, resize, placement, Layout, or nested Plugin Slot changes. The Host-owned insert_plugin_default semantic fast path does not require this Skill.
---

# AppUIModel Composition Manual

Use this Skill for low-level Composition changes, not for the Host-owned
`insert_plugin_default` fast path. The semantic operation already carries the
complete desired insertion and the Host deterministically resolves its
authoring-default placement.
Resolve `sourceRoot` from the Host before reading project files. All paths in
this guide are relative to that root; filesystem tools need a leading `/` plus
the actual project-relative `sourceRoot`. Never pass a placeholder literally.
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
- Plugin Behavior owns `<sourceRoot>/plugins/**` rendering, interaction, and child Slot
  declarations.
- Runtime Capability owns Services, Runtime stores, shared state, and Runtime
  actions.
- Agent Integration owns AG-UI, Frontend Tools, Application Events, and Agent
  contracts.
- A failure in Composition does not authorize Plugin, Runtime, or Agent
  Integration edits.
- Repair only defects introduced by this run or necessarily included in the
  user's requested final state. Report unrelated workspace-integrity blockers.

Treat `<sourceRoot>/app-ui/app-ui.json` as the editable authoring source of truth. Runtime
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
- `remove_plugin`: remove an instance subtree while preserving Plugin source.
  When removing a Plugin that owns an entire visible Layout region and the user
  wants that region gone, prefer `reflow: "collapse-empty-region"`. Use the
  ordinary operation (or `reflow: "preserve"`) for an existing/shared Slot.
  Do not manually update Row/Column sizes when deterministic reflow expresses
  the requested result.
- `replace_plugin`: replace an instance subtree in place.
- `set_plugin_enabled`: hide or restore an existing instance.
- Layout operations use snapshot-scoped refs. All refs in a transaction are
  bound to the starting snapshot. A new node may declare a transaction-only
  `$localRef` for later operations in that same transaction.

Prefer one complete transaction. The Host parses and compiles the draft,
checks composition and child Slot integrity, regenerates the static Registry,
and commits atomically only when its gates succeed.

For a nontrivial add, move, replace or nested Slot operation, inspect the operation patterns. Read [canonical-patterns.md](references/canonical-patterns.md) when this task needs those details.

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

For an unfamiliar low-level operation shape, use the small operation examples. Read [operation-examples.md](references/operation-examples.md) when this task needs those details.

