# Assistant Host

Run `pnpm dev:assistant-host` from the workspace root and open <http://localhost:5177/>. The user's page fills the browser. The generated Assistant is the bottom-right floating ball; Creator is a separate development-only tab at the top right. Start Creator with `pnpm dev`, then select this directory in its system folder dialog.

On first start, the Host initializes `assistant` Mode at `src/agent-ui`. Host-owned integration lives in `src/AgentMount.tsx`. `pnpm reset` removes only managed Agent UI source and metadata; the next start restores the default Mode.

## 配置 AG-UI 地址

在本示例工程根目录（与 `package.json` 同级）创建或编辑 `.env.local`，可参考同目录 `.env.example`：

```dotenv
VITE_AGENT_ENDPOINT=你的真实后端或Mock面板复制的完整地址
```

替换占位文字后，重启 `pnpm dev:assistant-host`。不要把配置写到仓库根目录或 Creator 的 `.env.creator.local`。`src/AgentMount.tsx` 中显式传入的 `endpoint` 参数优先于环境变量。

Mock 服务由 Creator 面板启动，重新启动 Mock 后需复制新地址。详细步骤见 [Platform 示例配置说明](../creator-host-sandbox/README.md)。
