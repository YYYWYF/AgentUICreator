# Agent UI Plugins

One npm package provides the runtime components/official Composer, the source
catalog and matching source assets. No standalone Source Registry package is
required. Existing runtime exports remain available.

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

This merge does **not** implement the future user-authorized source-takeover UI
or make every existing source plugin a packaged runtime plugin. Those remain
separate work under the accepted architecture. Existing resource installation,
legacy versions and BASE/LOCAL/TARGET updates remain supported.

## Source takeover

`dist/catalog.json` declares `takeover` only for complete, validated portable
closures for the 43 official Plugins. Operator resolves
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
