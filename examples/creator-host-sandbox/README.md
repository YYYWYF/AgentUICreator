# Platform Mock Host

Start from the repository root:

```sh
pnpm dev:host-sandbox
```

Open http://127.0.0.1:5180/. `pnpm dev:examples` starts all three examples together. Setup generates the current `platform` template into this project's `src/agent-ui/` when missing, preserving any existing application/source changes on later launches.

Host-owned UI is in `src/`; `AgentMount.tsx` connects the generated public Agent API to the local `/agent` Mock. The Vite dev server supplies streaming Mock scenarios and conversation history without model credentials. The Agent occupies the viewport; the platform composition places New Conversation above sidebar search.

After generation, the project's own scripts work independently:

```sh
pnpm --filter @za38.03/agent-ui-creator-host-sandbox dev
pnpm --filter @za38.03/agent-ui-creator-host-sandbox test
pnpm --filter @za38.03/agent-ui-creator-host-sandbox typecheck
pnpm --filter @za38.03/agent-ui-creator-host-sandbox build
```

`build` compiles the application without loading Creator or the Mock. A deployed application provides its own Agent API. The optional Mock is development tooling; no Creator import exists in production frontend source. See [all examples](../README.md) for startup, ports, preservation and independence boundaries.
