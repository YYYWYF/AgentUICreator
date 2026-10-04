# Creator Authoring Contract


Runtime-compatible, Composition-compatible, and Creator-operable are separate
decisions:

- Runtime-compatible means the Plugin can be activated by the UI Runtime.
- Composition-compatible means its Layout or child Slot contract is valid.
- Creator-operable means the Host can discover, add, and restore it
  deterministically.

The existing `manifest.authoring` fields are the Creator Authoring Contract.
Do not add `creatorReady`, a readiness score, or Plugin-specific Creator logic.
The Host derives readiness from the manifest, capabilities, and child Slot
contracts; it does not inspect React source to guess placement.

Before writing source, classify the Plugin and decide whether users should be
able to ask Creator to add or restore it:

- A visual Plugin intended for natural-language Add/Restore declares semantic
  `authoring.intents` and a deterministic `defaultPlacement`.
- A relative `before`/`after` `defaultPlacement` requires
  `recommendedSize.width`.
- A relative `above`/`below` `defaultPlacement` requires
  `recommendedSize.height`.
- Before choosing a relative placement, inspect the anchor's current Layout
  parent. `before`/`after` require an existing Row or root anchor;
  `above`/`below` require an existing Column or root anchor. An anchor inside
  a root Row cannot use `below` through `insert_plugin_default`. If no
  supported default fits the requested UI, use the low-level AppUIModel path
  after reading its Skill instead of declaring an unusable default.
- A `plugin_slot` placement points at an existing parent child Slot, matches
  one of that Slot's accepted capabilities, and matches renderer mode.
- A Plugin with `requiresRenderScope: true` uses a renderer child Slot; a
  non-renderer Plugin must not target one.
- A visual Plugin without `authoring` is intentionally `manual-only` and is
  valid. `authoring` without `defaultPlacement` is discoverable but
  `limited`, with Add/Restore unavailable.
- A Plugin with `capabilities: ["headless"]` or `manifest.application.gate` is
  not a visual placement target and does not need authoring metadata.

Read the readiness diagnostics returned by `validate_creator_changes` through
the existing `verify:ui` result. A limited warning is not automatically a
failure: if the Plugin should be Creator-operable, repair its authoring
contract; if it is intentionally manual-only, do not invent a placement.
