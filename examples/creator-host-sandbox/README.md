# Three independent Host examples

These ordinary React/Vite projects show the three Agent UI Modes inside user-owned applications. Each starts its own Vite server and imports only the generated `src/agent-ui` public entry. On first `dev` or `build`, the matching Source Registry preset is initialized into that Host if it is still uninitialized. Existing Agent UI source is never replaced by startup.

| Project | Mode | Host layout | URL | Start |
| --- | --- | --- | --- | --- |
| `examples/creator-host-sandbox` | Platform | Agent fills the viewport | <http://localhost:5176/> | `pnpm dev:host-sandbox` |
| `examples/creator-assistant-host` | Assistant | User page fills the viewport; Agent ball at bottom right | <http://localhost:5177/> | `pnpm dev:assistant-host` |
| `examples/creator-embedded-host` | Embedded | User page left 2/3; Agent right 1/3 | <http://localhost:5178/> | `pnpm dev:embedded-host` |

Run `pnpm install` once at the workspace root. Start any Host with its command above. Start Creator separately with `pnpm dev` (port 5174). On each Host page, use the small **Creator Agent** tab at the top right to open the Creator window. Choose that Host's directory in the system folder dialog. The public Agent's own floating button is at the bottom right only in Assistant Mode.

Creator is injected only by the Host's Vite dev configuration. It loads `http://localhost:5174/dock.html` in an iframe and never controls the Host's HMR. `VITE_CREATOR_DOCK_URL` overrides the Creator URL. Production builds omit the Creator dock. The generated Agent app has no Creator runtime dependency and does not read `.agent-ui/**` at runtime.

## Ownership and reset

Each Host owns its `src/App.tsx`, `src/AgentMount.tsx`, `src/main.tsx`, `src/host.css`, Vite config, and package file. Creator owns `src/agent-ui/**` after initialization; `.agent-ui/**` is control-plane metadata. The Host integrates Agent UI only through `import { Agent } from "./agent-ui"` and `<Agent />`.

The shared helper scripts under this project's `scripts/` initialize or inspect one named Host and reset only its `.agent-ui` and `src/agent-ui` directories. They reject symlinks and unsafe paths. After reset, the next `dev` or `build` initializes that Host's default Mode again. The Platform Host also keeps its explicit `init:assistant`, `init:embedded`, and `init:platform` scripts for Source Registry experiments; using a different Mode requires reset first and the matching Host layout is only guaranteed in its named example.

The public-entry test in this project builds temporary Hosts for all three Modes after removing `.agent-ui/**`, covering deployment without Creator metadata.
