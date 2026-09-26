---
name: ui-plugin-development
description: Use to inspect, create, or modify UI Plugin manifests, definitions, React components, styles, contexts, and registration when existing Plugins cannot provide the requested frontend behavior.
compatibility: Agent UI Plugin Creator Phase 8 permits writes under project plugins and AppUIModel composition.
allowed-tools: read_file ls glob grep edit_file create_ui_plugin mutate_ui_plugin_source prepare_ui_service_contract_change create_ui_service_contract mutate_ui_service_contract inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin inspect_ui_services inspect_ui_plugin_source_references inspect_agent_ui_sources apply_agent_ui_source_item mutate_app_ui_model validate_creator_changes inspect_runtime_errors
---

# UI Plugin Development

Inspect project conventions before deciding that Plugin source must change:

- `/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `/plugins/*/definition.ts` joins a validated manifest to a React component.
- `/plugins/*/index.tsx` implements the component.
- `/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- `/plugins/registry.generated.ts` is the generated capability catalog: manifest metadata plus lazy definition loaders for available Plugins. AppUIModel selection resolves the published Active Registry at runtime; never edit this file or `/plugins/index.ts` by hand.
- `/framework/contracts/ui-plugin.ts` is the Plugin Contract.
- `/agent-contract/agent-events.ts` is the application-owned registry for backend Application Event names and payload schemas.
- `/agent-contract/agent-tools.ts` is the application-owned allowlist for capability operations exposed to the Agent.
- `/services/*` contains stable project-owned Service seams when multiple Plugins share one capability. Treat these seams as read-only unless the host explicitly authorizes capability-contract work.

## Reuse decision

1. List and inspect existing Plugins.
2. If one already supplies the requested behavior, reuse its `manifest.id` in an AppUIPluginNode and change only AppUIModel.
3. If behavior is missing, create the smallest Plugin that follows the project's existing directory and registration conventions.
4. For an ordinary Plugin, insert its node into a Layout Slot or parent plugin's local Slot through AppUIModel. For an existing nested extension point, inspect its exact contract and occupy it without adding a Layout node.
5. When the user requires login, License, organization selection, onboarding, or initialization before the Workspace can be used, prefer a first-class `manifest.application.gate` Plugin in `applicationPlugins`; it is an Application lifecycle surface, not visual Slot composition.

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
                 -> validate, then Runtime verify
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
- `mutate_ui_plugin_source` is one atomic, Plugin-local `edit`/`create` transaction. Never use it to delete, rename, move, cross into another Plugin, or overwrite a newly appeared file. If it reports a stale path, reread only that path, reconcile it, and resubmit the complete mutation.
- A prior run, project snapshot, `inspect_ui_plugin` result, or remembered source is not a current file observation for generic edit tools.
- If an edit reports `stale-version`, read the file again and reconcile the concurrent content; do not retry the old replacement unchanged.
- A new path is created without overwriting a file that appeared concurrently.
- Source creation and edits are recorded in the Creator transaction receipt for Host-level undo. Never use Git checkout, reset, or stash to overwrite the user's working tree.

## Creating a Plugin

1. Classify the Plugin, decide whether it should be Creator-operable, and define its Runtime, Composition, and optional Creator Authoring contracts.
2. Read `/framework/contracts/ui-plugin.ts` and one closest existing Plugin end to end.
3. Create `/plugins/<plugin-id>/manifest.json` with a unique id, useful description, version, capabilities when applicable, accurate `data.messages`, `data.state`, or `data.events` declarations, and the authoring contract when Add/Restore is intended.
4. Create `index.tsx` with a named React component. Accept `UIPluginComponentProps` only when it needs `renderSlot`; read Agent and instance data through Runtime Context hooks and narrow unknown state safely.
5. Create `definition.ts` that validates the manifest and exports a `UIPluginDefinition`.
6. Add styles using the generated project's existing styling approach; do not introduce a UI library or dependency without project support.
7. Default-export the definition so the target-owned generator can include it in the static Registry. Do not spread a template catalog into the production registry.
8. Submit `pluginId` and all currently known new Plugin files together in one `create_ui_plugin` call, using `relativePath` values inside that Plugin directory. It requires `manifest.json`, `definition.ts`, and `index.tsx`, is create-only, and transactionally rolls back the whole call on failure. Never use it to replace an existing Plugin directory or file.
9. Run `validate_creator_changes`. Fix returned diagnostics with `read_file` plus `edit_file`, then validate the new revision again.
10. Add exactly one AppUIPluginNode through `mutate_app_ui_model`; target an ordinary Plugin at the intended authoring Slot, or target an Application Gate at application scope. That transaction updates the generated Registry in both cases.
11. Because composition changes the Activity revision, run `validate_creator_changes` again for the final revision.
12. Call `inspect_runtime_errors`. Fresh current-hash evidence with zero current errors is required before claiming Runtime success.

## Development completion loop

Use the following loop autonomously when Plugin code is required:

```text
Reuse
-> Modify/Create source
-> Static Validation
-> Composition
-> Static Validation for the final revision
-> Runtime Verification
-> Repair when needed
-> Completion
```

- A static validation failure is normal development evidence, not a Tool failure. Read its bounded diagnostics, repair the relevant source, and validate the new revision.
- A current Runtime error requires source inspection, repair, another current-revision static validation, and fresh Runtime verification.
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
Frontend Tool execution and replay contract and the workspace reference
`docs/architecture/frontend-tool-lifecycle.md`.
