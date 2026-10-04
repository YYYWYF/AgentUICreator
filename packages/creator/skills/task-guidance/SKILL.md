---
name: task-guidance
description: Use on demand to choose evidence for Creator tasks involving current state, historical recovery, debugging, capability discovery, or explanation. Especially useful when the requested outcome depends on an earlier project state.
---

# Creator Task Guidance

Use this guide only when choosing the evidence path is material. It does not
require a classification step for every request, prescribe a tool sequence, or
replace the Creator Agent's judgment.

## Current State Change

Use when the requested result depends on the project's current state.

- First evidence: the smallest authoritative Host observation for the owning
  layer, such as the current Composition snapshot for layout and Plugin
  placement.
- Recommended capability: current-state inspection followed by the smallest
  semantic mutation.
- Avoid: querying transaction history when the user is only asking to change
  the current state.

## Historical Recovery

Use when the requested result depends on an earlier project state, such as
undoing a Creator change or restoring a previously recorded version.

- First evidence: `inspect_creator_transactions`; recency alone does not prove
  which transaction the user means.
- Then inspect the relevant complete transaction with
  `inspect_creator_transaction`, and read a saved per-file diff with
  `inspect_creator_transaction_change` only when it helps identify the target.
- Use `inspect_creator_baseline` to look for Host-recorded before-state or
  source-lock hash evidence. A source-lock hash alone is not original file
  content or proof that a template reset is available.
- Current files prove only the current state. Do not infer a prior state by
  scanning current source, guessing from `sourceRoot`, or treating a template
  as the user's historical baseline.
- `undo_creator_run` requires a fully observed transaction, a known complete
  scope, current state that still matches the recorded after-state, and a
  request that authorizes undo. Use `ask_user_question` only when recorded
  evidence leaves a user-owned choice unresolved. If evidence is missing or
  incomplete, explain what is missing instead of guessing.

## Debugging

Use when the user reports an error, a missing UI, or failed validation/build.

- First evidence: the exact error or diagnostic and the relevant current
  revision.
- Recommended capability: inspect the owning layer and its current contract,
  then make a targeted repair only when the evidence connects it to the request.
- Avoid: broad source scans before reading the concrete failure, and treating
  stale diagnostics as current.

## Capability Extension

Use when the requested behavior may require a capability the current project
does not provide.

- First evidence: the installed Plugin or capability inventory and relevant
  available Source Items.
- Recommended capability: reuse an installed Plugin or installable Source Item
  before considering new development; establish the concrete gap before
  preparing an authorized development path.
- Avoid: creating a parallel capability before checking existing project-owned
  options.

## Explanation or Inspection

Use when the user asks how something works or what the project currently has.

- First evidence: the narrowest authoritative observation that answers the
  question.
- Recommended capability: read-only inspection and a direct answer.
- Avoid: mutation, historical recovery, or unrelated inventory work unless the
  question requires it.
