import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Creator supplies optional development mocks; production builds only need frontend packages.
const mockSpecifier = "@za38.03/agent-ui-creator/mock-agent";
const mockPlugins = process.env.NODE_ENV === "production" ? [] : await import(mockSpecifier)
  .then(({ createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios }) => [createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios, defaultScenarioId: "reasoning-tool-success" }), createMockConversationApiVitePlugin({ endpoint: "/api" })])
  .catch(error => { if (error?.code === "ERR_MODULE_NOT_FOUND") return []; throw error; });

export default defineConfig({ plugins: [vue(), ...mockPlugins] });
