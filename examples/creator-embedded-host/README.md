# Embedded Host

Run `pnpm dev:embedded-host` from the workspace root and open <http://localhost:5178/>. The user's document fills the left two thirds; the generated Embedded Agent fills the right third. Creator is a separate development-only tab at the top right. Start Creator with `pnpm dev`, then select this directory in its system folder dialog.

On first start, the Host initializes `embedded` Mode at `src/agent-ui`. The Host owns the split layout and its `src/AgentMount.tsx` integration point. `pnpm reset` removes only managed Agent UI source and metadata; the next start restores the default Mode.
