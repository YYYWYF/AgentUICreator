---
name: ui-plugin-development
description: Inspect or customize UI Plugins; implement a new Plugin or new behavior only after a direct user commission, satisfied conditional commission, or approval of a bound development proposal.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: read_file ls glob grep edit_file prepare_ui_plugin_development create_ui_plugin mutate_ui_plugin_source prepare_ui_service_contract_change create_ui_service_contract mutate_ui_service_contract inspect_ui_capabilities inspect_ui_plugin_delivery inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin preflight_ui_plugin_placement inspect_ui_services inspect_ui_plugin_source_references inspect_agent_ui_sources apply_agent_ui_source_item mutate_app_ui_model validate_creator_changes
---

# UI Plugin Development

The decision semantics are in `docs/creator-plugin-development-decision-contract.md`.
Reading this Skill never grants development permission. Before first new Plugin
source or new business behavior, `prepare_ui_plugin_development` must return a
Host-authorized plan bound to this user task. Legitimate entry sources are a
direct development commission, a conditional commission after complete discovery
proves the gap, or approval of the exact pending proposal. Ordinary clarification
and a prior task's grant cannot authorize development. A normal existing Plugin
customization does not need a new development approval.

Inspect project conventions before deciding that Plugin source must change:

- `/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `/plugins/*/definition.ts` joins a validated manifest to a React component.
- `/plugins/*/index.tsx` implements the component or adapts an existing project component.
- `/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- If creating `styles.css`, import it from Plugin source (usually `index.tsx`); an unimported stylesheet is absent from the Host even when TypeScript and CSS syntax checks pass.
- Scope every Plugin CSS selector under a stable Plugin-owned class or `data-ui-plugin` root. Never use bare element selectors, `html`, `body`, `:root`, `*`, global resets, CSS imports, or Host DOM ancestors. Inherit theme tokens from AgentUIRoot.
- Reuse the selected Host UI system's public overlay API and reachable Provider/theme. When using AgentUI primitives, use its public Tooltip/Popover/Dialog facades. Do not import internal Portal primitives or build a separate body-level Portal; check the selected public overlay API's container, focus and theme behavior.
- `/plugins/registry.generated.ts` is the generated capability catalog: manifest metadata plus lazy definition loaders for available Plugins. AppUIModel selection resolves the published Active Registry at runtime; never edit this file or `/plugins/index.ts` by hand.
- `/framework/contracts/ui-plugin.ts` is the Plugin Contract.
- `/agent-contract/agent-events.ts` is the application-owned registry for backend Application Event names and payload schemas.
- `/agent-contract/agent-tools.ts` is the application-owned allowlist for capability operations exposed to the Agent.
- `/services/*` contains stable project-owned Service seams when multiple Plugins share one capability. Treat these seams as read-only unless the host explicitly authorizes capability-contract work.

## Reuse decision

For third-party controls already imported and rendered by the Host page, that
page is real public-API usage evidence. Do not require another Plugin to import
the same library, or search node_modules, before choosing it. Confirm unfamiliar
props with target typecheck. A reference Plugin supplies definition/locale wiring,
not an additional UI-selection prerequisite. For an ordinary local form, do not
walk ConversationSurface, Thread or Runtime internals to rediscover its UI stack;
inspect the Host mount entry only if there is a concrete Provider boundary issue.

The nearest Plugin is evidence for registration, locale and service conventions;
it does not override the actual Host page's choice of basic controls. Being inside
the Agent surface alone is not a reason to replace the Host UI system with AgentUI
primitives. A Host Provider wrapping AgentMount remains reachable in the React
tree unless inspection establishes a concrete bridge or isolation boundary. Check
that boundary rather than assuming it. Bind componentBasisRefs to UI selection
sources (page, used exports, Provider and theme); locale files being edited for
this new Plugin are authoring inputs, not component-selection evidence.

