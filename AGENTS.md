## Goal

Build an **Agent Frontend UI Plugin Creator**.

Users modify the frontend through a Creator Agent. The final app consumes **AG-UI** data and may host isolated Agent instances. Each Thread belongs to one logical assistant. Workflow buttons may select different URLs within the same Thread; only explicit new-conversation actions create a new threadId. Business components control assistant visibility while mounted background Threads keep running.

## Architecture

Keep responsibilities separate:

- **Creator Agent**: understands requests and edits the UI project.
- **AppUIModel**: defines generated layout, Plugin instance identity, enablement and semantic composition; component props and renderers belong in project Plugin code, not JSON.
- **UI Plugin**: implements frontend behavior.
- **UI Runtime**: owns runtime slot composition and renders deterministically.
- **AG-UI**: provides Agent messages/state.

Creator Agent is a general coding agent specialized with prompts, skills, tools, and context. Do not turn it into a fixed workflow.

Creator execution has no fixed cumulative model-call or graph-step ceiling. Keep call counts as telemetry; preserve user cancellation, per-request model timeouts, no-progress detection, permissions and explicit mutation confirmation. The pinned LangGraph factory and shared streaming runner disable the finite library default with positive infinity; removing the config key would restore a limit. Validate long progressing tasks and interrupt/resume when upgrading that dependency.

## Build and Deployment Boundary

Creator is a development-time tool only. It must not be a production runtime dependency of the generated Agent App.

The final Agent Frontend must build and deploy independently without Creator. Production capabilities such as Agent Frontend Runtime, AG-UI client, and Plugin Runtime belong to the generated project and must be built and shipped with the final application.

UI Plugin implementation dependencies also belong to the generated project, including UI libraries or styling systems such as Ant Design, MUI, or Tailwind. Creator must not prescribe a specific UI library or major version, and Plugins must not be required to share Creator's UI dependencies.

## Workspace Boundary

- Creator/Operator distribution: `packages/creator` owns the TypeScript Agent under `src/agent`, CLI/UI/process hosting under `src`, the internal Operator under `operator`, prompts/Skills and canonical contracts. Users install the single `@za38.03/agent-ui-creator` package. There is no separate Operator npm package, CPython runtime, platform package, pip bootstrap or system Python requirement. Preserve Agent/tool responsibility boundaries internally and keep all Creator code out of production frontend dependencies. See `packages/creator/docs/typescript-distribution.md`.

