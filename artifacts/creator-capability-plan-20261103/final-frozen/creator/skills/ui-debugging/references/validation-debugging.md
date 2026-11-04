# Static diagnostic evidence

`validate_creator_changes(mode="delta")` uses the existing TypeScript parser,
pre-mutation baseline, differential, failureSemantics and repair state. Read
file, code, line/column and message before inspecting the nearest contract.
`diagnosticIdentities` provides canonical path, code and messageHash; positions
are evidence, not identity, so moving an error does not resolve it.

For one explicitly requested error, use
`inspect_static_diagnostics → debuggingTargetId → select_debugging_target`.
Select the returned `ts:...` string before editing; the Host binds its identity.
Reuse the binding across revisions. Selection does not establish write authority.

Delta permits unrelated unchanged errors. Completion additionally requires
bound targets to disappear, no introduced regressions, and the existing Host
checks to pass. A still-present target cannot finish merely because delta
passed. A shifted line with the same path/code/message remains unresolved.

Use `mode="clean"` only for an explicit clean-workspace request. Once selected,
the completion goal remains clean even if a later delta call passes. Existing
scope and read-only Runtime/Framework boundaries still apply.

Only repair introduced or explicitly in-scope errors. Respect
`automaticRepairAllowed=false`; report scope/integrity blockers instead of
expanding the task. Unavailable/truncated diagnostics cannot prove resolution.
Current-revision evidence is required after every mutation. Identical successful
reads return reusable evidence; errors or stale evidence can be retried.

Ordinary `validate_creator_changes` reports completion/regression evidence and
workspace warnings without activating target selection. Static discovery uses
`inspect_static_diagnostics()` and reuses the same parser, baseline and differential.
The owner may be read before or after selection; selection stays available in
Source and Composition lanes. Runtime targets expose semantic repair resources;
`DEBUGGING_OWNER_EVIDENCE_REQUIRED` calls for targeted Service/contract inspection.