For a new visual Plugin, read the actual target page, relevant component exports,
Provider/theme and nearest reference Plugin first. Choose controls from actual page
usage, then the established Host system, then public primitives. Installed packages
alone do not decide. Once these facts are sufficient, prepare the plan; do not
traverse unrelated Conversation Tool/Thread/Runtime implementations for a local form.
Continue reading only to resolve a concrete API, layout, authority or type problem.
For new panel/semantic-slot plans, componentBasisRefs must contain inspected real
paths only; reuseEvidenceRefs records existing Plugin/Source Item reuse conclusions.
State selected controls/imports, Provider/theme and rejected alternatives in uiScope.
Keep actual imports consistent with the plan. If prepare rejects missing evidence,
read its error and resubmit with inspected paths; no automatic path substitution.

1. List and inspect existing Plugins.
2. If a Plugin already supplies the requested behavior, reuse its `manifest.id` in an AppUIPluginNode and change only AppUIModel as needed. Stop source discovery when no source change is required.
3. If no installed Plugin matches, inspect relevant installable Source Items. Installation through `apply_agent_ui_source_item` is reuse, not new development. A failed install or incomplete inventory is not permission to handwrite a substitute.
4. Otherwise, locate and inspect matching UI components elsewhere in project source, especially when the user says the UI already exists. An absent Plugin does not mean the UI is absent.
5. If a reusable component exists and the user commissioned adaptation, adopt it through the smallest Plugin adapter. If a normal request has a material gap, prepare the development decision before authoring.
6. If no reusable implementation exists, create a Plugin only after direct, satisfied conditional, or approved proposal authorization.
7. For an ordinary Plugin without an eligible authoring default, insert its node into a Layout Slot or parent plugin's local Slot through AppUIModel. For a new relative default placement, use `insert_plugin_default` after preflight. For an existing nested extension point, inspect its exact contract and occupy it without adding a Layout node.
8. When the user requires login, License, organization selection, onboarding, or initialization before the Workspace can be used, prefer a first-class `manifest.application.gate` Plugin in `applicationPlugins`; it is an Application lifecycle surface, not visual Slot composition.


The generated Runtime Registry contains selected/resolved Plugins only. A newly
created, unmounted Plugin can be available in fresh Composition capability facts
while absent from registry.generated.ts. After source validation/synchronization
passes and fresh Composition confirms its manifest identity, compose it through
mutate_app_ui_model; that transaction generates its selected Registry entry. Do
not wait for an unselected import, hand-edit Registry, or explore Runtime code to
force registration. Validate the mounted revision and require real registered /
composed evidence at final delivery; synchronization alone is not registration.

After `create_ui_plugin`, run static validation to synchronize the generated
Plugin registry. Then call `inspect_ui_project(view="composition")` again before
`mutate_app_ui_model`: the earlier observation is stale even if the AppUIModel
file itself did not change. Compose the new Plugin and validate that final
revision. A static check before composition does not prove that the Plugin is
mounted. Keep this sequence within the existing model-call budget by batching
independent reads and using short exact anchors for locale `edit_file` calls.

If the user asks Creator to hide or restore a whole panel while keeping its
source, change AppUIModel composition so the Layout track reflows. Hiding a
Plugin's inner content with local React state leaves its Panel track occupied;
do not describe that as freeing chat space. A Plugin-local disclosure control
is appropriate only when retaining its allocated panel width is intended.

