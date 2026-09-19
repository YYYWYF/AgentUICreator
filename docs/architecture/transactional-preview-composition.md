# Transactional Preview Composition

The Preview consumes one complete published composition snapshot. It never
compiles an AppUIModel from independently updated HMR artifacts during React
render.

```text
AppUIModel + PluginCapabilityCatalog
                 |
                 v
        Candidate Composition
     resolve -> validate -> compile
          |                 |
        valid             invalid
          |                 |
     publish N+1       keep published N
```

## Capability and active-runtime boundaries

- `PluginCapabilityCatalog` is generated from every local Plugin manifest and
  a lazy definition loader. AppUIModel selection never controls catalog
  membership.
- `PluginDefinitionLoaderRegistry` is represented by the lazy loaders in that
  catalog. Inactive implementations are not eagerly imported into the Preview
  module graph.
- `ActivePluginRegistry` exists only in a published runtime composition. It is
  resolved from the Plugin ids referenced by the candidate AppUIModel.
- `AppUIModel` remains the only persisted authoring truth. Runtime model,
  registry, slot identities, and composition catalogs remain derived.

`plugins/registry.generated.ts` is retained as a generated filename for tool
compatibility, but its contract is a stable capability catalog. Pure layout,
enablement, or instance-membership changes do not rewrite it.

## Candidate and published state

`RuntimeCompositionBuilder` is the pure candidate boundary. It parses the
AppUIModel, resolves selected definitions, verifies capability metadata and
service contracts, constructs the Active Registry and composition catalog,
and compiles the runtime model. It has no transaction, listener, diagnostic,
generation, or published-snapshot state.

`RuntimeCompositionStore` owns candidate staging, transaction gating,
generation cancellation, diagnostics, and the last-known-good
`RuntimeCompositionSnapshot`. It delegates the concrete build to
`RuntimeCompositionBuilder`; candidate failure does not replace the published
snapshot. Its only public mutation entry is `stageCandidate()`, so every input
change submits a complete candidate.

For a ProjectControl transaction that changes both model and catalog,
`app-ui/composition-revision.generated.json` is renamed first. Its
`transactionId`, target `appUIModelHash`, and target
`capabilityCatalogRevision` place the Preview in staging until both later HMR
inputs match. Manual edits without a new descriptor remain input-driven: a
self-consistent candidate publishes immediately, and an incomplete candidate
remains staged until another input changes. No timer, polling, retry count, or
page reload is part of the protocol.

## Runtime failure isolation

The Conversation Runtime and Dev Studio control plane are mounted outside
`PreviewCompositionBoundary`. Publishing or failing a composition can replace
only the Preview subtree. Each Plugin component is additionally isolated by
`PluginRuntimeBoundary`; an implementation render/lifecycle failure produces a
development error surface for that instance without taking down other Plugins
or the control plane.

Runtime diagnostics carry `compositionRevision`, `appUIModelHash`,
`capabilityCatalogRevision`, and `publishedAt`, allowing ProjectControl to
prove that observations belong to the intended published snapshot.
