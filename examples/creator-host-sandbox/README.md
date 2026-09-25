# Creator Host Sandbox

This is an ordinary React/Vite host project for development testing. On a fresh checkout it has no `.agent-ui/` or `src/agent-ui/` directory, so the Creator Project Inspector reports `uninitialized`. Creator does not start or manage this Vite server.

## Ownership

| Owner | Paths |
| --- | --- |
| Host application | `src/App.tsx`, `src/AgentMount.tsx`, `src/main.tsx`, `vite.config.ts`, `package.json` |
| AgentUICreator source | `src/agent-ui/**` after initialization |
| AgentUICreator metadata | `.agent-ui/**` after initialization |

The sandbox declares the dependencies required by the default Assistant, Embedded, and Platform Source Registry presets. Its dev dependencies are only for the host's Vite tooling and the local helper scripts. Install workspace dependencies with `pnpm install` before using the helpers.

## Workbench initialization

1. Run `pnpm reset:host-sandbox`, then `pnpm inspect:host-sandbox`. The status should be `uninitialized`.
2. Run `pnpm dev:host-sandbox` yourself and open <http://127.0.0.1:5176/>. Keep it running.
3. Start Creator Workbench separately. Click **浏览文件夹**, open `examples` → `creator-host-sandbox`, then click **选择这个文件夹**. Confirm that Agent UI is uninitialized. The manual path field is an optional fallback.
4. Choose Assistant and `src/agent-ui`, then initialize. Workbench should report `ready`. Inspect `.agent-ui/project.json`, `.agent-ui/source-lock.json`, `src/agent-ui/index.ts`, and `src/agent-ui/application/runtime-config.generated.ts`.
5. Edit the **host-owned** `src/AgentMount.tsx` by hand:

   ```tsx
   import { Agent } from "./agent-ui";

   export function AgentMount() {
     return <Agent />;
   }
   ```

   Vite should update the page through HMR. The Host page and Assistant should coexist. The default Agent endpoint is `/agent`; pass `endpoint` or set `VITE_AGENT_ENDPOINT` for a real AG-UI service.
6. With Vite still running, ask Creator to change the welcome text, for example `把欢迎语改成“你好，我是你的助手”`. The change under `src/agent-ui/**` should appear through HMR.

The Host imports only the public `src/agent-ui/index.ts` entry. It does not import managed `runtime`, `framework`, `plugins`, or `app-ui` paths. The initializer never edits `App.tsx` or `AgentMount.tsx`.

`.agent-ui/project.json` is Creator control-plane metadata. Initialization derives the Mode into `src/agent-ui/application/runtime-config.generated.ts`; the production `<Agent />` import reads that generated source and does not require `.agent-ui/**` in the deployed app.

## Other modes

Use `pnpm reset:host-sandbox` and initialize Embedded or Platform in Workbench, always with `src/agent-ui`. The Host integration stays `import { Agent } from "./agent-ui"` and `<Agent />`.

For Embedded, the Host can place `<Agent />` inside `<div className="agent-area">`. For Platform, it can place it inside `<div className="platform-demo">`. Confirm the Platform default AppUI includes both thread list and conversation. A missing Mode shell behavior belongs in the managed source, not in this fixture.

The reset command removes only `.agent-ui/` and `src/agent-ui/`. It leaves `AgentMount.tsx` intact. If that file still imports `./agent-ui`, restore its initial null component by hand before running the uninitialized Host app.

## Direct initialization helpers

These development scripts call the existing Host initializer and Inspector. They require `uninitialized` and never reset automatically:

```text
pnpm reset:host-sandbox
pnpm init:host-sandbox:assistant
pnpm inspect:host-sandbox

pnpm reset:host-sandbox
pnpm init:host-sandbox:embedded
pnpm inspect:host-sandbox

pnpm reset:host-sandbox
pnpm init:host-sandbox:platform
pnpm inspect:host-sandbox
```

`pnpm --filter @agent-ui/creator-host-sandbox test` contains a Host import boundary test and temporary Host TypeScript/Vite build tests for all three Modes. Each temporary Host removes `.agent-ui/**` before compiling to cover deployment without Creator metadata.
