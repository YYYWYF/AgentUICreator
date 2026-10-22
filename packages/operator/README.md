# Agent UI Operator

`@za38.03/agent-ui-operator` owns the TypeScript development-tool implementation:
CLI, Workbench UI, Vite/dock integrations, Python process hosting, Mock service,
project initialization, validation, permissions, transactions and updates.
The internal project-control implementation is under `control/`.

Users install `@za38.03/agent-ui-creator`; Creator installs Operator automatically
and supplies the location of its Python runtime and skills. Operator has no
runtime dependency on Creator and does not carry a second Python distribution.

Creator's existing public subpaths continue to forward to Operator. Direct
tooling APIs are available from `/project`, `/project/*`, `/bootstrap`,
`/source-registry` and `/mock-agent`. Operator is never a production dependency
of the generated frontend.

Build and check from the repository root:

```text
pnpm --filter @za38.03/agent-ui-operator build
pnpm --filter @za38.03/agent-ui-operator typecheck
```
