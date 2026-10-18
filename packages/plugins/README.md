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
  maintained. `resources/history/` retains test histories and is not published.

`source-layout.json` maps canonical files to their historical logical locations.
The build materializes ignored `src/internal/vendor-generated/assistant-ui` and
`src/internal/adapters-generated/assistant-ui` views to preserve upstream bytes,
relative imports, existing runtime exports and the upstream verification recipes.
Edit canonical owners, not these generated views. Upstream sync scripts capture
reviewed results back to the owners, including file removals.

## Published assets and tools

`dist/catalog.json` identifies this exact package/version and source hashes.
`dist/sources/` contains canonical Plugin/shared source snapshots.
`dist/resources/registry/` contains curated resources; A2UI remains excluded.
Source snapshots and catalog are built from the same owners as runtime output.

`@za38.03/agent-ui-plugins/catalog` exposes pure resource contracts/metadata.
Node filesystem loaders, historical providers and update orchestration are in
`@za38.03/agent-ui-operator/source-registry`. Neither source assets nor Node
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
