# Contract boundaries


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
- Before a Plugin consumes a backend Application Event, read `<sourceRoot>/agent-contract/agent-events.ts`, reuse or add the application-owned payload schema, then declare the same exact name in `manifest.data.events`. Preserve an explicitly supplied Custom Event name exactly; lowercase dot-separated naming is recommended only when the application has not already chosen a name. A manifest declaration consumes an application-owned contract; it does not register one.
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
- For a hard capability dependency, import its stable Service seam from `<sourceRoot>/services/*` and declare `inject` on `UIPluginDefinition`; do not import concrete Provider Plugin source.
- Provider implementations must be exposed only through `setup({ services })` + `services.provide(...)`, and the same Service Name must be declared in `provides`.
- Optional dependency behavior must declare `optionalInject`, call `usePluginService(...)`, and tolerate `undefined` with a complete fallback.
- `setup({ services }).get(X)` requires X to appear in `inject` or `optionalInject`. A component `usePluginService(X)` may also read a Service declared by its own definition in `provides`; Application-owned lookup remains unrestricted.
- `provides`, `inject`, and `optionalInject` are pairwise disjoint.
- When multiple Plugins share a capability, reuse an existing seam name/type from `<sourceRoot>/services/*` and never invent a synonym service contract.
- Prefer `UIPluginObservableService` only when other Plugins need sustained observation of service-owned state.
- `UIPluginObservableService` requires `getSnapshot()` + `subscribe()`; otherwise prefer a structural interface with explicit methods.
- Structural interface service examples are acceptable, and `EventEmitter`-style ad-hoc emitters should remain project-local, not runtime API additions.
- Do not place capability implementations into Plugin actions or Agent Runtime actions.
- A Frontend Tool is an Agent-facing adapter for a selected capability operation; it is not a Plugin capability and is not registered by a Plugin.
- When the product explicitly asks the Agent to invoke frontend behavior, first reuse an existing stable Service seam, have the Provider Plugin declare `provides`, and expose the selected operation from `<sourceRoot>/agent-contract/agent-tools.ts`. If no suitable seam exists, use the authorized Service ownership flow; never use `create_ui_plugin` or generic writes for `/services`.
- Frontend Tool names use `lower_snake_case`, inputs use `z.strictObject(...)`, descriptions explain when to call the Tool plus what it does and does not do, and results stay short, structured, and serializable.
- Frontend Tool handlers call `services.get(...)` and must tolerate a capability disappearing before execution. Never bind a Tool to a React component, ref, DOM query, Plugin instance, or concrete Provider implementation.
- Do not automatically expose every Service method. A Service may have zero, one, or many explicitly authorized Frontend Tools.
- Never generate `context.tools.register(...)`, `services.registerTool(...)`, `plugin.registerTool(...)`, or another Plugin self-registration API. Frontend Tool exposure is an Application permission boundary.
- Provider implementation lifetime is the Plugin activation lifetime; consumers should always read through runtime services instead of direct imports.
- Do not couple a generated Plugin to Creator packages or Creator UI dependencies.
- Do not modify `/runtime` or `/framework` for Plugin-specific behavior.
- Do not rewrite unrelated registration entries.
- Hiding, removing an instance, and replacing a feature all preserve Plugin source. Do not delete a Plugin directory with generic file tools. Permanent source deletion may only use the dedicated gated domain tool after exact authorization and reference checks; if that tool is unavailable, report the gate instead of approximating it.
