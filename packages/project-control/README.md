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

ProjectControl's canonical wire contract is
`contracts/creator/project-control.schema.json`. The adjacent
`project-control.operations.json` inventories operation names, read/mutation kinds,
input/result definitions, and Agent exposure. TypeScript Zod request parsing is a
Host implementation detail. Python literals/client methods are transport bindings.
Neither is independently authoritative.

The response envelope is `{ok: true, result: {...}}`.
The Host validates results before returning them; Python validates the envelope
and the result definition selected by its original request operation. A producer
violation returns `CONTROL_RESULT_CONTRACT_VIOLATION`; a consumer violation becomes
`CONTROL_PROTOCOL_INCOMPATIBLE`. Result schemas have one owner, the canonical JSON
Schema, rather than a second set of Zod result definitions. The development-only
Host validator implements the Result keyword subset and fails closed on unsupported
keywords. It is bundled with the canonical contract and inventory; it adds no
production dependency to the generated app.

Agent Tool exposure is a separate authorization surface. Internal transport
supports `remove_agent_ui_source_items` and `verify_runtime_composition`, but
neither is a model tool. Source mutation behavior and AppUIModel grammar are
unchanged. Host-owned complex objects explicitly marked opaque in the schema
retain their existing project contracts; top-level result fields and the Source,
Plugin asset, and Service consumer fields are bounded and checked.

`pnpm check:project-control-contract` checks inventory parity, execution coverage,
and declared Agent exposure. Shared request/result fixtures under
`contracts/creator/fixtures/project-control/` feed both language suites, with the
Python Draft 2020-12 validator as the canonical differential oracle. Python tests
also check actual tool objects and run apply/remove through an isolated real Node
Host. Build the control package before running these integration tests.

When changing protocol fields or the response envelope, update the canonical contract and both language bindings in the same change.
