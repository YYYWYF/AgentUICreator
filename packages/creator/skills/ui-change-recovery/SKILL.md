---
name: ui-change-recovery
description: Locate and reverse a specific Creator change, or assess whether a trusted template baseline can restore a stated scope. Use for historical recovery; ordinary show, hide, remove, and replacement requests use current Composition instead.
---

# UI Change Recovery

Use this guide only when the requested final state depends on an earlier state.
An ordinary request to show, hide, or remove a current instance is a Composition
change and does not require historical recovery.

## Reverse a Creator run

1. Use `inspect_creator_changes` for a bounded list. It returns actual run IDs,
   times, changed paths, before/after availability, current conflict status,
   and record/file page offsets. Follow `nextOffset` or `nextFileOffset` only
   when needed. It does not prove which run the user meant; thread
   association is unavailable. A newer conflicted run is still listed.
2. Match the user's target to one record using their request, conversation,
   file scope, and the record summary. Query a specific `run_id` and `path`
   for hashes and line counts when file scope needs clarification; the tool does
   not expose old source content. If the target remains ambiguous,
   ask which change to reverse before writing.
3. Confirm the run's complete affected scope. Current source proves present
   state, not historical intent. A Creator transaction does not own subsequent
   manual edits. Do not select an older undoable record merely because the
   newer one conflicts.
4. For a uniquely identified, authorized run, call `undo_creator_change` with
   its exact `run_id`. The Host reacquires the project mutation lock, checks
   every recorded after-state, and refuses a conflict. Never pass an omitted
   run ID or rebuild the inverse edits from a diff.
5. Use the existing current-revision validation path after a real write and
   report the changed paths and actual validation result. A no-op response
   means the record was already undone. Do not describe a conflict or partial
   failure as a successful restoration.

## Restore a template baseline

Use `inspect_agent_ui_baseline` to check whether this project has trustworthy
original content. The current source and a similarly named latest template do
not establish the original bytes. The current tool can report
`baseline_missing`; when it does, state the missing evidence and stop. Do not
search indefinitely, overwrite the source root, or install a newer template as
if it were the historical original.

If the user supplies a reliable original source or a future Host inspection
reports a scoped trusted baseline, compare only the requested scope. Use
existing Composition and bounded source operations when they can safely apply
the delta. Confirm material scope ambiguity only if project facts cannot
resolve it. A baseline difference is not automatic authorization to rewrite
every differing file.

## Examples

- “撤销刚才新增的右侧面板”：locate the run that added that panel, inspect all
  paths in that record, then undo that exact run if its after-state still
  matches. Preserve an earlier welcome-copy change.
- “把当前面板隐藏”：inspect current Composition and change its instance; no
  transaction history is needed.
- “恢复到最初模板”，但 Host reports `baseline_missing`：explain that the
  original content is unavailable and ask for a trusted source only if the
  user can provide one. Do not guess from the current template release.
