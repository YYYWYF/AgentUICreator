# Agent UI Operator

The internal Operator module in `@za38.03/agent-ui-creator` provides development-time project initialization,
modification and validation. The implementation, wire protocol and generated entry use the Operator name.
The TypeScript handler is shared by the CLI and the compiled Node runtime;
it delegates parsing, mutation and inspection to the existing project contracts.
The Operator build bundles its contracts and Bootstrap; resource/catalog assets remain in the independently versioned Plugins dependency, leaving TypeScript 7
as a dependency of this tool package (including its native parser).

Install in the development host:

```sh
npm install --save-dev @za38.03/agent-ui-creator
```

```ts
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-creator/project/host";
```

Operator ships inside Creator. The Creator `/project/dev`, `/project/resources`, `/project/updates`, `/project/commands` and `/project/protocol` subpaths expose
the project-control APIs. Operator is not a production frontend dependency.

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
`packages/creator/contracts/creator/operator.schema.json`. The adjacent
`operator.operations.json` inventories operation names, read/mutation kinds,
input/result definitions, and Agent exposure. TypeScript Zod request parsing is a
Host implementation detail. TypeScript Agent client methods are transport bindings.
Neither is independently authoritative.

The response envelope is `{ok: true, result: {...}}`.
The Host validates results before returning them; the TypeScript Agent client
checks the response and uses Ajv to validate the result definition selected by
its original request operation. A producer violation returns
`OPERATOR_RESULT_CONTRACT_VIOLATION`; an invalid result at the Agent client raises
`CREATOR_OPERATOR_RESULT_CONTRACT_INVALID`. Result schemas have one owner, the
canonical JSON Schema, rather than a second set of Zod result definitions. The development-only
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
`packages/creator/contracts/creator/fixtures/operator/` feed the TypeScript
contract tests. They compare request parsing and Host result validation with
Ajv's Draft 2020-12 validation of the canonical schemas. Agent tests cover tool
exposure and the Node Operator transport. Build Creator before running
integration tests that use its compiled entry.

When changing protocol fields or the response envelope, update the canonical
contract, Host parsing/validation, Agent client and shared fixtures together.

## Initialization ownership

`@za38.03/agent-ui-creator/bootstrap` exports the initialization transaction,
Mode, Preset and source-root validation. Presets ship with Operator.
Changing initialization orchestration does not require a Plugins resource change.
`@za38.03/agent-ui-creator/source-registry` exports development-only loading and
update APIs. Catalog contracts and resource assets come from the single
`@za38.03/agent-ui-plugins` dependency; no standalone Source Registry package or
second resource distribution is required. Test history fixtures remain in the
workspace, while production historical releases must be supplied explicitly.

This `operator/` directory is the internal project-control module of
`@za38.03/agent-ui-creator`. Its checks run through
`pnpm --filter @za38.03/agent-ui-creator test:operator` and `typecheck:operator`.
Schemas/fixtures have one owner at `packages/creator/contracts`; builds bundle
the required resources without an installed dependency on repository files.
Single-package delivery does not grant permission, source takeover or BASE
adoption authority.
