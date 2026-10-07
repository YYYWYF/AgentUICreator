# Creator Slash Commands — phase one

Creator's Textarea routes every leading slash to a deterministic command namespace.
Only `/theme` is registered. `/`, `/th`, and `/theme` provide a two-level keyboard
picker; `/theme <preset-id>` executes directly. Unknown commands or invalid
arguments never become Creator Agent prompts. Natural language keeps its existing
Agent path. Running requests and pending questions block command mutations.

The Host exposes `GET /__creator/commands` and
`POST /__creator/commands/execute`. Both use `x-agent-ui-workspace-id`; execution
requires same-origin JSON and a ready workspace. The catalog resolves
`AGENT_UI_THEME_PRESETS` from the selected project's installed `@agent-ui/react/theme`,
not Creator's dependencies. This pure Theme contract export avoids loading browser
components in the Host. Older facade versions without this export do not advertise
the command capability. Missing or unsupported canonical configuration removes
this capability from the catalog. Custom preset IDs remain protocol data.

ProjectControl reads `.agent-ui/project.json`, resolves its `sourceRoot`, and edits
only the string literal of exported `agentUIThemeConfig` in
`agent-ui/theme/theme-config.ts`. Native TypeScript AST parsing rejects dynamic or
spread configuration. It validates the preset and project statically under the
existing ProjectControl admission lock. This changes the generated application,
not Workbench's own theme and not merely the current Preview service.

The authenticated Python Host storage port checks pending questions, active runs,
and expected file contents under the existing writing lock. It persists an
unverified before/after record in `CreatorTransactionStore`, journals the pending
operation, atomically publishes the candidate, and invokes the managed
ProjectControl runtime's `verifyUIProject` against the changed files. The runtime
URL must match the project's installed managed control entry; no caller-selected
module is executed. Only a passed result advances `validationRevision` and returns
a verified receipt. Failed results, verifier exceptions, timeouts, or finalization
failures restore the original file through the shared undo backend. A pending
journal is recovered on sidecar restart. Later manual changes are protected by
hash conflict checks. Identical input verifies the actual current project but
creates no transaction and changes no file.

Command activities are presentation items, persisted separately from
`agentMessages`. They use Creator's locale context and standard validation /
transaction receipts. Successful commands refresh project state;
Host Preview's development Vite plugin fully reloads after canonical theme config
changes so theme-provider service setup reruns, including undo/reapply. The config
module is invalidated before the reload. Workbench leaves the connected iframe
in place to avoid racing an iframe remount against this reload.

The `theme-commands` CI job runs focused regressions and
`test:e2e:theme-commands`: a disposable generated Host with real command APIs,
Python transaction storage, ProjectControl verification and Preview. It covers
persistent Violet rendering, reload, shared undo/reapply, idempotence and invalid
input without a Creator Model request. Static verification receipts do not claim
runtime or visual verification.
