import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  createMockAgentVitePlugin,
  showcaseMockScenarios,
} from "../../packages/mock-agent/src/index";
import { defineConfig, loadEnv } from "vite";

import { createMockConversationApiVitePlugin } from "./dev-mock/conversations/vite-plugin";
import { withPreviewAgentState } from "./src/mock-scenario-preview";

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
      tailwindcss(),
      createMockAgentVitePlugin({
        endpoint: "/__agent-ui/mock",
        scenarios: showcaseMockScenarios.map(withPreviewAgentState),
        defaultScenarioId: "reasoning-tool-success",
      }),
      createMockConversationApiVitePlugin({
        endpoint: "/__agent-ui/mock-data",
      }),
    ],
    resolve: {
      dedupe: ["@assistant-ui/react-generative-ui"],
      alias: {
        "../../agent-ui/vendor/assistant-ui/generative-ui": path.join(workspaceRoot, "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui"),
        "../generative-ui": path.join(workspaceRoot, "packages/source-registry/registry/items/integration-generative-ui/files/integrations/generative-ui/index.ts"),
        "@": path.join(workspaceRoot, "examples/agent-frontend/src"),
        "@agent-ui/react/styles.css": path.join(
          workspaceRoot,
          "packages/react/src/styles.css",
        ),
        "@agent-ui/source-registry": path.join(
          workspaceRoot,
          "packages/source-registry/src/index.ts",
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
    },
  };
});
