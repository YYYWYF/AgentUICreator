## Goal

Build an **Agent Frontend UI Plugin Creator**.

Users modify the frontend through a Creator Agent. The final app connects to **one Agent Runtime through API** and consumes **AG-UI** data.

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

- `packages/creator` is the development tool implementation, including the Python sidecar under `packages/creator/python`, CLI, optional Vite integration, UI, prompts, skills, and tool permissions. It is delivered through `@za38.03/agent-ui-creator` and its subpaths.
- Public npm packages use `@za38.03/agent-ui-*` names and independent versions. Source Registry is merged into `packages/plugins`: runtime entries, source snapshots, catalog and resource assets ship in one `@za38.03/agent-ui-plugins` package. There is no separate `packages/source-registry` workspace or npm publish target. Official UI Plugins use one unprefixed ID each; preserve exact source baselines and ownership records during source updates. Operator includes Bootstrap and Creator includes Mock Agent as subpaths, not separate packages. Neither tool may copy a second resource distribution; Node filesystem/update operations stay in development tooling.
- Official UI Plugins default to one `@za38.03/agent-ui-plugins` npm package. Each Plugin has a peer directory under `src/plugins/<id>/`, with separate `upstream/` and `adapters/`. Existing project adapters are under `adapters/project/`, presentation adaptations under `adapters/presentation/`; manifests/changelogs currently remain `plugin.json` and `CHANGELOG.json` to preserve source contracts. Optional product styles/locales/assets follow the accepted design. Shared presentation has one owner under `src/shared/`; do not copy Runtime or Context per Plugin. Build runtime entries, `dist/sources/` and `dist/catalog.json` from this single implementation; never hand-edit generated snapshots or maintain duplicate official metadata. Source Registry is this package-internal catalog/snapshot capability, not another npm package. `source-layout.json` generates ignored compatibility views under `src/internal/{vendor-generated,adapters-generated}/assistant-ui` and resource template paths; edit canonical owners, never those views. Upstream sync must persist reviewed changes/removals back to canonical owners. Node loading/history APIs belong to `@za38.03/agent-ui-operator/source-registry`, while pure catalog data belongs to Plugins. A Plugin switches to project-owned source only after explicit user agreement. Core, Renderer and canonical Runtime remain npm dependencies. See `docs/architecture/npm-default-plugin-source-ownership.md` for the accepted target and pending implementation.
- Plugins is a production npm dependency with additional tooling assets. Its browser runtime exports must not import source snapshots, catalog readers, Node fs/crypto, Operator or Creator. Operator reads the target project’s exact installed package assets through tooling-facing paths; the presence of source files in a tarball does not permit them or Node helpers to leak into the browser bundle.
- `examples/creator-host-sandbox`, `examples/creator-assistant-host`, and `examples/creator-embedded-host` are independent Host targets and must not import Creator subpaths in their production frontend.
- `apps/creator-workbench` is a development-only composition shell that connects Creator to the example target through an explicit `projectRoot`.
- Creator configuration belongs to the tool host, not the generated Agent Frontend. The workspace workbench reads `.env.creator.local` from the workspace root.
- Keep the target project usable through its own `dev`, `test`, `typecheck`, and `build` scripts without the Creator package or workbench.

## Project Reference

`docs/agent-ui-plugin-creator-launch-plan.md` is the canonical design reference for this project.

`docs/agent-ui-reference-guide.md` is the detailed decision guide for Agent UI reference selection and responsibility boundaries.

`docs/architecture/unified-update-center.md` is the accepted target for online update discovery, official compatibility manifests, cumulative/per-version release notes, user-confirmed npm upgrades and subsequent owned-source synchronization. It supersedes the earlier manual-npm-upgrade-only decision. Online discovery defaults to npm metadata through the target project's registry and credentials; no separate manifest service or URL is required. `releases/compatibility.json` is the reviewed compatibility/history owner. Each public package ships it as `agentUI.compatibility` in package.json and `dist/compatibility.json`; build/prepack synchronization checks current identities and official requirements. Never infer compatibility from latest versions alone. Operator filters partially published combinations, retains explicit stale-cache status, and verifies exact npm artifacts before user-confirmed install/lockfile recovery. Existing application layers, owned implementations and source BASE remain protected; subsequent source sync uses the installed Plugins catalog/snapshots. Workspace-wide transactions, yarn/bun execution and tool self-upgrades remain pending; interrupted unknown processes require manual review.

