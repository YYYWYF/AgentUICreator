# Agent UI Operator

`@za38.03/agent-ui-operator` provides development-time project initialization,
modification and validation. The implementation, wire protocol and generated entry use the Operator name.
The TypeScript handler is shared by the legacy CLI and the compiled Node runtime;
it delegates parsing, mutation and inspection to the existing project contracts.
The build bundles those contracts and Bootstrap; Source Registry remains an external independently versioned dependency, leaving TypeScript 7
as a dependency of this tool package (including its native parser).

Install in the development host:

```sh
npm install --save-dev @za38.03/agent-ui-operator
```

```ts
import { initializeAgentUIProject } from "@za38.03/agent-ui-operator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-operator/host";
```

The `/dev`, `/resources`, `/updates`, `/commands` and `/protocol` subpaths keep
their existing APIs. Operator is not a production frontend dependency.

Initialization installs `.agent-ui/operator/entry.mjs` as the only managed
control entry. It imports the compiled runtime from the installed development
tool and resolves the Host root from its own location. The Host does not install
tsx or ship control code in its production app. Build this tool package as part
of the development-tool release before initializing Hosts. On Creator
select/refresh, `ensureManagedOperator` ensures the entry matches the
installed runtime: it installs a missing entry, atomically updates an entry when
the tool location or runtime source changes, and refuses to overwrite an
unmanaged or user-modified entry.

Operator's canonical wire contract is
`contracts/creator/operator.schema.json`. The adjacent
`operator.operations.json` inventories operation names, read/mutation kinds,
input/result definitions, and Agent exposure. TypeScript Zod request parsing is a
Host implementation detail. Python literals/client methods are transport bindings.
Neither is independently authoritative.

The response envelope is `{ok: true, result: {...}}`.
The Host validates results before returning them; Python validates the envelope
and the result definition selected by its original request operation. A producer
violation returns `OPERATOR_RESULT_CONTRACT_VIOLATION`; a consumer violation becomes
`OPERATOR_PROTOCOL_INCOMPATIBLE`. Result schemas have one owner, the canonical JSON
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

`pnpm check:operator-contract` checks inventory parity, execution coverage,
and declared Agent exposure. Shared request/result fixtures under
`contracts/creator/fixtures/operator/` feed both language suites, with the
Python Draft 2020-12 validator as the canonical differential oracle. Python tests
also check actual tool objects and run apply/remove through an isolated real Node
Host. Build the control package before running these integration tests.

When changing protocol fields or the response envelope, update the canonical contract and both language bindings in the same change.

## Initialization ownership

`@za38.03/agent-ui-operator/bootstrap` exports the initialization transaction,
Mode, Preset and source-root validation. Presets ship with Operator.
Changing initialization does not require a Source Registry release.
Registry loading and resource release metadata come from the installed
`@za38.03/agent-ui-source-registry` dependency; resources and fixtures are not copied into this package.