- Shared tooling schemas and fixtures have one canonical owner under `packages/creator/contracts`; the repository root has no separate `contracts/` directory. Creator publishes the internal Operator resources once; public project operations use only `/project` and `/project/*` npm subpaths. Do not keep Python API aliases, legacy configuration fallbacks or duplicate npm subpaths; this package has not been published.
- Public npm packages use `@za38.03/agent-ui-*` names and independent versions. The six API packages are Core, Renderer, Runtime, Plugins, Web Component and Creator; Operator is an internal module of Creator. Source Registry is merged into `packages/plugins`: runtime entries, source snapshots, catalog and resource assets ship in one `@za38.03/agent-ui-plugins` package. There is no separate `packages/source-registry` workspace or npm publish target. Official UI Plugins use one unprefixed ID each; preserve exact source baselines and ownership records during source updates. Creator publishes project operations (`/project`, `/project/*`), Bootstrap (`/bootstrap`), Source Registry Node APIs (`/source-registry`) and Mock Agent (`/mock-agent`). The single package ships its Agent, internal Operator and contract resources without requiring repository files after installation. Do not copy a second resource distribution; Node filesystem/update operations stay in development tooling.
- Official UI Plugins default to one `@za38.03/agent-ui-plugins` npm package. Each Plugin has a peer directory under `src/plugins/<id>/`, with separate `upstream/` and `adapters/`. Existing project adapters are under `adapters/project/`, presentation adaptations under `adapters/presentation/`; manifests/changelogs currently remain `plugin.json` and `CHANGELOG.json` to preserve source contracts. Optional product styles/locales/assets follow the accepted design. Shared presentation has one owner under `src/shared/`; do not copy Runtime or Context per Plugin. Build runtime entries, `dist/sources/` and `dist/catalog.json` from this single implementation; never hand-edit generated snapshots or maintain duplicate official metadata. Source Registry is this package-internal catalog/snapshot capability, not another npm package. `source-layout.json` generates ignored compatibility views under `src/internal/{vendor-generated,adapters-generated}/assistant-ui` and resource template paths; edit canonical owners, never those views. Upstream sync must persist reviewed changes/removals back to canonical owners. Node loading/history APIs belong to `@za38.03/agent-ui-creator/source-registry`, while pure catalog data belongs to Plugins. A Plugin switches to project-owned source only after explicit user agreement. Core, Renderer and canonical Runtime remain npm dependencies. See `docs/architecture/npm-default-plugin-source-ownership.md` for the accepted target and pending implementation.
- Plugins is a production npm dependency with additional tooling assets. Its browser runtime exports must not import source snapshots, catalog readers, Node fs/crypto, Operator or Creator. Operator reads the target project’s exact installed package assets through tooling-facing paths; the presence of source files in a tarball does not permit them or Node helpers to leak into the browser bundle.
- Runtime must not depend on Plugins or import official Plugin implementations/factories. Canonical Plugin contracts live in Runtime `/contracts`; shared Contexts and operation ports live in `/plugin-api`. Plugins compatibility exports must re-export those same instances. The application explicitly selects default presentation through `createDefaultAgentUIPresentation()`. Conversation management, canonical DataSource contracts, caching and history projection belong to the `conversation-service` capability Plugin; Runtime consumes only its generic `agent-ui.thread-binding` port. Generated `services/conversations/data-source.ts` directly implements list/get/delete/rename/archive/unarchive, including all HTTP or SDK requests, authentication and business response mapping. Do not restore an npm history HTTP factory, url/method/body/decode configuration layer, backend-envelope auto-detection or legacy HTTP compatibility. list returns ConversationSummary[]; get returns ConversationDetail with history. Bind endpoint/transport independently per Agent and preserve preview routing/cancellation. Project data-source methods are application-owned and excluded from Plugin implementation BASE and source sync. Preserve project API configuration and source ownership; existing applications require a separate explicit migration when this wiring changes.
- `examples/creator-host-sandbox`, `examples/creator-assistant-host`, and `examples/creator-embedded-host` are independent Host targets and must not import Creator subpaths in their production frontend.
- `apps/creator-workbench` is a development-only composition shell that connects Creator to the example target through an explicit `projectRoot`.
- Creator configuration belongs to the tool host, not the generated Agent Frontend. The workspace workbench reads `.agent-ui/creator/.env.local` from the workspace root. The path is relative to the tool configuration root (`--config-root`, default launch directory); switching target projects does not switch credentials. Preserve portable project records in `.agent-ui` and ignore local Creator/Operator data. Creator credentials remain server-only and production builds must not read this file.
- Keep the target project usable through its own `dev`, `test`, `typecheck`, and `build` scripts without the Creator package or workbench.

## Project Reference

`docs/agent-ui-plugin-creator-launch-plan.md` is the canonical design reference for this project.

`docs/architecture/unified-update-center.md` is the accepted target for online update discovery, official compatibility manifests, cumulative/per-version release notes, user-confirmed npm upgrades and subsequent owned-source synchronization. It supersedes the earlier manual-npm-upgrade-only decision. Online discovery defaults to npm metadata through the target project's registry and credentials; no separate manifest service or URL is required. `releases/compatibility.json` is the reviewed compatibility/history owner. Each public package ships it as `agentUI.compatibility` in package.json and `dist/compatibility.json`; build/prepack synchronization checks current identities and official requirements. Compatibility records provide recommendations rather than version admission controls; a newer Creator only triggers a manual-upgrade notice. Operator filters partially published discovery combinations and retains explicit stale-cache status; discovery and compatibility information are advisory. User-confirmed installation does not preflight npm artifacts or validate the installed project. Existing application layers, owned implementations and source BASE remain protected; subsequent source sync uses the installed Plugins catalog/snapshots. Installation follows the project package manager, including npm/pnpm/Yarn/Bun and workspaces; tool upgrades belong to the actual installation Host. Failed installation records are informational and do not disable further operations.

