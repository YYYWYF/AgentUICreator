---
name: ui-plugin-development
description: Inspect or customize UI Plugins; implement a new Plugin or new behavior only after a direct user commission, satisfied conditional commission, or approval of a bound development proposal.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: takeover_plugin_source prepare_plugin_responsive_repair ask_user_question read_file ls glob grep edit_file prepare_ui_plugin_development create_ui_plugin mutate_ui_plugin_source prepare_ui_service_contract_change create_ui_service_contract mutate_ui_service_contract inspect_ui_capabilities inspect_ui_plugin_delivery inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin preflight_ui_plugin_placement inspect_ui_services inspect_ui_plugin_source_references inspect_agent_ui_sources apply_agent_ui_source_item mutate_app_ui_model validate_creator_changes
---

# UI Plugin development

This Skill applies to frontend Plugin source/application authoring. The system
prompt owns general evidence, authorization and completion rules; this Skill
adds Plugin-specific contracts, not an additional investigation checklist.
Use the smallest relevant section/reference. A resolved existing target does not
require a full capability inventory, a new UI-system decision or a nearest
consumer example before it can be modified.

## Ownership and admission

Project-owned application props, children, renderers and scoped styles are ordinary
editable code. Inspect the exact target and any concrete unknown contract; edit
within the user's request. Public npm component use does not require implementation
source, extraction or takeover. Existing source-owned Plugin edits keep the current
ownership, upstream provenance and BASE; do not repeat successful takeover consent.
Only actual npm implementation edits require `takeover_plugin_source` and its
explicit user agreement. Runtime, shared Context, vendor and generated registries
remain protected. A thin wrapper's omitted public seam is not justification for
requiring takeover.

Before first new Plugin source or new business behavior, the Host must authorize
the bounded `prepare_ui_plugin_development` plan. Direct commissions, satisfied
conditional commissions and approved proposals retain their specific semantics;
a Skill or inspection does not grant development permission. A normal existing
Plugin customization does not need a new development approval. For a genuinely new
Plugin, consult [authoring contracts](references/authoring-contracts.md) for admission,
manifest/placement, Service/data and delivery obligations. For a new visual Plugin
or actual UI-system choice also consult [UI selection](references/default-ui-composition.md).
Do not load new-Plugin investigation requirements for a local presentation repair.

## Local change evidence

Read the existing files that will change, using the actual supplied sourceRoot and
owner paths. `manifest.json` declares identity/data/capabilities; `definition.ts`
joins manifest and component; `index.tsx` owns composition/behavior; imported
stylesheets own presentation. Read a neighboring consumer only for wiring that
is actually unknown. An npm implementation need not appear in local search.

`inspect_ui_plugin` returns application ownership, public APIs and parent semantic
composition where declared. sharedModule selects the installed public module;
use the root module for presentation controls and /plugin-support for shared types.
Use returned parameterContracts; follow exact parameterQueries only when a required
signature is missing. `$element` accesses an array/index element, not React props.
An unavailable guessed symbol is not a missing capability. Preserve declared
composition slots when appending controls; replacement props can replace them.

Public types establish invocation shape, not rendered styling. Package-owned
presentationContract describes raw versus styled components, asset requirements
and Portal ownership. For a visual defect follow the current owned entry's CSS
imports and inspect the relevant cascade. Re-querying types cannot establish
centering. Public overlay composites may own their own Portal and Backdrop;
respect that composition and retain the existing AgentUIRoot theme container.
Use the public Trigger/Close/focus APIs. Local dialog state or scoped popup
positioning does not introduce a Service, Agent action, Runtime replacement or
source takeover. Verify requested placement, closing and focus in the actual Host.

## Editing constraints

Freshly read existing edit targets in the current run; old messages/handoff are
navigation, not current read evidence. `edit_file_from_read` edits a stable range;
`edit_file` handles small local changes; `mutate_ui_plugin_source` makes one atomic
Plugin-local transaction with edit/create entries. Re-read and reconcile affected
files after stale-content errors. Do not hand-edit `registry.generated.ts`, the
AppUIModel JSON or composition-revision metadata; use their Host tools.

Preserve the target's UI library, enabled capabilities, scope bridge, semantic
slots and original approval/interrupt/error renderers. New user/screen-reader copy
uses the unified domain locale namespace with en-US/zh-CN parity; never patch
vendor for localization. Read locale targets when changing them, not for every
style edit. Do not invent new per-Plugin i18n or Service abstractions.

Styles must be imported and scoped to owned classes/data attributes; no global
resets, Host ancestor selectors, Runtime/Portal changes or vendor overrides.
Own box-sizing, min-width and responsive maximum size. Flex/grid children must
shrink and long text wrap; overlays need bounded dimensions appropriate to the
actual container. Static heuristics are not visual acceptance. A request to use
`prepare_plugin_responsive_repair` follows its explicit plan/authorization contract;
that specialized operation is not a prerequisite for ordinary scoped CSS edits.

## Validation and outcome

Validate source changes at the current revision; include the build for new visual
Plugins or dependency/style integration as required. Composition changes use fresh
AppUIModel evidence and normal Host mutation/verification tools. Creation/catalog
synchronization is not mounting: newly created capabilities must be composed when
requested, and the final revision validated. Consume checks already performed by
the Host rather than duplicating them. Respect returned repair limits.

Keep static, Runtime and browser evidence distinct. Current tests/types or empty
Runtime errors do not prove popup geometry, keyboard behavior or focus. Validate
the requested interactions using available authorized browser/test evidence; report
missing infrastructure or stale evidence precisely. Do not label incomplete work
as already satisfied or reopen unrelated discovery when verification is unavailable.
