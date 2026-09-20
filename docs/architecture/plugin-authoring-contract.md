# Plugin Authoring Contract

The Plugin manifest describes three different capabilities:

```text
Runtime-compatible
    the Plugin can be activated by the UI Runtime

Composition-compatible
    the Plugin can be placed in the Layout Tree or a declared child Slot

Creator-operable
    the Host can discover, add, and restore the Plugin deterministically
```

These concepts are related, but they are not interchangeable. Runtime and
composition validation remain part of the existing Host validation pipeline.
This document defines the additional Creator Authoring Readiness contract.

## Scope

The existing `UIPluginManifest.authoring` fields are the contract. This phase
does not add a `creatorReady` flag, a readiness score, or another manifest
schema. The Host derives readiness from the manifest, capabilities, and child
Slot declarations. It never reads React source to infer placement.

The contract is optional. A Plugin without `authoring` is still a valid Runtime
Plugin and may be configured manually in `app-ui/app-ui.json`; it simply makes
no promise that Creator can discover or automatically add and restore it.

## Plugin categories

| Plugin category | Creator Authoring Contract |
| --- | --- |
| Visual leaf | Declare `authoring.intents`; declare `defaultPlacement` when Creator Add/Restore is intended. |
| Container | The visual leaf rules plus a complete `slots.children` contract for each rendered child Slot. |
| Renderer | Declare `requiresRenderScope`, the renderer capability, and a canonical `plugin_slot` placement targeting a renderer Slot when Creator operation is intended. |
| Headless / Application Gate | No visual placement is required. Use the existing Service or Application contract. |

`capabilities: ["headless"]` and `manifest.application.gate` identify
non-visual authoring scope. These Plugins receive
`status: "not-applicable"` and do not produce a missing-placement warning.

## Authoring fields

### `intents`

Intents describe why a user wants the Plugin. They are semantic discovery
phrases, for example:

```json
[
  "show the reasoning process",
  "browse conversation history",
  "switch between light and dark themes"
]
```

They are not operation instructions such as `insert plugin`, `add component`,
or `mount this plugin`.

### `visualRole`

`visualRole` describes the Plugin's product role and helps Creator distinguish
similar capabilities, for example `conversation navigation` or
`assistant reasoning presentation`.

### `defaultPlacement`

`defaultPlacement` is the canonical placement used by Creator Add/Restore. It
is not a suggestion. When it is present and valid, the Host may promise a
deterministic placement.

For a relative placement, the anchor Plugin must exist and be unique. The
recommended dimension must match the relation axis:

```text
before / after  -> recommendedSize.width
above / below   -> recommendedSize.height
```

Missing axis sizing is a non-blocking portability warning because insertion
may still work in some valid Layout topologies.

For a `plugin_slot` placement, the parent Plugin and child Slot must exist and
be unique. The Slot's accepted capability must match the child Plugin's
capabilities. A scoped renderer must target a `mode: "renderer"` Slot, and a
non-renderer Plugin must not target one.

### `recommendedSize`

`recommendedSize` supplies deterministic geometry when a relative placement
needs to create or extend a Layout region. A `plugin_slot` placement does not
need a recommended size.

## Readiness states

The Host reports one readiness record per discovered Plugin:

```ts
interface PluginCreatorReadiness {
  pluginId: string;
  status: "ready" | "limited" | "manual-only" | "not-applicable";
  discoverable: boolean;
  addRestore: "ready" | "unavailable" | "not-applicable";
  reasons: string[];
}
```

The rules are:

| Contract | Status | Add/Restore | Diagnostics |
| --- | --- | --- | --- |
| Headless or Application Gate | `not-applicable` | `not-applicable` | None |
| Visual, no `authoring` | `manual-only` | `unavailable` | None |
| `authoring` without `defaultPlacement` | `limited` | `unavailable` | `CREATOR_ADD_RESTORE_UNAVAILABLE` warning |
| Valid authoring and placement | `ready` | `ready` | None |
| Placement with non-portable relative sizing | `limited` | `unavailable` | `CREATOR_DEFAULT_PLACEMENT_SIZE_NOT_PORTABLE` warning |
| Declared placement with an invalid target, capability, or renderer mode | `limited` | `unavailable` | Blocking `CREATOR_DEFAULT_PLACEMENT_*` error |

`manual-only` is intentional and is not a warning. A warning means that the
Plugin declared authoring intent but did not provide enough information for a
deterministic Creator operation. A declared but false placement is a blocking
contract error.

## Validation boundary

`pnpm verify:ui` is the single Host entry point. It reports readiness records
alongside existing Registry, child Slot, Service, and Composition checks:

```text
invalid declared contract -> errors -> verify:ui failed
limited Creator operation -> warnings -> verify:ui passed
```

`validate_creator_changes` already runs `pnpm verify:ui` and `pnpm typecheck`,
so no readiness-specific Creator Tool is needed. Readiness is not added to the
ProjectControl inspection protocol in this phase; the Creator completion loop
gets the diagnostics through the existing validation result.

When a newly created visual Plugin receives a warning, Creator decides whether
that Plugin was intended to be Creator-operable. If yes, it repairs the
authoring contract. If the Plugin is intentionally manual-only, it keeps the
minimal contract and does not invent a default placement.
