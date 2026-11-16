# Atlas Embedded Mock Host

Start from the repository root:

```sh
pnpm dev:embedded-host
```

Open http://127.0.0.1:5182/. `pnpm dev:examples` starts all three examples together. Setup generates the current `embedded` template into this project's `src/agent-ui/` when missing, preserving any existing application/source changes on later launches.

Host-owned UI is in `src/`; `AgentMount.tsx` connects the generated public Agent API to the local `/agent` Mock. The Vite dev server supplies streaming Mock scenarios and conversation history without model credentials. The original Atlas editor keeps editable slide controls, Agent visibility and the Host analysis action; desktop uses the editor/Agent split and narrow screens stack them.

Configure history in `src/agent-ui/services/conversations/data-source.ts`: it contains the complete `list/get/delete/rename/archive/unarchive` methods. Edit a method's URL, parameters and response conversion directly, or use the project's Axios/SDK. `conversationConnection` holds the base address and per-request authentication. `src/AgentMount.tsx` explicitly creates the development Mock source; production supplies a business endpoint or its own `Agent.conversationDataSource`. There is no npm HTTP factory. npm retains conversation management and the assistant-ui lifecycle; package upgrades and implementation source sync preserve project data-source methods.

After generation, the project's own scripts work independently:

```sh
pnpm --filter @za38.03/agent-ui-creator-embedded-host dev
pnpm --filter @za38.03/agent-ui-creator-embedded-host test
pnpm --filter @za38.03/agent-ui-creator-embedded-host typecheck
pnpm --filter @za38.03/agent-ui-creator-embedded-host build
```

`build` compiles the application without loading Creator or the Mock. A deployed application provides its own Agent API. The optional Mock is development tooling; no Creator import exists in production frontend source. See [all examples](../README.md) for startup, ports, preservation and independence boundaries.
