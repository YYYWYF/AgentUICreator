import { withAgentUILocalEnv } from "./agentui.vite-env.mjs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Mock tooling is loaded only by the development server, never by a build.
export default withAgentUILocalEnv(defineConfig(async ({ command }) => {
  const mockSpecifier = "@za38.03/agent-ui-creator/mock-agent";
  const mocks = command === "serve" ? await import(mockSpecifier).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") return undefined;
    throw error;
  }) : undefined;
  return {
    plugins: [
      react(), tailwindcss(),
      ...(mocks ? [
        mocks.createMockAgentVitePlugin({ endpoint: "/agent", scenarios: mocks.showcaseMockScenarios, defaultScenarioId: "reasoning-tool-success" }),
        mocks.createMockConversationApiVitePlugin({ endpoint: "/__agent-ui/mock-data" }),
      ] : []),
    ],
  };
}));
