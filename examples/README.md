# Mock Host examples

These are maintained React Host projects, with current Agent UI templates generated through Bootstrap. Northstar keeps the original work dashboard; Atlas keeps the original presentation editor and Host/Agent interaction. Generated `src/agent-ui/` and `.agent-ui/` stay inside each repository example and are ignored by Git. The committed Host source, current presets and initialization command reproduce them without a temporary directory or a saved legacy implementation.

From the workspace root:

```sh
pnpm dev:examples
```

This command installs the frozen workspace graph, builds the tooling once, initializes missing examples from the installed current templates and starts all three:

| Example | Mode | URL | Start individually |
| --- | --- | --- | --- |
| [creator-host-sandbox](creator-host-sandbox/README.md) | Platform, full viewport | http://127.0.0.1:5180/ | `pnpm dev:host-sandbox` |
| [creator-assistant-host](creator-assistant-host/README.md) | Northstar dashboard with floating Assistant | http://127.0.0.1:5181/ | `pnpm dev:assistant-host` |
| [creator-embedded-host](creator-embedded-host/README.md) | Atlas editor with embedded Assistant | http://127.0.0.1:5182/ | `pnpm dev:embedded-host` |

Startup preserves already initialized projects, application customizations and source BASE. A broken or mismatched project stops with an error; it is never reset or automatically source-synchronized. New projects use the current default preset and catalog application templates. Changing those defaults does not overwrite an existing project's generated code.

Each example's Vite development config provides the local Mock Agent at `/agent` and conversation history at `/__agent-ui/mock-data`. The Mock belongs to Creator development tooling; frontend source imports only the generated Agent entry and production UI packages. The current Host `AgentMount.tsx` explicitly selects `/agent`; replace that Host-owned endpoint to use a real API. No model credentials are needed for these mocks.

After initialization, each example supports its own `dev`, `test`, `typecheck` and `build` scripts, for example:

```sh
pnpm --filter @za38.03/agent-ui-creator-assistant-host dev
pnpm --filter @za38.03/agent-ui-creator-assistant-host typecheck
pnpm --filter @za38.03/agent-ui-creator-assistant-host build
```

Production builds do not load Creator, Bootstrap or Mock services. If Creator is absent, the standalone development UI still runs against the Host API; the optional development Mock is unavailable. Workspace convenience commands provide generation/setup and are separate from those target-project scripts. Startup uses native Node paths and the shared Windows-aware pnpm/process helpers.

`pnpm dev` remains the Platform + Creator Workbench entry (5180 + 5174); stop it before running `pnpm dev:examples` or `pnpm dev:host-sandbox`, since they use the same Platform port. The examples launcher does not start a Creator editing panel. Vue's separate style-isolation integration demo remains available through `pnpm dev:vue-host` and also defaults to 5180; stop the Platform server first.