`docs/architecture/npm-default-plugin-source-ownership.md` is the current accepted Plugin delivery, source takeover and update boundary. It also defines the accepted Source Registry → Plugins package merge and per-Plugin upstream/adapter directory structure, superseding the separate Registry package, earlier default-source-delivery proposal and absolute vendor-install bans. The package merge/basic source layout and catalog-driven thin application/takeover/sync mechanism are implemented. Modern npm entries currently cover composer, copy-action, reload-action, feedback-actions, export-markdown-action, reasoning, tool-group, add-attachment-action, dictation-action, submit-action, response-footer, conversation-suggestions, thinking-indicator, tool-timeline, tool-fallback, transient-assistant-messages, agent-status-message, agent-plan-message, job-progress-message, generated-file-message, chart-message, source-citations-message, retrieval-chunks, web-search, conversation-thread-list, conversation-new, conversation-quote, locale-switch, ask-user-question, tool-result, skills and skills-selection. The authoritative delivery recipe is packages/plugins/src/catalog/plugin-delivery.json: build entries, portable snapshots, application initialization, shared API compatibility and Creator admission derive from it or the installed catalog. Scoped renderer applications bridge the existing Host scope into component props without copying Context. Headless message applications preserve toolkit/data-message registration names and register their local renderer with Component returning null; do not drop these fields when generating a thin definition. Chart source ownership includes its CSS and type declaration. Search/retrieval components retain DOM/count/cycle props and use the unified searchTools locale namespace, including existing Host overrides. Official search/retrieval resources resolve to npm delivery, not automatic source installation. Job progress bridges existing Host state/abort through props instead of copying Runtime Context. Source ownership records the application routing/scope contract; incompatible source targets require a separate application migration, never overwrite the thin layer. Tool fallback retains approval/interrupt behavior and exposes compound parts; transient-message presentation uses the shared npm store. Regenerated compatibility bridges for relocated presentation owners must verify the reviewed upstream adaptation hash before adoption; upstream changes require review/merge of the maintained owner. Existing customized legacy source remains selected and is never automatically rewritten into a wrapper or marked as authorized takeover. Implementation-only sync uses the existing Creator Updates page and explicit validated baseline adoption. Conversation list application bridges read the existing Host conversation service; list theme/run and sidebar RailAction remain shared and survive takeover. New-thread actions and quote lifecycle use the canonical Runtime. Bindings and RailAction join the application contract hash without changing old entry hashes. All 50 official Plugins use one unprefixed identity through this delivery mechanism. The duplicate assistant-ui-* Plugin identities and message-footer are removed; response-footer uses assistantResponseFooter and is rendered once beneath the final assistant message of each complete response. Upstream assistant-ui source, provenance and synchronization mappings remain intact. Host-bound applications come from integrity-checked templates in the installed catalog; provider bindSetup delegates retain the generated Host service context and cleanup, never copy Runtime or Context. Shared auth service declarations are initialized only when absent under services/ and are not implementation BASE; preserve existing declarations. Provider connection/configuration and identity settings remain application-owned. Optional Lexical implementations stay behind /lexical; pass through the native input/composition props. Use packages/plugins/src/catalog/plugin-delivery.json for the current inventory. Use exact installed public declarations for API decisions and preserve existing source layouts.

`docs/architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md` is the canonical Conversation Domain architecture. Where it conflicts with the older launch plan on assistant-ui ownership, it takes precedence.

