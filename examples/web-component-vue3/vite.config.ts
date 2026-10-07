import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios } from "@agent-ui/mock-agent";
export default defineConfig({ plugins: [vue(), createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios, defaultScenarioId: "reasoning-tool-success" }), createMockConversationApiVitePlugin({ endpoint: "/api" })] });
