# Agent UI Plugins

One npm package provides the runtime components/official Composer, the source
catalog and matching source assets. No standalone Source Registry package is
required. Existing runtime exports remain available.

## Plugin authoring API

Import `UIPluginDefinition`, `UIPluginComponentProps`, `parseUIPluginManifest`,
`usePluginActions`, `usePluginEvents`, `usePluginInstance`, `usePluginService`,
`usePluginServiceSnapshot`, `usePluginRenderScope` and `useApplicationLifecycle`
from `@za38.03/agent-ui-plugins`. The matching Providers and Contexts are owned
by this package; generated project modules forward to these same instances.
Agent snapshot hooks and `AgentRuntimeProvider` belong to
`@za38.03/agent-ui-runtime`.

Node tools can import the types and manifest parser from
`@za38.03/agent-ui-plugins/contracts` without loading React components. Extend
`UIPluginServiceMap` by augmenting this contracts subpath. Runtime `/ui` owns
service activation, SlotRegistry, AppUIModel validation and compilation. The
project owns its AppUIModel, Plugin applications and business service bindings.
Existing projects need an explicit Context/import migration; updating the npm
package alone does not rewrite project files or source baselines.

## Production bundles and styles

Generated projects import each official Plugin through its own npm subpath.
The generated registry keeps metadata for every persisted instance, but emits
implementation imports only for Plugin types with an enabled instance.
Disabled entries keep a callable metadata-only loader so existing project
Runtimes can still validate them. It cannot activate a disabled implementation;
re-enabling regenerates the real import. No project Runtime files need to be
overwritten for this compatibility path. After
changing enablement, regenerate the registry before building. Enabling one
instance retains the implementation shared by all instances of that Plugin.

New project templates import `@za38.03/agent-ui-plugins/styles-base.css` for
shared themes and foundations. Plugin entries import precompiled utility CSS:
one common module and private Plugin utilities. Disabling the last instance
removes that Plugin entry and its private styles from the production graph;
shared styles and project-authored CSS can remain. Generated semantic Slots use
`ConversationThreadBase`, which has no built-in response footer; the existing
`ConversationThread` facade keeps its default footer and actions. Source-owned implementations
continue to use the project's local Tailwind scan. Optional Lexical styling
follows the `/lexical` entry, including source-owned integrations.

The existing `styles.css` entry remains the complete stylesheet for direct
facade consumers and existing projects. Updating this package does not replace
an existing project's stylesheet or framework files. Project customizations
remain project-owned.

Run `node scripts/verify-plugin-demand-build.mjs` from the repository root after
building Plugins to compare complete Vite production builds in disposable Host
copies. This checks typechecking, disabled implementation removal, production
tooling isolation, and raw/gzip CSS sizes without editing maintained Hosts.

## Source ownership

- `src/plugins/<id>/upstream/`: plugin-specific original upstream presentation.
- `src/plugins/<id>/adapters/presentation/`: product presentation adaptations.
- `src/plugins/<id>/adapters/project/`: existing generated-project adapters.
- `src/plugins/<id>/plugin.json` and `CHANGELOG.json`: current authoritative
  manifest and version history, retaining the existing resource schema.
- `src/shared/`: upstream helpers, common presentation adapters and provenance
  that have a single shared owner.
- `resources/registry/`: foundation/integration/demo descriptors and non-plugin
  sources. Plugin source/changelog views here are generated, not independently
  maintained. No release history exists before the first publication; upgrade
  tests generate temporary synthetic releases instead of retaining release archives.

`source-layout.json` maps canonical files to their historical logical locations.
The build materializes ignored `src/internal/vendor-generated/assistant-ui` and
`src/internal/adapters-generated/assistant-ui` views to preserve upstream bytes,
relative imports, existing runtime exports and the upstream verification recipes.
Plugin resource files are resolved from their canonical owners in workspace
mode and copied into `dist/resources/registry/` only for package delivery. Test
and typecheck commands temporarily materialize the old resource paths, then
remove them. Edit canonical owners, not generated views. Upstream sync scripts
capture reviewed results back to the owners, including file removals.
Preparation and test cleanup also remove generated `files/` and `changelog.json`
from obsolete `items/plugin-<id>/` directories, including retired Plugins, and
remove those directories when empty. Other files and directory links are preserved.
Source layout mappings reject this obsolete namespace.

