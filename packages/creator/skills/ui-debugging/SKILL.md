---
name: ui-debugging
description: Use when diagnosing AppUIModel validation failures, TypeScript errors, Runtime errors, HMR issues, build failures, or UI Plugin loading and registration errors.
compatibility: Agent UI Plugin Creator Phase 8 command allowlist and Plugin write boundaries.
allowed-tools: read_file ls glob grep edit_file inspect_ui_project inspect_app_ui_model inspect_ui_slots list_ui_plugins inspect_ui_plugin inspect_runtime_errors mutate_app_ui_model undo_creator_run execute
---

# UI Debugging

Start from the concrete failure and preserve layer boundaries.

## Diagnostic order

1. Read the exact error and the directly implicated model or source file.
2. For AppUIModel errors, check schema invariants, ids, `sizes`, Panel bounds, instances, and whether every `mount.slotId` is reachable through a Layout SlotNode or Plugin child Slot. Use `inspect_ui_slots` for Slot locations and configured mounts.
3. For Plugin load errors, check manifest validation, registration, `pluginId`, and instance references.
4. For TypeScript errors, inspect the first relevant error and the local contract before editing.
5. For Runtime errors, call `inspect_runtime_errors` and use only diagnostics matching the current AppUIModel hash. A source-attributed render failure includes its Plugin, instance, Slot path, and component stack; an activation failure identifies the setup instance. Use `includeStale` only for history, and do not attribute ordinary console errors to a Plugin.
6. For HMR issues, distinguish a failed module update from state or runtime behavior before changing architecture.

## Phase 8 repair boundary

- Repair AppUIModel when the failure is model composition and the requested edit is allowed.
- Repair Plugin source when the failure is inside `/project/plugins/` and the change preserves the Plugin Contract.
- Runtime and Framework remain read-only; diagnose and report an infrastructure change rather than bypassing the boundary.
- Available validation commands include `pnpm verify:ui`, `pnpm test`, `pnpm typecheck`, and `git diff --check`.
- Run the narrowest relevant validation, then expand only when justified.
- Runtime diagnostics cover failures after static validation, but do not replace `verify:ui` or typecheck evidence.

Do not hide a validation failure with unrelated rewrites, dependency changes, or relaxed contracts.
Do not delete a failing Plugin's source to make validation pass. Repair it, remove only its AppUIModel instance when that is the user's intent, or use `undo_creator_run` for a still-matching Creator change.