Read the relevant sections before:

- creating the initial project structure;
- making architecture or technology decisions;
- changing AppUIModel, Layout Tree, UI Plugin, UI Runtime, or AG-UI boundaries;
- introducing new framework-level concepts.

For small, isolated implementation changes, consult only the applicable document and sections when the change may affect these design contracts.

Treat this `AGENTS.md` as the hard execution constraints and the launch plan as the canonical project design reference. The generated-project independence and UI-stack ownership rules in this file supersede any assumption in the launch plan that Ant Design is mandatory; treat its Ant Design guidance as conditional guidance for generated projects that select Ant Design. For any other conflict, stop and surface it instead of guessing.

When encountering implementation problems, DeepSeek Harness may be used as a secondary reference for approaches and trade-offs. Do not copy its code wholesale. Adapt any borrowed ideas to this project's architecture, contracts, and conventions.

## Scope

Only build the Agent frontend.

Do not introduce:

- Tool / Skill / Runtime / Model plugins
- Agent backend logic
- Multi-page concepts

Multiple frontend Agent instances reuse assistant-ui's canonical Thread/Runtime lifecycle. Do not multiplex independent Agent streams into one Thread or implement backend Agent orchestration. See `website/docs/development/multiple-agents.md` for application composition, history and preview boundaries.

## Rules

