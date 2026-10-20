# Creator remaining three reliability fixes

Date: 2026-10-20

This pass addresses the three remaining known issues: undeclared Slot diagnostics being flattened by Operator, a repeated successful AppUIModel transaction being dispatched twice, and stale semantic no-op state surviving a later real mutation.

## Changes

- Operator's AppUI compiler error now carries `APP_UI_MODEL_COMPOSITION_INVALID` and its structured issues through the existing Host error response. The issue identifies the parent Plugin instance that owns the undeclared Slot, its Plugin ID, Slot name, and AppUIModel path. Creator classifies this as an operation precondition so the model receives a precise semantic repair signal.
- Creator caches the last validated successful mutation within the mutation service. It returns an idempotent replay without a second Operator request only when the operation signature, complete mutable-file states, and fresh AppUIModel hash still match. A changed project state dispatches the operation again. The existing cancellation, permission, observation, and hash gates remain in place.
- A real file touch clears prior semantic no-op state. Later no-op results cannot restore the marker after the run has already changed files.

No handbook, skill, or prompt file was changed in this pass. Existing uncommitted work in those files was preserved.

## Local validation

- `tests/test_phase3_authoring_contract.py`, excluding package-install and static verification cases that depend on the unavailable pnpm registry: **16 passed, 4 deselected**. JUnit evidence: `authoring-contract.xml`.
- Operator AppUI compiler tests: **12 passed**.
- Operator `tsconfig.json` and `tsconfig.tests.json` no-emit checks: **passed**.
- `git diff --check`: **passed**.
- Additional existing domain-tools semantic no-op test: **passed**.

The three focused regressions exercise the real initialized Operator Host. They verify exact undeclared-Slot issue fields, no second Operator dispatch for an unchanged repeated transaction, a fresh dispatch after project state changes, and clearing a no-op marker after a later real Host mutation. The separate stale-observation test confirms that an old hash is rejected until the project is observed again.

The full authoring-contract file was attempted but did not complete: after 12 passes, the public-props typecheck and takeover-approval case failed because the pinned pnpm signature could not be verified while registry access was unavailable; the run was interrupted while that environment-dependent section continued. Two older AppUI mutation tests also fail during fixture construction because their temporary projects lack `.agent-ui/project.json`; the independent phase3 Host fixture covers the relevant hash and no-op paths.

## Live Creator tasks

After the user explicitly authorized sending the isolated Host context to the configured model service, both real-model tasks passed through Creator `/creator`, the configured model, and the real Operator. Final records, SSE events, patches, and run logs are retained under `live-authorized/`.

| Task | Result | Duration | Domain model calls | Mutations | Changed paths |
| --- | --- | ---: | ---: | ---: | --- |
| Move Copy after Regenerate | Passed; final order correct; completion `success` | 344.628s | 13 | 3 requests / 3 operations; one semantic replan | `app-ui.json` |
| Hide voice input | Passed; instance retained and disabled; completion `success` | 67.919s | 7 | 1 request / 1 operation | `app-ui.json` |

The `move` trace includes a successful `changed=false` transaction followed by a real AppUIModel change. The run log records `semantic_noop_invalidated` before the file mutation, and final completion is `success`, directly covering the stale no-op failure mode. Both tasks had zero run errors and changed no other project files. These runs used `static_only`; they do not establish Runtime or browser visual verification. Earlier sandbox-only transport failures remain preserved under `live/`.

The implementation changes are platform-neutral. Local checks ran on macOS; a real Windows execution was not available.
