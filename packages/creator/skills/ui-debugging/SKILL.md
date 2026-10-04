---
name: ui-debugging
description: Diagnose a concrete Composition, Plugin source, build, or Runtime failure from its direct evidence. Use this for fault attribution and focused repair; use ui-change-recovery to reverse an earlier Creator change.
---

# UI Debugging

Start from the concrete failure and preserve layer boundaries. Distinguish
pre-existing errors, errors introduced by this run, and unknown attribution.

## Diagnostic order

1. Read the exact error and the directly implicated model or source file.
2. For AppUIModel errors, check schema invariants, `activeIndex`, `sizes`, Panel bounds, application plugins, Layout Slot `plugins`, and nested plugin-local Slots. Use snapshot-scoped `nodeRef` targets with `inspect_ui_slots`; Runtime slot ids are compiler output, not repair inputs.
3. For Plugin load errors, check manifest validation, registration, `pluginId`, and instance references.
4. For TypeScript errors, inspect the first relevant error and the local contract before editing.
5. For Runtime errors, call `inspect_runtime_errors` only when the current verification mode exposes it. Use diagnostics matching the current AppUIModel hash. In `static_only`, report Runtime state as unverified. Do not attribute ordinary console errors to a Plugin.
6. For HMR issues, distinguish a failed module update from state or runtime behavior before changing architecture.

## Repair boundary

- Repair AppUIModel when the failure is model composition and the requested edit is allowed.
- Repair Plugin source when the failure is inside the actual `<sourceRoot>/plugins/` and the change preserves the Plugin Contract. Resolve `sourceRoot` from Host inspection and prefix its project-relative path with `/` for filesystem tools; never pass the placeholder literally.
- Runtime and Framework remain read-only; diagnose and report an infrastructure change rather than bypassing the boundary.
- Use `validate_creator_changes` for current-revision static validation when available. Shell commands are Host internal, not Creator Agent tools.
- Runtime diagnostics cover failures after static validation, but do not replace `verify:ui` or typecheck evidence.

Do not hide a validation failure with unrelated rewrites, dependency changes, or relaxed contracts.
Do not delete a failing Plugin's source to make validation pass. Repair it or remove only its AppUIModel instance when that is the user's intent. For a historical reversal, read `ui-change-recovery/SKILL.md`.