- `AppUIModel` is the source of truth for generated layout and Plugin instance composition. Do not turn it into a component-props, renderer or upstream primitive configuration layer. Existing persisted instance fields remain compatible; this decision does not authorize a Schema migration.
- Product shells (floating launcher, panel, open/close interaction, positioning, animation and responsive styles) belong to the generated project's `application/shell/`, initialized by Bootstrap and bound through `createAgentUIProject({ Shell })`. Deliver only the selected Mode's shell component and its CSS; do not generate the other shells or a runtime ModeShell router. Runtime exposes the generic `AgentUIShellProps` seam and owns conversation/Plugin lifecycles, not the product shell implementation or CSS. Closing a panel must hide it while preserving children and services. Shell edits are ordinary project application edits, not Plugin source takeover; npm upgrades must not overwrite them. Preserve existing project shells; migrate older npm shell consumers only through an explicit project migration.
- Product Mode is only an initialization selection. New project metadata stores `sourceRoot`, and generated application code statically binds the selected Shell without a product `mode`, `agentUIRuntimeConfig` or mode router. Runtime observes the actual container via the generic Shell `surfaceRef`; it must not infer container geometry or DOM parents from product Mode. Creator may resolve tool-only template provenance from the existing unique Shell source-lock item. Preserve existing project metadata and custom Shells unless an explicit migration is requested.
- Runtime `SlotRegistry` owns the runtime relationship between slots and plugin contributions.
- Layout `SlotNode` must not contain Plugin instance ids.
- Use Layout Tree concepts such as Row, Column, Stack, Panel, and Slot.
- Prefer editing AppUIModel for layout, size, placement, and composition changes.
- For component customization, edit the project-owned thin application layer first: public props, children, component composition, renderers and public extension APIs. This is ordinary project code editing, not source takeover. npm wrappers must preserve upstream public configurable behavior and composition, with accurate types and runtime forwarding; do not require source takeover merely because our wrapper omitted a supported upstream seam.
- Reuse existing plugins when practical.
- assistant-ui is the upstream Conversation Domain implementation. Official Plugins default to npm implementations behind a project-owned thin application layer. The target Registry always resolves the local Plugin definition/application entry; that entry imports the official public component API by default and passes props in JSX. AppUIModel is for layout/semantic composition only. Try application-layer props/composition/renderers before proposing source takeover; adding this wrapper or changing its props does not require takeover consent. Before the first takeover, Creator must present a concrete per-Plugin plan and ask whether the user agrees to project-owned source. A generic customization request is not that agreement. After agreement, Operator extracts source matching the actually installed package version and switches only the application layer's implementation import to local source, preserving its existing props/composition and Plugin IDs, instance configuration and semantic Slots; package and local implementations must not both register. Existing agreement covers subsequent ordinary edits to that successfully taken-over Plugin, not other Plugins or vendor changes.
- The local application layer is project-owned from initialization, separate from the optional source-owned implementation. Its presence is not takeover authorization and must not trigger duplicate-ID protection intended for unauthorized implementation copies. This is implemented for catalog-declared package Plugins; legacy project layouts retain their source and require explicit migration.
- For source-owned Plugins, Creator still tries application-layer props/composition first, then implementation adapters. Keep vendor unmodified and locale-agnostic, retain provenance and exact BASE/LOCAL/TARGET, and never edit shared Runtime/framework code as a takeover shortcut. Upgrading the npm package must not overwrite the project application layer or local Plugin source, reset its reference or advance its source baseline. Source sync merges only the implementation-owned subtree using BASE/LOCAL/TARGET; never include application-layer files in the official source baseline, merge, deletion or snapshot regeneration. API incompatibility must be reported and any necessary application-layer adaptation handled as a separate project code change. Shared dependency compatibility is advisory and the user checks runtime behavior; source ownership does not freeze it. Only an explicitly requested source sync may adopt a newer official baseline after merge and explicit user confirmation; a partial feature port must not be marked as a complete version upgrade. See `docs/architecture/npm-default-plugin-source-ownership.md`; the takeover chain is available for extractable entries and implementation-only sync is available through the generic Operator dev API; Creator Updates uses this implementation-only sync for catalog-declared source-owned Plugins, supports model-assisted conflict merging, and advances BASE only after explicit user-confirmed adoption; configured read-only compatibility discovery is available; project installation/recovery is available through the update center; installation follows the project’s package manager and workspace workflow, and the tool installation Host manages tool updates.
- The canonical assistant-ui Runtime integration belongs in `@za38.03/agent-ui-runtime`; UI Plugins must not create or manage their own Agent Runtime.
- Keep conversation Slots as semantic replacement boundaries; do not expose assistant-ui implementation details or visual micro-slots through AppUIModel.
- UI Plugins consume conversation state through the provided runtime/adapter context.
- Creator may modify `app-ui/*`, `plugins/*`, and frontend dependencies required by the generated project.
- Do not couple the generated project to Creator packages, build tooling, runtime services, or UI dependencies.
- Treat `runtime/*` and `framework/*` as read-only unless explicitly working on the framework.
- Inspect existing project conventions before editing.
- 项目自有 TypeScript 代码禁止使用 `any`，包括显式类型、隐式 `any`、`as any`、泛型参数和声明文件；使用准确类型，未知输入用 `unknown` 并收窄。仅保持原样的 vendor/upstream 第三方源码豁免，项目自有 adapters、应用层、模板、脚本和测试不豁免；不得为消除第三方 `any` 修改 vendor 源码。
- Keep the maintained example Hosts (`examples/creator-host-sandbox`, `examples/creator-assistant-host`, and `examples/creator-embedded-host`) derived from the canonical Bootstrap presets and Plugin application templates. Run exploratory Creator/customization tests in a separate project, never in these maintained examples. Change an example only for an explicitly requested example change or a reviewed template synchronization.
- New user-visible or screen-reader UI copy in Agent UI Plugins must use the Agent UI locale layer. Add a namespace when the UI domain needs one; use an existing namespace instead of hard-coding its presentation copy. Protocol IDs, service IDs, capability names, slots, event names, tool names, error codes, and test identifiers are not presentation copy.
- Prefer the smallest correct change.
- Run relevant validation/typecheck after meaningful changes.
- Do not redesign unrelated architecture.

## Unified Update Center