`docs/architecture/npm-default-plugin-source-ownership.md` is the current accepted Plugin delivery, source takeover and update boundary. It also defines the accepted Source Registry → Plugins package merge and per-Plugin upstream/adapter directory structure, superseding the separate Registry package, earlier default-source-delivery proposal and absolute vendor-install bans. The package merge/basic source layout and catalog-driven thin application/takeover/sync mechanism are implemented. Modern npm entries currently cover composer, copy-action, reload-action, feedback-actions, export-markdown-action, reasoning, tool-group, add-attachment-action, dictation-action, submit-action, response-footer, conversation-suggestions, thinking-indicator, tool-timeline, tool-fallback, transient-assistant-messages, agent-status-message, agent-plan-message, job-progress-message, generated-file-message, chart-message, source-citations-message, retrieval-chunks, web-search, conversation-thread-list, conversation-history, conversation-new and conversation-quote. The authoritative delivery recipe is packages/plugins/src/catalog/plugin-delivery.json: build entries, portable snapshots, application initialization, shared API compatibility and Creator admission derive from it or the installed catalog. Scoped renderer applications bridge the existing Host scope into component props without copying Context. Headless message applications preserve toolkit/data-message registration names and register their local renderer with Component returning null; do not drop these fields when generating a thin definition. Chart source ownership includes its CSS and type declaration. Search/retrieval components retain DOM/count/cycle props and use the unified searchTools locale namespace, including existing Host overrides. Official search/retrieval resources resolve to npm delivery, not automatic source installation. Job progress bridges existing Host state/abort through props instead of copying Runtime Context. Source ownership records the application routing/scope contract; incompatible source targets require a separate application migration, never overwrite the thin layer. Tool fallback retains approval/interrupt behavior and exposes compound parts; transient-message presentation uses the shared npm store. Regenerated compatibility bridges for relocated presentation owners must verify the reviewed upstream adaptation hash before adoption; upstream changes require review/merge of the maintained owner. Existing customized legacy source remains selected and is never automatically rewritten into a wrapper or marked as authorized takeover. Implementation-only sync uses the existing Creator Updates page and explicit validated baseline adoption. Conversation list/history application bridges read the existing Host conversation service; list theme/run and sidebar RailAction remain shared and survive takeover. New-thread actions and quote lifecycle use the canonical Runtime. Bindings and RailAction join the application contract hash without changing old entry hashes. All 43 official Plugins use one unprefixed identity through this delivery mechanism. The duplicate assistant-ui-* Plugin identities and message-footer are removed; response-footer uses assistantResponseFooter and is rendered once beneath the final assistant message of each complete response. Upstream assistant-ui source, provenance and synchronization mappings remain intact. Host-bound applications come from integrity-checked templates in the installed catalog; provider bindSetup delegates retain the generated Host service context and cleanup, never copy Runtime or Context. Shared auth service declarations are initialized only when absent under services/ and are not implementation BASE; preserve existing declarations. Provider connection/configuration and identity settings remain application-owned. Optional Lexical implementations stay behind /lexical; pass through the native input/composition props. Use packages/plugins/src/catalog/plugin-delivery.json for the current inventory. Complete public API auditing and automatic legacy layering remain separate pending work.

`docs/architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md` is the canonical Conversation Domain architecture. Where it conflicts with the older launch plan or reference guide on assistant-ui ownership, it takes precedence.

The assistant-ui source repository is available locally at
`/Users/yifei/Coding/assistant-ui`. When assistant-ui is the selected reference,
inspect the pinned revision in that local repository instead of fetching or
guessing upstream source.

Read the relevant sections before:

- creating the initial project structure;
- making architecture or technology decisions;
- changing AppUIModel, Layout Tree, UI Plugin, UI Runtime, or AG-UI boundaries;
- introducing new framework-level concepts.

Read the relevant sections of the Agent UI reference guide before:

- designing Agent interaction semantics such as HITL, approval, interruption, shared state, frontend tools, or generative UI;
- defining Message, Thread, Composer, Tool, Reasoning, Attachment, Source, or Artifact component structure;
- deciding how Agent UI states and interactions should be expressed with the generated project's selected UI stack, consulting Ant Design X only when Ant Design is applicable;
- mapping AG-UI events, streaming updates, tool calls, snapshots, deltas, errors, or run state into Frontend State and UI.

Select the reference project that matches the problem layer. Do not research, copy, or introduce all reference projects by default. Reference projects provide patterns and trade-offs; they do not override product requirements, AG-UI semantics, Plugin Contract, Project Frontend State, or this project's architecture.

For small, isolated implementation changes, consult only the applicable document and sections when the change may affect these design contracts.

Treat this `AGENTS.md` as the hard execution constraints, the launch plan as the canonical project design reference, and the Agent UI reference guide as the detailed reference-selection guide. The generated-project independence and UI-stack ownership rules in this file supersede any assumption in those references that Ant Design is mandatory; treat their Ant Design guidance as conditional guidance for generated projects that select Ant Design. For any other conflict, stop and surface it instead of guessing.