Before implementation, inspect `references/default-ui-composition.md` for the
project's Host UI evidence, AI selection priorities, explicit dependency approval,
React-only Ant Design 5 fallback and post-generation checks. Follow that policy
for every new visual Plugin; record the component/theme source evidence in the
existing development plan. Use actual exported APIs,
not guessed Button, Checkbox, Dialog, or overlay names. If the user did not
specify a component, use the project's mature default controls and tokens; do
not make an unstyled native form or placeholder panel the product result.
For a new `panel` or `semantic-slot`, `componentBasisRefs` must include a real
Host page, component implementation or UI entry point; package.json alone is
insufficient. In `uiScope`, name the selected UI system, expected component
imports, source evidence, Provider/theme/style convention and why other discovered
systems were not selected. List actual reused components in
`deliveryContract.reusedComponents`. If none fit, record inspected page and
dependency evidence and explain the existing-primitives or approved-dependency
choice. `@agent-ui/react` familiarity never outranks the Host's adopted Design
System. The Host checks facts and freshness; Creator owns semantic selection.
Once one closest Plugin, the used public control, and the relevant locale/theme
conventions are known, stop exploratory reads and implement. Inspect another
component or contract section only for a concrete API or ownership question;
do not search unrelated Conversation Tool UIs or Thread views to compare styles.
For a requested list with named items, make each named value one item. Do not
turn those values into group headings and invent extra tasks unless the user
explicitly requested groups or subtasks.
Do not inspect `node_modules` with Creator filesystem tools. Use a target Plugin
already importing the public control, then check new imports with typecheck.
New Plugin presentation text, including titles, controls, empty states, aria
labels, and static item labels, must use the Agent UI locale layer. Add typed
keys and both locale dictionaries with `edit_file` before creating the Plugin.
Keep them in the canonical `agent-ui/i18n` directory; Plugin-local locale files
or ambient type declarations do not register a namespace. Never
claim a completed Plugin while its rendered copy is hard-coded in TSX.

   For a project-owned Composer view, use `useConversationComposer()` from
   `@agent-ui/react` in that adapter. It exposes the active Thread's draft,
   attachments, running/disabled state, and send/cancel/add/remove actions;
   it does not create another Runtime. Connect only capabilities already enabled
   in the project. A component's attachment callback can open a local file input
   and pass selected files to `addAttachment`; honor `attachmentsEnabled` and
   `attachmentAccept`. Keep the component implementation unchanged.
   The public hook returns `text: string`,
   `attachments: readonly { id: string; name: string }[]`,
   `attachmentAccept: string`, `attachmentsEnabled: boolean`,
   `isRunning: boolean`, `disabled: boolean`, `canSend: boolean`,
   `canCancel: boolean`, `setText(text): void`, `send(): void`,
   `cancel(): void`, `addAttachment(file: File): Promise<void>`, and
   `removeAttachment(id: string): Promise<void>`. Check `canSend` and
   `canCancel` before dispatch. This contract is exported at the package root;
   project filesystem tools cannot inspect `node_modules`. Replace the
   existing occupant of the semantic `composer` child Slot so that only one
   active input remains.
   Map every relevant callback exposed by the reused component, including
   attachment removal; a visible control with an undefined callback is not
   preserved behavior. The current canonical Composer's attachment picker
   permits multiple files: keep `multiple` on a replacement file input and
   pass every selected file to `addAttachment`. Show the add control only when
   `attachmentsEnabled` is true. Match the prior Composer's send conditions.
   If the component disables its own
   Send control for empty text but the active Composer can send attachments
   alone, render the public `ConversationComposerSend` only for that case;
   never insert placeholder text into the draft to force the component button.
   If that control adds a label, use the Agent UI conversation locale namespace
   and declare `AGENT_UI_LOCALE_SERVICE` in the Plugin definition.
   Static validation cannot establish these interaction claims.

## Existing component adoption

When the user identifies an existing UI, Component, or Widget, or project inspection finds a close match, locate and read its source and direct dependencies before choosing an import path or writing Plugin source. Inspect the closest Plugin convention, then choose the smallest ownership change. Do not reimplement an existing UI merely to satisfy the Plugin directory convention.

- Prefer a thin Plugin adapter that imports and composes the existing project-owned component. Do not copy its JSX, styles, state, or business logic into `/plugins/<plugin-id>/index.tsx` just to make that file exist.
- Keep Agent Runtime, Plugin Context, Agent data, service, event, and action adaptation in the Plugin layer. Pass derived data and callbacks into a reusable component through its existing interface where practical. A shared product component must not import Plugin Runtime internals solely for adoption.
- Move implementation into the Plugin only when it is Agent UI-specific with no other consumers, the user requests a self-contained Plugin, project ownership conventions require it, or a thin wrapper would create a reverse cross-layer dependency. The required `index.tsx` file alone is not a reason to migrate source.
- Preserve the component's UI, interaction, state model, and styling. Add only integration required by the request. Do not use Plugin adoption as a reason to refactor, restyle, replace the UI library, rename behavior, or implement backend capabilities. If an existing Install button is mock, keep it mock unless the user asks for installation behavior. Do not invent a Service, AG-UI event, Frontend Tool, or persistence layer for it.
- Use the same manifest authoring, placement, size, and child Slot contracts as any other Plugin. Component reuse is a Creator development choice, not a new Runtime or manifest field.