- Creator maintains only the latest stable release; fixes and new capabilities are not backported to old release branches. Older installations remain usable with a non-blocking manual-upgrade notice. Discover the tool target from npm latest stable metadata, never from a project's compatibility combination; project package versions remain independent.
- One update entry covers project Agent UI packages and Creator. The six public packages remain independently versioned; Operator remains internal to Creator. Production frontends do not import update/discovery tooling.
- Only the six current public identities are accepted; do not introduce historical standalone Operator migration, an umbrella production package or matching-version requirements. Compatibility release identity remains distinct from npm/Plugin versions, catalog Schema, historical Source Release and BASE.
- Package versions, minimum Creator versions, dependency/peer ranges and compatibility recommendations are informational, never admission controls. Do not refuse upgrades, initialization, Plugin enablement, source planning or ordinary Creator use solely because versions differ from recommendations. Report differences as advisories without disabling user-selected operations.
- Reuse bounded read-only npm checks through the target registry and credentials. When Creator has an update, show a non-blocking notice asking the user to upgrade manually through their original installation method. Do not install Creator, compute a project-specific Creator target or require an upgrade before continuing work. Preserve known Creator update information when unrelated source/package discovery fails.
- Keep actual release identities, reviewed history and changelogs accurate. A recommendation is distinct from the exact target the user confirms for an installation. Preserve user-selected project versions and change only explicitly selected or approved targets; do not force the project into one exact package combination.
- Derive package and Creator versions from actual identities. The model explains concrete plans rather than inventing versions or bypassing controlled execution with arbitrary package-manager commands. Show cumulative and optional per-version changes, disclose missing history and keep breaking/migration notes visible; one multi-version upgrade normally needs one plan and confirmation.
- Creator is an auxiliary tool: do not gate initialization or upgrades on workspace layout, package manager, lockfiles, overrides, patches, linked declarations, dependency location, duplicate fields or compatibility advice. Do not preflight npm artifacts, validate installation results, automatically run project typecheck/build/test, or automatically roll back on diagnostics. Let the user check the project. Retain explicit write confirmation, cancellation, project/path scope and concurrent-write protection; actual command or filesystem failures must be reported truthfully without disabling unrelated features.
- Project installation uses the existing npm/pnpm/Yarn/Bun workflow, including workspaces, without requiring an existing lockfile. Tool installation stays with its actual Host. Do not force-install packages, silently change Host React/UI Library majors, update other projects or overwrite running tool code.
- Installation/recovery and implementation-source merge/adoption remain separate. Version advisories do not trigger rollback. npm upgrades preserve application files, Shells, owned implementations, references, AppUIModel and BASE; source sync uses the project's actually installed snapshots, explicit user authorization and validated adoption.
- Missing/corrupt source snapshots or BASE, unresolved content conflicts, duplicated runtime Context instances, actual source contract changes, unknown interrupted processes and concurrent edits remain concrete operation errors. Do not disguise them as a minimum-version requirement or disable unrelated Creator use.
- Agent UI implementation and Creator-generated UI code remain React only. Vue/HTML Hosts embed Web Component; provide embedding and Creator startup guidance, not native Vue generation or Host business-code changes. Updates target the React producer, not a precompiled consumer bundle.
- See docs/architecture/unified-update-center.md for the accepted advisory-only version strategy and Windows validation boundaries.

### 发布备忘录

- 升版交付必须同时准备 `releases/compatibility.json`：使用 `scripts/prepare-compatibility-release.mjs` 按各包实际版本、依赖要求和经审阅的变更说明追加记录，保留已有历史；不能只改版本号，也不能为通过检查强行统一各包版本。
- 源码交付必须带齐兼容清单和对应 `package.json` 中的 `agentUI.compatibility`。当前环境具备构建条件时，运行 `pnpm build:package`、`pnpm check:release-metadata` 和 `pnpm check:package-integrity`，如实报告已执行的检查及未验证项；内网重新构建时生成 `dist/compatibility.json` 和构建收据。
- 实际发布由用户在内网环境执行 `pnpm publish -r --no-git-checks`。当前环境按需进行的本地模拟仓库 dry-run 只能验证发布钩子流程，不能代表内网仓库、凭据或实际发布已验证，也不作为每次源码交付的强制前提。遇到 `Review compatibility metadata before publishing` 时检查兼容记录，不要误判成 npm 仓库缺包，也不要删除或绕过发布检查。

