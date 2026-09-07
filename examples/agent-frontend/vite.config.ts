import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import {
  builtinMockScenarios,
  createMockAgentVitePlugin,
} from "../../packages/mock-agent/src/index";
import { defineConfig, loadEnv } from "vite";

import { previewAgentState } from "./src/preview-data";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  if (command === "build" && !env.VITE_AGENT_ENDPOINT?.trim()) {
    throw new Error(
      "VITE_AGENT_ENDPOINT is required for a production Agent Frontend build.",
    );
  }

  return {
    plugins: [
      react(),
      createMockAgentVitePlugin({
        endpoint: "/__agent-ui/mock",
        scenarios: builtinMockScenarios.map((scenario) => ({
          ...scenario,
          initialState: previewAgentState,
        })),
        defaultScenarioId: "reasoning-tool-success",
      }),
    ],
    resolve: {
      alias: {
        "@agent-ui/runtime-agui": path.join(
          workspaceRoot,
          "packages/runtime-agui/src/index.ts",
        ),
        "@agent-ui/runtime-core/testing": path.join(
          workspaceRoot,
          "packages/runtime-core/src/testing/index.ts",
        ),
        "@agent-ui/runtime-core": path.join(
          workspaceRoot,
          "packages/runtime-core/src/index.ts",
        ),
      },
    },
  };
});
