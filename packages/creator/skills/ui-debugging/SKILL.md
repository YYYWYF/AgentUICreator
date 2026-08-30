---
name: ui-debugging
description: Use when diagnosing AppUIModel validation failures, TypeScript errors, Runtime errors, HMR issues, build failures, or UI Plugin loading and registration errors.
compatibility: Agent UI Plugin Creator Phase 8 command allowlist and Plugin write boundaries.
allowed-tools: read_file ls glob grep edit_file execute
---

# UI Debugging

Start from the concrete failure and preserve layer boundaries.

## Diagnostic order

1. Read the exact error and the directly implicated model or source file.
2. For AppUIModel errors, check schema invariants, ids, `sizes`, Panel bounds, instances, and Slot mounts.
3. For Plugin load errors, check manifest validation, registration, `pluginId`, and instance references.
4. For TypeScript errors, inspect the first relevant error and the local contract before editing.
5. For Runtime errors, determine whether the fault is invalid project data, Plugin behavior, or framework infrastructure.
6. For HMR issues, distinguish a failed module update from state or runtime behavior before changing architecture.

## Phase 8 repair boundary

- Repair AppUIModel when the failure is model composition and the requested edit is allowed.
- Repair Plugin source when the failure is inside `/project/plugins/` and the change preserves the Plugin Contract.
- Runtime and Framework remain read-only; diagnose and report an infrastructure change rather than bypassing the boundary.
- Available validation commands are `pnpm test`, `pnpm typecheck`, and `git diff --check`.
- Run the narrowest relevant validation, then expand only when justified.

Do not hide a validation failure with unrelated rewrites, dependency changes, or relaxed contracts.
