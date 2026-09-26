# Three independent Host examples

These ordinary React/Vite projects show the three Agent UI Modes inside user-owned applications. Each starts its own Vite server and imports only the generated `src/agent-ui` public entry. On first `dev` or `build`, the matching Source Registry preset is initialized into that Host if it is still uninitialized. Existing Agent UI source is never replaced by startup.

| Project | Mode | Host layout | URL | Start |
| --- | --- | --- | --- | --- |
| `examples/creator-host-sandbox` | Platform | Agent fills the viewport | <http://localhost:5176/> | `pnpm dev:host-sandbox` |
| `examples/creator-assistant-host` | Assistant | User page fills the viewport; Agent ball at bottom right | <http://localhost:5177/> | `pnpm dev:assistant-host` |
| `examples/creator-embedded-host` | Embedded | User page left 2/3; Agent right 1/3 | <http://localhost:5178/> | `pnpm dev:embedded-host` |

Run `pnpm install` once at the workspace root. Start any Host with its command above. Start Creator separately with `pnpm dev` (port 5174). On each Host page, use the small **Creator Agent** tab at the top right to open the Creator window. Choose that Host's directory in the system folder dialog. The public Agent's own floating button is at the bottom right only in Assistant Mode.

Creator is injected only by the Host's Vite dev configuration. It loads `http://localhost:5174/dock.html` in an iframe and never controls the Host's HMR. `VITE_CREATOR_DOCK_URL` overrides the Creator URL. Production builds omit the Creator dock. The generated Agent app has no Creator runtime dependency and does not read `.agent-ui/**` at runtime.

## 配置用户工程的 AG-UI 地址（`.env.local`）

示例只提供前端，不自带真实 Agent 后端。推荐使用项目自己的 `.env.local` 配置接口地址；若使用 `<Agent endpoint="..." />` 直接传入地址，则无需配置该环境变量，组件参数优先。

以 Platform 示例为例，文件位置是：

```text
AgentUICreator/
└── examples/
    └── creator-host-sandbox/
        ├── package.json
        ├── .env.example
        ├── .env.local       ← 在这里创建，与本示例的 package.json 同级
        └── src/
            └── AgentMount.tsx
```

1. 从仓库根目录运行 `pnpm dev` 启动 Creator，再在另一个终端运行 `pnpm dev:host-sandbox` 启动示例。
2. 打开 `http://localhost:5176`，点击右上角 **Creator Agent**，打开 **Mock Agent** 面板并启动服务，复制实际地址。已有真实 AG-UI 后端时直接使用其完整地址。
3. 在 `examples/creator-host-sandbox/.env.local` 中填写：

   ```dotenv
   VITE_AGENT_ENDPOINT=从Mock面板复制的完整地址
   ```

   将等号右边替换为实际 URL，不能保留占位文字。可从同目录 `.env.example` 创建 `.env.local`；已有 `.env.local` 时仅编辑对应配置，不覆盖其他内容。
4. 停止并重新运行 `pnpm dev:host-sandbox`，再刷新示例页面。无需重启 Creator。

`.env.local` 属于**用户前端工程**，不要放在本仓库根目录，不要将此配置写到 Creator 的 `.env.creator.local`。示例的 `src/AgentMount.tsx` 默认使用 `<Agent />`，会读取这项环境变量；如果你已经写了 `<Agent endpoint="..." />`，应修改组件中的地址，或去掉这个参数后使用环境变量。

其他两个示例分别使用自己的 `examples/creator-assistant-host/.env.local` 和 `examples/creator-embedded-host/.env.local`，修改后重启对应示例的开发服务。三个示例均提供 `.env.example`；本地 `.env.local` 不提交到 Git。

Mock 服务停止后该地址不可用，再次启动需要复制新地址并更新 `.env.local`、重启示例。没有配置地址时默认请求本示例的 `/agent`；该路径没有后端服务就会返回 HTTP 404。

## Ownership and reset

Each Host owns its `src/App.tsx`, `src/AgentMount.tsx`, `src/main.tsx`, `src/host.css`, Vite config, package file, and `scripts/ui-project-control.ts`. Creator owns `src/agent-ui/**` after initialization; `.agent-ui/**` is control-plane metadata. The Host integrates Agent UI only through `import { Agent } from "./agent-ui"` and `<Agent />`.

The fixed `scripts/ui-project-control.ts` entry is used by the development-only Creator sidecar. These three workspace examples delegate to the shared Project Control implementation in `examples/agent-frontend`; the entry supplies each Host's own project root. It is outside `src/` and is not included in the Host's production bundle. Run `pnpm install` at the workspace root before using Creator so each Host has its local `node_modules/.bin/tsx` executable.

The shared helper scripts under this project's `scripts/` initialize or inspect one named Host and reset only its `.agent-ui` and `src/agent-ui` directories. They reject symlinks and unsafe paths. After reset, the next `dev` or `build` initializes that Host's default Mode again. The Platform Host also keeps its explicit `init:assistant`, `init:embedded`, and `init:platform` scripts for Source Registry experiments; using a different Mode requires reset first and the matching Host layout is only guaranteed in its named example.

Each Host also provides `pnpm verify:ui`, backed by the shared target verifier with that Host's own project root. Creator runs it together with `pnpm typecheck` after edits; it validates the managed model, capability catalog, composition, and Service contracts without writing generated files.

The public-entry test in this project initializes temporary Hosts for all three Modes, executes add/remove actions, reads back composition and verifies the UI, then builds after removing `.agent-ui/**`, covering deployment without Creator metadata.
