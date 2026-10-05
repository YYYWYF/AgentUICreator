---
name: ui-debugging
description: Use for reported errors, missing UI, failed TypeScript/AppUIModel validation, Runtime failures, or Plugin loading problems. Ordinary layout changes do not require this skill.
---

# UI Debugging

Use tools actually offered in this run. This skill grants no permissions and
prescribes no fixed workflow or discovery phase.

## Exact current failure first

Prefer the user's specific error, then current Host validation diagnostics,
then fresh Runtime diagnostics, then the implicated owner and nearest contract.
Broader investigation is justified only by a concrete uncertainty left by that
evidence. For `TS2345 src/plugins/foo/index.tsx:42`, read that file first; do not
list the root, glob the workspace, or rediscover every Plugin.

When static failure details are missing, use `inspect_static_diagnostics()` to
obtain current debugging diagnostics. Delta can pass while a requested pre-existing error
remains: select its `debuggingTargetId` with `select_debugging_target` from current Host evidence
before repair. Targets persist through revisions; they do not authorize writes.
Use clean mode only when the user asks to clean the entire typecheck.

Distinguish current, stale, pre-existing, introduced, and resolved diagnostics.
Historical errors alone do not justify changing current code. Reuse an observed
result when `DIAGNOSTIC_ALREADY_OBSERVED` says `reusePreviousResult=true`; reread
after a mutation, changed evidence, validation mode, or Runtime scope.

Diagnostic observation is evidence, not repair scope. Select the diagnostic the
user wants fixed before mutation. If multiple diagnostics remain plausible and
the user has not authorized all of them, ask the user instead of editing multiple
owners. For an explicit all-current Runtime goal, use
`select_all_current_runtime_diagnostics()`; each owner still obeys Scope Guard.

## Attribute before repair

- Composition: inspect current AppUIModel/Slot/Layout/instance/placement and
  repair with `mutate_app_ui_model`, using snapshot-scoped authoring refs.
- Plugin behavior: read the named TS/TSX/CSS/manifest/definition owner and make
  the smallest source change preserving the Plugin Contract.
- Runtime capability: use current Service contract and provider/consumer facts;
  repair only within user authorization and Host scope.
- Agent integration: read the application-owned frontend Tool/Event/AG-UI
  contract. Do not spread the change into Runtime or Framework.

A page failure does not establish which layer owns it. Runtime and Framework
remain read-only unless the task explicitly authorizes framework work. Diagnosis
selection never expands Scope Guard permissions. Do not delete failing source,
relax contracts, or repair unrelated workspace errors to make checks pass.

## Converge and stop

Verify the requested diagnostic disappears on the current revision and no
introduced regressions remain. Unrelated pre-existing errors are warnings.
Existing repair limits apply to unresolved target errors even when delta passes.
Report structured outcomes: resolved, blocked by scope/integrity/freshness,
unchanged_preexisting when current evidence already satisfies the goal, or
unresolved_after_limit. Do not manufacture a no-op change.

Runtime tools are available only in `static_and_runtime`. Prefer
`inspect_runtime_errors` for failures and use its current hash, freshness,
source/component stack, Plugin and instance attribution. Bind only requested
fresh `debuggingTargetId` values with `select_debugging_target`. When attribution identifies the
owner, read it directly. Use `inspect_runtime_layout` for layout uncertainty.
In `static_only`, report the missing Runtime evidence without claiming a
Runtime repair was verified.

Ordinary debugging does not undo a whole Creator run. Read `ui-change-recovery`
only when the user's goal is to undo a historical Creator modification.

Read [validation-debugging](references/validation-debugging.md) for complex
static diagnostics or target completion, and
[runtime-debugging](references/runtime-debugging.md) for Runtime freshness,
attribution, and layout boundaries.

Ordinary `validate_creator_changes` reports completion/regression evidence and
workspace warnings without activating target selection. Static discovery uses
`inspect_static_diagnostics()` and reuses the same parser, baseline and differential.
The owner may be read before or after selection; selection stays available in
Source and Composition lanes. Runtime targets expose semantic repair resources;
`DEBUGGING_OWNER_EVIDENCE_REQUIRED` calls for targeted Service/contract inspection.