For this branch: inspect the project and component source, inspect the closest Plugin, decide ownership, create the thin adapter, run `validate_creator_changes`, compose through AppUIModel, and validate the final revision. In `static_and_runtime` mode, also call `inspect_runtime_errors` after source changes; in `static_only` mode, do not call Runtime verification tools. Existing UI does not waive current-revision static validation.

## Creator Authoring Contract

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

## Service dependency and ownership decision

When a Plugin needs another capability, call `inspect_ui_services` instead of
guessing a Provider from Plugin names or source proximity.

```text
Plugin needs capability X
-> inspect_ui_services
-> existing Service?
   -> yes: classify core requirement as inject, enhancement as optionalInject
   -> no: is a cross-boundary shared Service actually necessary?
      -> no: keep the behavior private to the Plugin
      -> yes: resolve the natural Owner, exact Consumers and dependency modes
              -> prepare_ui_service_contract_change
              -> confirmation-required: ask the User and stop project writes
              -> authorized: create_ui_service_contract
                 -> wire Provider and Consumers
                 -> validate, then Runtime verify only in static_and_runtime mode
```

- `inject` is only for a capability without which the Plugin's core behavior cannot work.
- `optionalInject` is for an enhancement with a complete fallback when the Service is unavailable.
- A missing optional Service is not permission to create it. Omit the dependency unless the user explicitly authorizes a new shared capability.
- A new Plugin does not declare `provides` merely because another Plugin might use its behavior later.
- If the User explicitly identifies the Service Owner and Consumer, pass an exact substring of the current User message as authorization evidence and do not repeat confirmation. Never fabricate or paraphrase evidence.
- To change an existing Service Contract, inspect all `contractPaths`, Providers and Consumers, require one canonical path, read that file, authorize the exact impact, then use `mutate_ui_service_contract` exact edits and update affected Plugins.
- Generic `edit_file` and Plugin tools never write `/services/**`; only authorized Service Contract tools may do so.
- A public Service is justified only across a real boundary: multiple Plugins, another Plugin caller, Application Shell, or a Frontend Tool/Agent adapter. Private state and helpers stay inside the Plugin.

## Safe source editing

- Read every existing Plugin source file in the current run before editing it with `edit_file`.
- For an existing Plugin, inspect it, identify the exact source files, and read all existing targets in one bounded read-only batch when their paths are already known.
- Use `edit_file` for one small localized existing-file change. Use `mutate_ui_plugin_source` when one resolved change spans multiple Plugin files or combines existing-file edits with new Plugin-local files.
- Every `mutate_ui_plugin_source.changes` entry needs `type: "edit"` with `relativePath` and `edits: [{oldText, newText}]`, or `type: "create"` with `relativePath` and `content`.
- `mutate_ui_plugin_source` is one atomic, Plugin-local `edit`/`create` transaction. Never use it to delete, rename, move, cross into another Plugin, or overwrite a newly appeared file. If it reports a stale path, reread only that path, reconcile it, and resubmit the complete mutation.
- A prior run, project snapshot, `inspect_ui_plugin` result, or remembered source is not a current file observation for generic edit tools.
- If an edit reports `stale-version`, read the file again and reconcile the concurrent content; do not retry the old replacement unchanged.
- A new path is created without overwriting a file that appeared concurrently.
- Source creation and edits are recorded in the Creator transaction receipt for Host-level undo. Never use Git checkout, reset, or stash to overwrite the user's working tree.

## Creating a Plugin

1. Classify the Plugin, decide whether it should be Creator-operable, and define its Runtime, Composition, and optional Creator Authoring contracts.
2. Read the relevant declarations in `/framework/contracts/ui-plugin.ts` and one
   closest existing Plugin end to end. A self-contained local-state Plugin does
   not need every unrelated Runtime and child-Slot declaration in that contract.
