import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { createCreatorDevServerPlugin } from "../../packages/creator/src/vitePlugin.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const frontendRoot = path.join(workspaceRoot, "examples/agent-frontend");

export default defineConfig({
  envDir: frontendRoot,
  plugins: [
    react(),
    createCreatorDevServerPlugin({
      projectRoot: frontendRoot,
      configRoot: workspaceRoot,
    }),
  ],
  resolve: {
    alias: {
      "@agent-ui/creator/ui": path.join(
        workspaceRoot,
        "packages/creator/src/ui/CreatorWorkbench.tsx",
      ),
      "@agent-ui/creator/runtime-diagnostics": path.join(
        workspaceRoot,
        "packages/creator/src/runtime-diagnostics/runtimeDiagnosticReporter.ts",
      ),
      "@agent-ui/example-agent-frontend/App": path.join(
        frontendRoot,
        "src/App.tsx",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    fs: { allow: [workspaceRoot] },
  },
});