## Published assets and tools

`dist/catalog.json` identifies this exact package/version and source hashes.
`dist/sources/` contains canonical Plugin/shared source snapshots.
`dist/resources/registry/` contains curated resources; A2UI remains excluded.
Source snapshots and catalog are built from the same owners as runtime output.

`@za38.03/agent-ui-plugins/catalog` exposes pure resource contracts/metadata.
Node filesystem loaders, historical providers and update orchestration are in
`@za38.03/agent-ui-creator/source-registry`. Neither source assets nor Node
loaders enter the browser runtime entry. `verify:sources` checks that published
snapshots still match the canonical source and package identity.

The catalog supports project-owned applications, user-confirmed source takeover
and implementation-only BASE/LOCAL/TARGET synchronization for all 46 official
Plugins. Automatic layering of existing customized source and a complete audit
of every upstream public API remain separate work. npm upgrades preserve the
application layer, local implementation and source baseline.

## Source takeover

`dist/catalog.json` declares `takeover` only for complete, validated portable
closures for the 46 official Plugins. Operator resolves
these assets from the target project's installed package, never its own copy.
Creator asks for consent through its human-input interrupt before internal apply.
The local presentation includes Composer/queue/textarea code; shared contexts,
runtime primitives and shared attachment/tooltip presentation use the opt-in
`/composer-support` API (compatibility version 1). Never copy those contexts.
Project-owned manifests and source remain authoritative after npm upgrades.
See `docs/architecture/npm-default-plugin-source-ownership.md` in the repository.

Official Plugins use one unprefixed identity. `response-footer` is the only response footer Plugin: its `assistantResponseFooter` Slot renders once at the tail of each complete response. Upstream assistant-ui provenance and sync mappings are separate from Plugin IDs.

### TypeScript authoring and editor navigation

Canonical `src/plugins` / `src/shared` files are checked in place, including pristine upstream files and portable project templates. Their preserved logical imports use an authoring overlay generated from `source-layout.json`, the existing resource manifests and `plugin-delivery.json`. Run `pnpm prepare:types` after changing those mappings; workspace installation also prepares it automatically. The ignored `.typecheck/` tree contains checked re-exports of the actual canonical modules, exact JSON values and derived service-map augmentations, rather than permissive module stubs. Original implementations remain the only source owners.

The package's default TypeScript configuration, Workbench and test configurations use the same `rootDirs` context. Test directories have local `tsconfig.json` entries so editors select the proper test project. Runtime fixture views may still be materialized temporarily for Vitest; removing them does not remove editor type resolution. Production compilation explicitly uses the real `src` tree and never imports or ships the authoring overlay.

The repository solution `tsconfig.json` lists package and example projects. VS Code uses the installed `typescript-ui-audit` SDK for its stable language service; the package CLI retains TypeScript 7. `pnpm test:types` checks real language-service diagnostics and verifies that invalid property types and missing exports remain errors. It also covers Windows module specifiers and preparation invalidation. No upstream source changes, broad `any` declarations or diagnostic suppression are needed.

## Local release checks

Prepare versions and authored release notes locally, including the reviewed
`releases/compatibility.json`, then build the package. From the workspace root:

```sh
pnpm --filter @za38.03/agent-ui-plugins release:verify
pnpm --filter @za38.03/agent-ui-plugins release:record
```

`release:verify` is read-only; `release:prepare` is an alias for the same check.
Neither bumps versions nor writes changelogs. `release:record` explicitly saves
an immutable preparation record in `releases/plugins-history.json` after the
same checks pass. Commit this file along with the versions and changelogs.
An empty tracked history represents the initial release; missing history is an
error. Later checks automatically compare against these local records, without
environment variables, downloaded packages, or a publish hook.

Rechecking the same recorded contents succeeds; changing a recorded release
requires restoring those contents or advancing its release version. Failed npm
publication does not invalidate the preparation record: retry the same contents.
Preparation records do not claim publication success and do not replace complete
historical source archives needed for source synchronization. Other packages'
existing publishing hooks and the existing build/prepack metadata synchronization
remain unchanged. Run local checks again if files change before publication.
