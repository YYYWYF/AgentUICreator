# Northstar Assistant Mock Host

Start from the repository root:

```sh
pnpm dev:assistant-host
```

Open http://127.0.0.1:5181/. `pnpm dev:examples` starts all three examples together. Setup generates the current `assistant` template into this project's `src/agent-ui/` when missing, preserving any existing application/source changes on later launches.

Host-owned UI is in `src/`; `AgentMount.tsx` connects the generated public Agent API to the local `/agent` Mock. The Vite dev server supplies streaming Mock scenarios and conversation history without model credentials. The original Northstar dashboard stays behind the floating Assistant.

After generation, the project's own scripts work independently:

```sh
pnpm --filter @za38.03/agent-ui-creator-assistant-host dev
pnpm --filter @za38.03/agent-ui-creator-assistant-host test
pnpm --filter @za38.03/agent-ui-creator-assistant-host typecheck
pnpm --filter @za38.03/agent-ui-creator-assistant-host build
```

`build` compiles the application without loading Creator or the Mock. A deployed application provides its own Agent API. The optional Mock is development tooling; no Creator import exists in production frontend source. See [all examples](../README.md) for startup, ports, preservation and independence boundaries.
