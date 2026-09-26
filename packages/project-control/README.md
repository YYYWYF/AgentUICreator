# Agent UI Project Control

Development-only distribution of the formal Project Control implementation.
The TypeScript handler is shared by the legacy CLI and the compiled Node runtime;
it delegates parsing, mutation and inspection to the existing project contracts.
The build bundles those contracts and the Source Registry, leaving TypeScript 7
as a dependency of this tool package (including its native parser).

Initialization installs `.agent-ui/control/project-control.mjs`. This versioned
entry imports the compiled runtime from the installed tool, and resolves the Host
root from its own location. The Host does not install tsx or ship control code in
its production app. Build this tool package as part of the development-tool
release, before initializing Hosts. Creator select/refresh calls
`ensureManagedProjectControl` before starting Python: current entries are a noop,
stale versions or relocated tool URLs are atomically upgraded, and modified entries
are refused. Missing v2 entries are installed; legacy projects retain their fallback.
Metadata lives inside the entry, without changing the public project schema.

Keep legacy scripts/tsx fallback for at least one full migration cycle. Remove
it only after managed-path tests and all three Host modes have passed. No legacy
Host entry is removed in this migration.
