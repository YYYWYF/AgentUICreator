# Assistant Host

Run `pnpm dev:assistant-host` from the workspace root and open <http://localhost:5177/>. The user's page fills the browser. The generated Assistant is the bottom-right floating ball; Creator is a separate development-only tab at the top right. Start Creator with `pnpm dev`, then select this directory in its system folder dialog.

On first start, the Host initializes `assistant` Mode at `src/agent-ui`. Host-owned integration lives in `src/AgentMount.tsx`. `pnpm reset` removes only managed Agent UI source and metadata; the next start restores the default Mode.