When encountering implementation problems, DeepSeek Harness may be used as a secondary reference for approaches and trade-offs. Do not copy its code wholesale. Adapt any borrowed ideas to this project's architecture, contracts, and conventions.

## Scope

Only build the Agent frontend.

Do not introduce:

- Tool / Skill / Runtime / Model plugins
- Agent backend logic
- Multi-page concepts
- Multiple Agent Runtimes

## Rules

- `AppUIModel` is the source of truth for generated layout and Plugin instance composition. Do not turn it into a component-props, renderer or upstream primitive configuration layer. Existing persisted instance fields remain compatible; this decision does not authorize a Schema migration.
- Runtime `SlotRegistry` owns the runtime relationship between slots and plugin contributions.
- Layout `SlotNode` must not contain Plugin instance ids.
- Use Layout Tree concepts such as Row, Column, Stack, Panel, and Slot.
- Prefer editing AppUIModel for layout, size, placement, and composition changes.
- For component customization, edit the project-owned thin application layer first: public props, children, component composition, renderers and public extension APIs. This is ordinary project code editing, not source takeover. npm wrappers must preserve upstream public configurable behavior and composition, with accurate types and runtime forwarding; do not require source takeover merely because our wrapper omitted a supported upstream seam.
- Reuse existing plugins when practical.
- assistant-ui is the upstream Conversation Domain implementation. Official Plugins default to npm implementations behind a project-owned thin application layer. The target Registry always resolves the local Plugin definition/application entry; that entry imports the official public component API by default and passes props in JSX. AppUIModel is for layout/semantic composition only. Try application-layer props/composition/renderers before proposing source takeover; adding this wrapper or changing its props does not require takeover consent. Before the first takeover, Creator must present a concrete per-Plugin plan and ask whether the user agrees to project-owned source. A generic customization request is not that agreement. After agreement, Operator extracts source matching the actually installed package version and switches only the application layer's implementation import to local source, preserving its existing props/composition and Plugin IDs, instance configuration and semantic Slots; package and local implementations must not both register. Existing agreement covers subsequent ordinary edits to that successfully taken-over Plugin, not other Plugins or vendor changes.
- The local application layer is project-owned from initialization, separate from the optional source-owned implementation. Its presence is not takeover authorization and must not trigger duplicate-ID protection intended for unauthorized implementation copies. This is implemented for catalog-declared package Plugins; legacy project layouts retain their source and require explicit migration.
- For source-owned Plugins, Creator still tries application-layer props/composition first, then implementation adapters. Keep vendor unmodified and locale-agnostic, retain provenance and exact BASE/LOCAL/TARGET, and never edit shared Runtime/framework code as a takeover shortcut. Upgrading the npm package must not overwrite the project application layer or local Plugin source, reset its reference or advance its source baseline. Source sync merges only the implementation-owned subtree using BASE/LOCAL/TARGET; never include application-layer files in the official source baseline, merge, deletion or snapshot regeneration. API incompatibility must be reported and any necessary application-layer adaptation handled as a separate project code change. Shared dependency compatibility still needs validation; source ownership does not freeze all runtime behavior. Only an explicitly requested source sync may adopt a newer official baseline after merge and validation; a partial feature port must not be marked as a complete version upgrade. See `docs/architecture/npm-default-plugin-source-ownership.md`; the takeover chain is available for extractable entries and implementation-only sync is available through the generic Operator dev API; Creator Updates uses this implementation-only sync for catalog-declared source-owned Plugins, supports model-assisted conflict merging, and advances BASE only after explicit validated adoption; configured read-only compatibility discovery is available; standalone npm/pnpm project installation/recovery is available through the update center; shared workspaces, other managers and tool installation remain follow-up work.
- The canonical assistant-ui Runtime integration belongs in `@za38.03/agent-ui-runtime`; UI Plugins must not create or manage their own Agent Runtime.
- Keep conversation Slots as semantic replacement boundaries; do not expose assistant-ui implementation details or visual micro-slots through AppUIModel.
- UI Plugins consume conversation state through the provided runtime/adapter context.
- Creator may modify `app-ui/*`, `plugins/*`, and frontend dependencies required by the generated project.
- Do not couple the generated project to Creator packages, build tooling, runtime services, or UI dependencies.
- Treat `runtime/*` and `framework/*` as read-only unless explicitly working on the framework.
- Inspect existing project conventions before editing.
- New user-visible or screen-reader UI copy in Agent UI Plugins must use the Agent UI locale layer. Add a namespace when the UI domain needs one; use an existing namespace instead of hard-coding its presentation copy. Protocol IDs, service IDs, capability names, slots, event names, tool names, error codes, and test identifiers are not presentation copy.
- Prefer the smallest correct change.
- Run relevant validation/typecheck after meaningful changes.
- Do not redesign unrelated architecture.

