# Static diagnostic evidence

`validate_creator_changes(mode="delta")` uses the existing TypeScript parser,
pre-mutation baseline, differential, failureSemantics and repair state. Read
file, code, line/column and message before inspecting the nearest contract.
`diagnosticIdentities` provides canonical path, code and messageHash; positions
are evidence, not identity, so moving an error does not resolve it.

For one explicitly requested existing error, bind its current identity with
`targetDiagnostics=[{"path":"src/plugins/foo/index.tsx","code":"TS2345"}]`.
If the path/code is ambiguous, include the returned messageHash. Bind before
editing. Reuse the binding in later revisions; no need to repeat it in each
validation call. Selecting a target does not establish write authorization.

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