3. For a new visible Plugin, draft its manifest and call `preflight_ui_plugin_placement` with the current AppUIModel hash, capability catalog revision, and intended instance id before writing source. Use its canonical `defaultPlacement` only if it matches the user's location and lifecycle. A rejection requires a same-semantics repair or a user decision; do not switch to application scope, another side, or a conditional Slot as fallback. Preflight does not verify source, Services, or narrow Runtime geometry, and the final mutation checks again. Once eligible, proceed to locale edits and the atomic `create_ui_plugin` call; further source searches need a specific unresolved API.
4. Create `/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, accurate `data.messages`, `data.state`, or `data.events` declarations, and the authoring contract when Add/Restore is intended.
   `data.messages`, `data.state`, and `data.messageUI` are booleans for AG-UI subscriptions; `data.events` is an array of event names. Local React `useState` is private Plugin state and does not belong in `manifest.data`.
5. Create `index.tsx` with a named React component. When an existing project component implements the requested UI, this may be a thin adapter importing it; do not recreate that UI for Plugin self-containment. Accept `UIPluginComponentProps` only when it needs `renderSlot`; read Agent and instance data through Runtime Context hooks in the adapter and narrow unknown state safely.
6. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
   Import the component with `from "./index"` when it lives in the required `index.tsx`. Do not also create `index.ts` as a barrel: TypeScript resolves `./index` to that file first and can make the component import circular. Do not add a `.tsx` extension to the import; the Host TypeScript configuration does not enable that syntax.
   Declare every service a built-in hook consumes. `useAgentUILocale` needs `AGENT_UI_LOCALE_SERVICE`; `useAgentUITheme` needs `AGENT_UI_THEME_SERVICE`, each in `inject` or `optionalInject` as appropriate. Theme CSS tokens alone do not need the theme hook.
7. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
   Import a Plugin stylesheet once. For ordinary action buttons, use the
   project's inspected public Button facade when one exists.
8. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
9. Submit `pluginId` and all currently known new Plugin files together in one `create_ui_plugin` call, using `relativePath` values inside that Plugin directory. It requires `manifest.json`, `definition.ts`, and `index.tsx`, is create-only, and transactionally rolls back the whole call on failure. Never use it to replace an existing Plugin directory or file.
10. Run `validate_creator_changes`. Fix returned diagnostics with `read_file` plus `edit_file`, then validate the new revision again.
11. Add exactly one AppUIPluginNode through `mutate_app_ui_model`. When an
    eligible relative `defaultPlacement` declares the intended side panel,
    use `insert_plugin_default` so the Host places it beside the anchor in the
    public Layout and preserves the Platform drawer track. Do not insert it into
    the conversation's existing Slot or nest a Row inside its Panel. Use a
    low-level Layout operation only for a different authorized location after
    checking its root track and responsive contract. An Application Gate goes
    at application scope. The transaction updates the generated Registry.
12. Because composition changes the Activity revision, run `validate_creator_changes` again for the final revision.
13. In `static_and_runtime` mode, call `inspect_runtime_errors`. Fresh current-hash evidence with zero current errors is required before claiming Runtime success. In `static_only` mode, stop after current-revision static validation and do not claim Runtime success.

## Development completion loop

Use the following loop autonomously when Plugin code is required:

```text
Reuse
-> Modify/Create source
-> Static Validation
-> Composition
-> Static Validation for the final revision
-> Runtime Verification (static_and_runtime only)
-> Repair when needed
-> Completion
```

- A static validation failure is normal development evidence, not a Tool failure. Read its bounded diagnostics, repair the relevant source, and validate the new revision.
- In `static_and_runtime` mode, a current Runtime error requires source inspection, repair, another current-revision static validation, and fresh Runtime verification.
- Runtime evidence received before the latest source mutation is stale even when the AppUIModel hash did not change.
- Stop after two unsuccessful automatic repair rounds and report passed checks plus remaining diagnostics.
- When Runtime is unavailable in a headless or CLI session, state exactly that static validation passed but no Runtime verification evidence is available. Never claim Runtime success without fresh evidence.

## Contract boundaries

### Application Gate contract

Use `manifest.application.gate` when entry to the Workspace must be denied until a condition is ready. Do not model this requirement as a modal, overlay, root/main Slot contribution, dedicated Login Slot, or high-z-index element, and do not change the Layout Tree merely to host it.

- The Gate manifest names one observable Service and may assign a numeric priority. Do not also add an `app-gate` capability; `application.gate` is the single source of truth and is distinct from `headless`.
- The definition declares the Gate Service in `provides`, and `setup()` synchronously provides it with an initial `checking`, `blocked`, `ready`, or `error` snapshot. Async session recovery begins only after the observable Service is available.
- A Gate plugin node is `enabled: true` in `applicationPlugins`. A Gate manifest must not declare child Slots.
- Gate hard dependencies use `inject`. Every Provider in that dependency closure must be an application-scoped `headless` Plugin or another Application Gate. `optionalInject` never expands the startup dependency closure.
- The Gate component may read its own provided Gate Service with `usePluginService()`. This self-read permission applies to Components only; `setup({ services }).get()` still reads only `inject` and `optionalInject` dependencies.
- Multiple Gates all must become `ready`. Priority selects which non-ready Gate surface is currently displayed; it does not weaken the all-ready rule.
- Gate state is frontend Application lifecycle state. Never add AG-UI custom events or modify Agent protocol semantics to control it.

For requests such as “不登录不能进入应用”, “打开应用必须先登录”, “没有 License 不能使用”, “必须先选择组织”, or “初始化完成前不能进入工作台”, inspect existing Gate/Auth assets and Services first, then create or reuse an Application Gate without introducing a Login Slot or Layout overlay.

### Child Slot contract

When adding, removing, or renaming a child `renderSlot(...)` outlet in a container Plugin, update `manifest.json` `slots.children` in the same task. Each local Slot name maps to a required `description`, `cardinality: "one" | "many"`, and optional `optional` flag. Names must be static string literals; do not create dynamic `renderSlot(slot)` outlets or global Runtime slot ids. Host verification treats the Plugin source and manifest child Slot sets as an exact contract.

For a runtime entity renderer, declare `mode: "renderer"`, `cardinality: "one"`, and `accepts.anyOfCapabilities`, then call `renderScopedSlot("localName", scope)`. Renderer Slots have no presentation fallback: an empty, disabled, unavailable, inactive, or capability-mismatched occupant renders nothing. Omitted `mode` means ordinary content. The renderer Plugin reads `usePluginRenderScope()` and checks its `kind`; a Plugin that requires scope declares `requiresRenderScope: true` and returns `null` without the expected scope. Prefer changing the renderer Plugin instance in AppUIModel when changing Reasoning, Tool Group, or Tool Fallback presentation. Keep assistant-ui grouping, part order, named Tool UI selection, and message lifecycle in the canonical Thread.

- Read Agent data through the domain hooks exported by `/runtime/context`: `useAgentConversation`, `useAgentMessages`, `useAgentState`, `useAgentRun`, `useAgentExecutions`, and `useAgentInterrupts`. Use `useAgentRuntimeSnapshot` only when the component genuinely needs the complete snapshot.
- Read the current instance scope through `usePluginInstance`, `usePluginActions`, and `usePluginEvents`. Never recreate a combined context prop or pass Runtime snapshot fields through component props.
- Before a Plugin consumes a backend Application Event, read `/agent-contract/agent-events.ts`, reuse or add the application-owned payload schema, then declare the same exact name in `manifest.data.events`. Preserve an explicitly supplied Custom Event name exactly; lowercase dot-separated naming is recommended only when the application has not already chosen a name. A manifest declaration consumes an application-owned contract; it does not register one.
- Prefer the project-local `subscribeAppEvent` helper so the registered payload type is inferred; `usePluginEvents().subscribe` and `setup({ events })` remain the underlying scoped APIs. Never import AG-UI protocol event types into Plugin code, invent a schema inside a Plugin, emit an Application Event from the frontend, or use this channel for persistent state, standard lifecycle, Activity, interrupts, Frontend Tools, or local Plugin communication. If the backend payload contract is unknown, ask for it instead of inventing fields.
- Use `usePluginActions()` for instance-scoped Agent commands; `useAgentRuntimeActions()` is available when only Agent commands are needed. Keep runtime-only UI state in a named service or runtime store rather than mutating AppUIModel composition. Never create a separate Agent Runtime inside a Plugin.
- Keep Plugin dependencies in the generated project and follow its current UI stack and versions.
- Service contracts are stable project-owned capability seams, not concrete
  Provider Plugins or Runtime Core actions:
  - `provides` means this Plugin owns and declares one or more capabilities for the current activation lifecycle.
  - `inject` means this Plugin requires a hard capability dependency before activation.
  - `optionalInject` means this Plugin can use an enhancement but remains complete and active without it.
  - `usePluginService()` is runtime capability lookup for component access; `setup({ services })` remains the non-React activation API.
- Provider rules are strict: if `setup` calls `services.provide`, the Plugin **must** declare the same Service Name in `UIPluginDefinition.provides`.
- For a hard capability dependency, import its stable Service seam from `/services/*` and declare `inject` on `UIPluginDefinition`; do not import concrete Provider Plugin source.
- Provider implementations must be exposed only through `setup({ services })` + `services.provide(...)`, and the same Service Name must be declared in `provides`.
- Optional dependency behavior must declare `optionalInject`, call `usePluginService(...)`, and tolerate `undefined` with a complete fallback.
- `setup({ services }).get(X)` requires X to appear in `inject` or `optionalInject`. A component `usePluginService(X)` may also read a Service declared by its own definition in `provides`; Application-owned lookup remains unrestricted.
- `provides`, `inject`, and `optionalInject` are pairwise disjoint.
- When multiple Plugins share a capability, reuse an existing seam name/type from `/services/*` and never invent a synonym service contract.
- Prefer `UIPluginObservableService` only when other Plugins need sustained observation of service-owned state.
- `UIPluginObservableService` requires `getSnapshot()` + `subscribe()`; otherwise prefer a structural interface with explicit methods.
- Structural interface service examples are acceptable, and `EventEmitter`-style ad-hoc emitters should remain project-local, not runtime API additions.
- Do not place capability implementations into Plugin actions or Agent Runtime actions.
- A Frontend Tool is an Agent-facing adapter for a selected capability operation; it is not a Plugin capability and is not registered by a Plugin.
- When the product explicitly asks the Agent to invoke frontend behavior, first reuse an existing stable Service seam, have the Provider Plugin declare `provides`, and expose the selected operation from `/agent-contract/agent-tools.ts`. If no suitable seam exists, use the authorized Service ownership flow; never use `create_ui_plugin` or generic writes for `/services`.
- Frontend Tool names use `lower_snake_case`, inputs use `z.strictObject(...)`, descriptions explain when to call the Tool plus what it does and does not do, and results stay short, structured, and serializable.
- Frontend Tool handlers call `services.get(...)` and must tolerate a capability disappearing before execution. Never bind a Tool to a React component, ref, DOM query, Plugin instance, or concrete Provider implementation.
- Do not automatically expose every Service method. A Service may have zero, one, or many explicitly authorized Frontend Tools.
- Never generate `context.tools.register(...)`, `services.registerTool(...)`, `plugin.registerTool(...)`, or another Plugin self-registration API. Frontend Tool exposure is an Application permission boundary.
- Provider implementation lifetime is the Plugin activation lifetime; consumers should always read through runtime services instead of direct imports.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/runtime` or `/framework` for Plugin-specific behavior.
- Do not rewrite unrelated registration entries.
- Hiding, removing an instance, and replacing a feature all preserve Plugin source. Do not delete a Plugin directory with generic file tools. Permanent source deletion may only use the dedicated gated domain tool after exact authorization and reference checks; if that tool is unavailable, report the gate instead of approximating it.

## Frontend Tool capability consumers

A Plugin capability consumed by an application-owned Frontend Tool is a valid
cross-boundary reason for a public Service seam: Plugin provides Service,
Frontend Tool consumes Service. Follow existing Service ownership and authorization
rules; Service existence does not grant Agent exposure permission.

Plugin Component effects manage UI/component lifecycle only. They must never
simulate Frontend Tool execution by opening a dialog, navigating or mutating a
capability when a Tool renderer mounts. Follow the `ag-ui-frontend` skill's
Frontend Tool execution and replay contract. For integration details, read the
packaged [Frontend Tool lifecycle reference](../ag-ui-frontend/references/frontend-tool-lifecycle.md).


## Delivery obligations

Start broad capability discovery with `inspect_ui_capabilities`. It is a live,
paged navigation index over the existing ProjectControl catalog, formal Sources,
and project component paths. Complete every page before treating an inventory
as complete; filenames alone never prove component behavior. Inspect the selected
implementation and use an existing Plugin or formal Source whenever it fits.

Before implementation, provide `deliveryContract` to
`prepare_ui_plugin_development`: `capability`, `renderingCategory`, `placement`,
`lifecycle`, `dependencies`, `reusedComponents`, `verificationMethod`, and
`interactions`. `renderingCategory` is `panel`, `semantic-slot`, or `application`.
`verificationMethod` is `runtime` or `browser-test`. Bind placement to actual
current authoring choices. For requested dimensions/positions, include `geometry`
entries with `instanceId`, `property` (`x`, `y`, `width`, `height`), `expected`, and
`tolerance` in pixels. Do not change the Runtime manifest schema for this plan.

Creation, registration, enabled composition, static validation, Runtime observation,
and behavioral validation are separate facts. The Host completion gate derives
delivery from those facts at the current revision. `static_only` cannot establish
Runtime or interaction success. Missing placement or verification leaves a blocked
receipt naming saved changes and the last successful stage.

For declared interactions, the Host tool `verify_ui_plugin_behavior` runs the
project's installed Playwright configuration. Test titles must exactly match
`[delivery:<pluginId>] <interaction>`; use `runtime` when the browser-test method has
no interaction list. Every required test must pass without skips or flaky retries.
Reuse existing test infrastructure and respect the writable project boundary;
if tests/configuration cannot be supplied within that boundary, report the blocker.
Do not replace an absent browser test with a model-written PASS claim. Composer
adapters require send, stop, attachment add/remove/attachment-only send, and draft
parity for the capabilities already enabled in the target project.

## Localization ownership

Vendor-owned code must remain locale-agnostic and unmodified; all product
localization is owned by AgentUICreator composition, adapters, plugins, and Host
UI. New user-visible copy must use the existing `useAgentUILocale` namespace and
complete `en-US` / `zh-CN` dictionaries. Do not create per-Plugin i18n hooks or
language conditionals. Preserve protocol IDs, enums, schema and persisted fields;
locale is a view concern. Prefer public props/composition, then owned adapters.
If upstream lacks a seam, record a localization gap instead of modifying vendor.
Include `pnpm check:i18n` where available and check new copy during upgrades.

## Non-React Hosts

For Vue, HTML and legacy Hosts, discover/install the `web-component-bridge` compatibility resource through the existing resource protocol. React remains the canonical Plugin implementation. Never generate Vue Plugins, assistant-ui Vue components or a second AG-UI client. Edit the generated project's AppUIModel and React Plugins, then rebuild its compatibility bundle with `vite build --config <sourceRoot>/integrations/web-component-bridge/vite.config.ts`. The consumer loads the compiled bundle and uses `<agent-ui>`; it does not configure React, JSX, Tailwind or TSX. The build configuration belongs to the Agent UI producer project, not the Vue consumer.


For Host integration requests, consume `plan_agent_ui_integration` before editing.
A how-to guide presents the Host's canonical `edits.after` without writes. Resolve
an explicit target and compiled module; for automatic integration present the
same recipe, obtain authorization, then use `apply_agent_ui_integration`. Check
manual or automatic changes with `verify_agent_ui_integration` and the original
recipe. Never generate Vue-specific snippets, infer Host versions/entries in the
prompt, or install the React producer build closure into the Vue consumer. React
uses its canonical Source Item path; Nuxt is unsupported. See
`docs/architecture/host-integration-recipe.md` for the Host contract.

## Official package ownership (Composer pilot)

Official plugins are dependency-owned; custom plugins are project-owned.
For `official_plugin_reference`, read reference with `inspect_ui_plugin`, inspect
configuration and public semantic Slots first. Use `@agent-ui/react` public Composer
components/controller for custom implementations; do not copy private or whole
official implementation. Create with `create_custom_plugin` under a new ID and
replace the intended instance in AppUIModel. Host validates the manifest, generates
the selected registry and runs project checks before committing. Never edit
`node_modules` or shadow `assistant-ui-composer` with project source.

To port a new official feature, read current custom source and latest Source
Registry reference, then implement the behavior using public contracts. Report
missing public extension contracts instead of bypassing them through private copies.
Modified legacy official source must be preserved until its behavior has been
ported to a new project-owned ID. Only an unchanged installed baseline may migrate
automatically. Other official plugins retain legacy delivery in this phase.
