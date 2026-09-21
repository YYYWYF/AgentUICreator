import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  builtinMockScenarios,
  createMockAgentVitePlugin,
} from "../../packages/mock-agent/src/index";
import { defineConfig } from "vite";

import { createCreatorDevServerPlugin } from "../../packages/creator/src/vitePlugin.js";
import { createMockConversationApiVitePlugin } from "../../examples/agent-frontend/dev-mock/conversations/vite-plugin";
import { previewAgentState } from "../../examples/agent-frontend/src/preview-data";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const frontendRoot = path.join(workspaceRoot, "examples/agent-frontend");

export default defineConfig({
  envDir: frontendRoot,
  plugins: [
    react(),
    tailwindcss(),
    createMockAgentVitePlugin({
      endpoint: "/__agent-ui/mock",
      scenarios: builtinMockScenarios.map((scenario) => ({
        ...scenario,
        ...(scenario.initialState === undefined
          ? { initialState: previewAgentState }
          : {}),
      })),
      defaultScenarioId: "reasoning-tool-success",
    }),
    createMockConversationApiVitePlugin({
      endpoint: "/__agent-ui/mock-data",
    }),
    createCreatorDevServerPlugin({
      projectRoot: frontendRoot,
      configRoot: workspaceRoot,
    }),
  ],
  resolve: {
    alias: {
      "@": path.join(frontendRoot, "src"),
      "@agent-ui/react/styles.css": path.join(
        workspaceRoot,
        "packages/react/src/styles.css",
      ),
      "@agent-ui/creator/ui": path.join(
        workspaceRoot,
        "packages/creator/src/ui/CreatorWorkbench.tsx",
      ),
      "@agent-ui/creator/runtime-diagnostics": path.join(
        workspaceRoot,
        "packages/creator/src/runtime-diagnostics/runtimeDiagnosticReporter.ts",
      ),
      "@agent-ui/creator/visual-observation": path.join(
        workspaceRoot,
        "packages/creator/src/visual-observation/VisualObservationReporter.ts",
      ),
      "@agent-ui/example-agent-frontend/App": path.join(
        frontendRoot,
        "src/App.tsx",
      ),
      "@agent-ui/react": path.join(
        workspaceRoot,
        "packages/react/src/index.ts",
      ),
      "@agent-ui/runtime-conversation": path.join(
        workspaceRoot,
        "packages/runtime-conversation/src/index.ts",
      ),
      "@agent-ui/runtime-core/testing": path.join(
        workspaceRoot,
        "packages/runtime-core/src/testing/index.ts",
      ),
      "@agent-ui/runtime-core": path.join(
        workspaceRoot,
        "packages/runtime-core/src/index.ts",
      ),
      "@agent-ui/runtime-react": path.join(
        workspaceRoot,
        "packages/runtime-react/src/index.ts",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    fs: { allow: [workspaceRoot] },
  },
});