## Windows compatibility

Windows is a required supported development and deployment platform. For every implementation change, explicitly consider Windows compatibility before editing and review the affected code for platform assumptions before finishing. A successful macOS/Linux run alone does not establish Windows compatibility.

- Keep native filesystem paths separate from logical paths used in manifests, archive entries, globs, allowlists, and comparisons. Use native `path` APIs for filesystem access; use `path.posix` or explicit separator normalization for logical paths that require `/`. Never compare an unnormalized `path.join()` result with a slash-delimited literal. In particular, public declaration cleanup must preserve `theme/theme-contract.d.ts` on Windows as well as macOS/Linux.
- Convert file URLs with `fileURLToPath()` and filesystem paths with `pathToFileURL()`. Do not use URL `.pathname` as a filesystem path or construct `file://` URLs by string concatenation; account for drive letters, spaces, Unicode, and UNC paths.
- Use the existing cross-platform process helpers, including `scripts/pnpm-process.mjs` for pnpm invocations. Pass arguments as arrays and handle Windows executable resolution (`.cmd` / `.exe`) through the appropriate helper. Do not assume Bash, POSIX shell commands, inline environment assignments, or Unix signal behavior in project scripts.
- Avoid assumptions about path case sensitivity, executable bits, symlink privileges, line endings, open-file deletion, or rename behavior. Preserve correct cleanup and process lifecycle behavior on Windows.
- For changes to paths, packaging, declaration cleanup, startup, or process handling, run focused validation that covers the Windows-specific behavior. Use `path.win32` fixtures where appropriate and verify packaged output when cleanup or allowlists change. Report which checks actually ran; if a real Windows run was unavailable, state that limitation rather than claiming Windows acceptance.

## Agent UI

本项目用于构建可消费 **AG-UI** 的 Agent 前端 UI Plugin。

UI Plugin 使用生成项目自己选择并安装的 UI Library 或样式方案。始终先检查生成项目的现有技术栈和约定，再使用其当前安装版本提供的稳定 API；Creator 不固定 Ant Design、MUI、Tailwind 或任何具体 major version。

始终保持：

```text
Agent Runtime
    ↓
AG-UI
    ↓
assistant-ui Conversation Runtime
    ↓
AgentUICreator Adapter / UI Plugin / Slot
    ↓
生成项目选择的 UI Stack
```

优先级：

```text
产品需求
> AG-UI 语义
> Plugin Contract
> Project Frontend State
> 生成项目当前 UI Library API
```

## Product localization boundary

`vendor-owned code must remain locale-agnostic and unmodified; all product localization is owned by AgentUICreator composition, adapters, plugins, and host UI.`

All new presentation copy, including errors, loading states, placeholders,
accessibility labels and default suggestions, must use the existing domain locale
namespace and have `en-US` / `zh-CN` parity. Keep common words small and put Plugin
copy in its domain namespace. Components consume the unified locale context;
pure presentation helpers receive messages. No per-Plugin language conditionals
or independent i18n hooks. Never translate protocol identifiers, schema/domain
values or persisted field names, and never branch business logic on translated
labels. Use props/composition/adapters for upstream copy and record unsupported
seams in `docs/i18n/upstream-localization-gaps.md`; do not patch vendor.

After meaningful copy changes run `pnpm check:i18n` and relevant typechecks.
`pnpm audit:ui-copy` is a semantic-review aid, not a blanket string ban. During
assistant-ui upgrades, check new upstream user-facing copy and preserve the
locale recipes/provenance. See `docs/i18n/README.md` for message ownership and
fallbacks. Visual acceptance is separate from static or unit validation.