## Unified Update Center

- Provide one update entry for project Agent UI and Creator tools, while keeping all seven public packages independently versioned. Do not add a combined npm package or require matching version numbers. Compatibility release identity is distinct from npm versions, Plugin versions, catalog Schema, historical Source Release and source BASE.
- Official compatibility manifests, validated against actual package metadata and tested combinations, own recommended exact versions and dependency/peer requirements. The model explains plans; it must not guess compatible versions or bypass controlled execution with arbitrary package-manager commands. Package and Creator versions must come from actual identities, not fixed 0.0.1 / 0.1.0 constants.
- Check for updates read-only when Creator starts/selects a project/opens Updates, with bounded refresh and explicit cache/offline status. Background discovery may notify; it must not install dependencies, take over source, merge code or advance BASE. Never treat unavailable metadata as no updates.
- Show cumulative changes between current and selected target, with optional per-version detail and visible breaking/migration requirements. Default npm Plugins and source-owned Plugins must both appear. A multi-version jump normally needs one upgrade plan and confirmation, not one confirmation per patch; missing history must be disclosed.
- Bind upgrade plans to the selected project or actual tool installation, official manifest digest, exact target/current resolved versions, package.json/lockfile/workspace state and protected application/source/baseline state. Obtain user confirmation of the concrete plan before mutation; stale or changed plans require replanning and appropriate renewed confirmation. Discovery, an upgrade click or model text alone is not execution authority.
- Operator performs real package-manager installation and lockfile updates using the project's existing manager and cross-platform helpers, then verifies resolved versions and relevant project checks. Updating package.json alone is insufficient. Preserve dependency fields, non-target packages and workspace/linked/local declarations unless their changes are specifically planned; do not silently upgrade the Host React/UI Library major or install unused optional packages.
- Project upgrades cover needed Core/Renderer/Runtime/Plugins and Web Component only when used. Creator/Operator upgrades target the actual development-tool installation, never the Agent App's production dependencies. Tool updates/restart/reconnect use the owning installation Host; do not overwrite a running tool mid-request or update other projects. One UI does not imply one filesystem transaction.
- Dependency install/validation/recovery and source merge/adoption are separate stages. Capture restoration information and report partial failures honestly; restoring package.json/lockfile alone does not establish node_modules recovery. Do not claim installation rollback also reverses script/cache/external effects or overwrite unrelated edits. Existing source-file transactions are not sufficient for dependency-install recovery.
- An npm upgrade must preserve application files, local implementations, reference selection, config/AppUIModel and BASE. Check shared API compatibility first; an incompatible target requires a separate approved migration or compatible alternative, not silent code rewriting. After successful installation and identity checks, offer optional source-only sync against the project's actually installed Plugins snapshot; do not use online latest or tool dependencies as TARGET. Reuse BASE/LOCAL/TARGET merging and explicit validated adoption; npm confirmation does not authorize new source takeover, source merging or BASE adoption.
- Agent UI implementation and Creator-generated UI code are React only. Vue/HTML Hosts embed Web Component; provide embedding and Creator startup guidance, not native Vue component generation or Host business-code modification. Project customization/update targets the React producer, not a precompiled consumer bundle. Production code must remain independent of Creator, Operator and update/discovery services.
- See `docs/architecture/unified-update-center.md` for pending contracts, implementation owners, install failure/tool restart boundaries and Windows acceptance requirements. An accepted documentation decision is not proof of implementation. Old fixture repair remains outside this update work.

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

Agent UI 设计按问题类型参考以下项目：

- **CopilotKit**：Agent UX、HITL、Shared State、Frontend Tool、Generative UI 等 Agent 交互语义。
- **assistant-ui**：Conversation Domain 的上游实现，提供 Message、Thread、Composer、Tool、Reasoning 等 Runtime 与组件能力。
- **Ant Design X**：当生成项目使用 Ant Design 时，参考 Ant Design 风格下的 Agent UI 交互与视觉表达。
- **TDesign AIGC**：AG-UI Event / Streaming / Tool Call 到前端 State 和 UI 的映射实现。

参考顺序：

```text
Agent 行为      → CopilotKit
会话能力        → assistant-ui
AntD 表达       → Ant Design X（仅适用于选择 Ant Design 的项目）
AG-UI 状态映射  → TDesign AIGC
最终实现        → 生成项目选择的 UI Stack
```

除 assistant-ui Conversation Domain 外，其余参考库只用于借鉴设计和实现方式，不作为本项目 Runtime、SDK、Message Model 或基础 UI 框架。

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
> Reference Projects
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
