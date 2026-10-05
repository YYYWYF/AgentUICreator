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
`packages/project-control/src/project/source-registry/project-mutation.ts`.
The architecture guard rejects direct storage apply/remove references outside the
storage module, its compatibility exports, and this Host orchestrator. Low-level
unit tests may continue testing storage APIs directly.

The Host recovers pending work before inspecting state, performs storage admission
checks, and snapshots only affected Source files, the Source lock, and the four
derived registry outputs. The atomic before-state journal lives at
`<metadataRoot>/source-project-transaction.json`. New journals use schema version 2
and record a UUID `transactionId`, `ownerPid`, `createdAt`, and the before-state
snapshot. In-process calls use the project queue. Cross-process callers coordinate
through the Host journal owner: a living PID (including `EPERM` from the signal-zero
probe) returns `AGENT_UI_SOURCE_PROJECT_MUTATION_PENDING` before touching the
low-level journal, Source files, lock, or generated outputs. An active journal is
never interpreted as a crash; callers retry inspection after the owner finishes.

Only ownerless legacy v1 journals or v2 journals whose owner process no longer
exists (`ESRCH`) are crash-recovered. Recovery first restores the low-level
transaction and then the Host snapshot; it always rolls back, never resumes. If
there is no Host journal, public recovery does not touch a low-level transaction:
another process may acquire its Host journal immediately after that read. Source
apply/remove recover their storage transaction under their own acquired Host
journal, while initialization keeps its separate clean-install recovery.

ProjectControl recovers before inspection, and product installers recover before
obtaining their expectedStateHash. Journal publication remains atomic and
create-only. An `EEXIST` loser re-reads the winning journal, refuses to recover a
living owner's work, or recovers a stale journal and retries admission and snapshots
once. Old admission results are never reused. An exception in the owning mutation
may roll back its own live journal only when both its transaction ID and PID match;
this internal authority is not exposed through public recovery. If that rollback
fails, the retained journal remains protected while its owner process is alive and
can be retried by a later Host after the owner exits.

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
The shared implementation now belongs to `@agent-ui/project-control`. Hosts and
the Workbench consume its development APIs; they do not own storage or mutation
implementations. `@agent-ui/bootstrap` owns initialization transactions and receives
the Project Control adapter explicitly from the composition root.

Regression coverage lives in `source-project-mutation.test.ts` and
`source-project-mutation-architecture.test.ts`. Failure injection uses module mocks
around real registry writers and verification, with no test-only public options.
Owner regressions cover live/dead PIDs, v1 compatibility, permission failures,
create-only publication races, bounded admission retry, and real child processes:
one process holds the journal while a separate ProjectControl process refuses
inspect/apply/remove without changing its files, then recovers after owner exit.


## Source identity and content ownership

Source Registry items have stable IDs and no manually maintained item version.
The current Registry manifest and files declare the desired source. npm package
versions/ranges, upstream revisions/provenance, and UI Plugin manifest contract
versions retain their existing meaning.

Source locks own files through per-file SHA256 hashes. The reader accepts legacy
`{ version, files }` entries and ignores `version`; the serializer emits only
`{ files }`. The next legal mutation naturally rewrites the lock. Inspection
reports `owned` for any locked or Host-provided item, including customized and
partial sources. `updateAvailable` compares locked file hashes and target sets
with current Registry files; it does not grant permission to overwrite user
customization. Optional resource inspection uses `owned` for its merge.

The optimistic `stateHash` includes deterministic Registry fingerprints over
manifest metadata, sorted requirements/package entries and file targets/content
SHA256. A Registry edit invalidates an earlier inspection even for uninstalled
items. Installation and dependency synchronization continue to compare content
hashes and preserve customized source protection.

New storage transaction journals omit `targetVersion`. Recovery accepts legacy
journals carrying that field and ignores it; original bytes and lock backups
still determine rollback. Registry schema and architecture guards reject item
manifests declaring `version`, so developers only edit source and never bump an
item version.
