import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export const runtimeAliases = {
  "@agent-ui/react/styles.css": `${workspaceRoot}/packages/react/src/styles.css`,
  "@agent-ui/react": `${workspaceRoot}/packages/react/src/index.ts`,
  "@agent-ui/runtime-conversation": `${workspaceRoot}/packages/runtime-conversation/src/index.ts`,
  "@agent-ui/runtime-core": `${workspaceRoot}/packages/runtime-core/src/index.ts`,
  "@agent-ui/runtime-react": `${workspaceRoot}/packages/runtime-react/src/index.ts`,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: runtimeAliases },
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
});
