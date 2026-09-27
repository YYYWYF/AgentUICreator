# Source Registry storage and Host project mutation

Source capability existence and AppUIModel composition are separate decisions.
Installing or deleting Source items never inserts, enables, disables, or removes
AppUIModel Plugin instances.

```text
Mock Studio / Creator ProjectControl / Demo installer / future CLI
  ↓
Host Source Project Mutation (apply / remove)
  ↓
Source Registry storage transaction (files + source-lock.json)
  ↓
Plugin / Frontend Tool / Frontend Tool UI / Conversation Integration registries
  ↓
Source closure integrity + verifyUIProject
  ↓
Commit, or restore the previous project-owned files
```

`applyAgentUISourceItem`, `removeAgentUISourceItems`, and
`commitAgentUISourceTransaction` remain storage-layer APIs. They own Source files,
lock versions, dependency closure, optimistic state hashes, and existing ownership
protections. They have no knowledge of derived registries or AppUIModel.
Initialization retains its separate clean-install transaction.

Product callers use `applyAgentUISourceProjectMutation` or
`removeAgentUISourceProjectMutation` from
`examples/agent-frontend/scripts/ui-project/source-registry/project-mutation.ts`.
The architecture guard rejects direct storage apply/remove references outside the
storage module, its compatibility exports, and this Host orchestrator. Low-level
unit tests may continue testing storage APIs directly.

The Host recovers pending work before inspecting state, performs storage admission
checks, and snapshots only affected Source files, the Source lock, and the four
derived registry outputs. The atomic before-state journal lives at
`<metadataRoot>/source-project-transaction.json`. An existing journal is recovered
by first recovering the low-level transaction, then restoring the Host snapshot;
recovery always rolls back, never guesses how to finish a partially completed
operation. ProjectControl recovers before inspection, and product installers
recover before obtaining their expectedStateHash. In-process Host calls share a
project queue to avoid recovering an operation that is still running.

Every mutation refreshes every derived registry, including when the storage apply
returns `changed: false`. Source closure must be managed or customized, without
dependency issues or incompatible package requirements. `verifyUIProject` must
pass; warnings alone do not reject a mutation. Failures restore exact file bytes
and remove files created by the failed operation. Empty affected Source directories
are pruned so removed Plugins do not remain as invalid empty assets. If rollback
fails, `AGENT_UI_SOURCE_PROJECT_ROLLBACK_FAILED` reports the original cause,
rollback cause, and retained journal path.

Remove admission maps the actual disappearing Source files to inspected Plugin
asset directories and all AppUIModel instances, including disabled instances.
`AGENT_UI_SOURCE_COMPOSITION_IN_USE` reports item, Plugin, and instance IDs before
any writes. Storage dependency-consumer protection remains authoritative. A Source
removal does not implicitly remove dependencies or edit composition.

Results expose stable, deduplicated `sourceChangedPaths`, `generatedChangedPaths`,
and their union `changedPaths`, plus changed item IDs and the final Source
`stateHash`. Python Activity already captures unanticipated changed paths with its
existing fallback; it need not know registry orchestration. No Python remove tool
or protocol-schema changes are introduced.

Legacy optional resources pass their existing `resourcePaths().config` unchanged,
including provided foundations, `sourceRoot: "."`, and scenario-resource metadata.
The ProjectControl legacy config split and extraction into a formal Host package
remain separate work.

Regression coverage lives in `source-project-mutation.test.ts` and
`source-project-mutation-architecture.test.ts`. Failure injection uses module mocks
around real registry writers and verification, with no test-only public options.
