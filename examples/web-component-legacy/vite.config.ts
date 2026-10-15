import { defineConfig } from "vite";
import { copyFileSync, readFileSync, mkdirSync } from "node:fs";
const bundle = new URL("../../packages/web-component/dist/agent-ui.js", import.meta.url);
// Mock service code is optional and only loaded by the development server.
const mockSpecifier = "@za38.03/agent-ui-creator/mock-agent";
const mockPlugins = process.env.NODE_ENV === "production" ? [] : await import(mockSpecifier)
  .then(({ createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios }) => [
    createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios, defaultScenarioId: "reasoning-tool-success" }),
    createMockConversationApiVitePlugin({ endpoint: "/api" }),
  ]).catch(error => { if (error?.code === "ERR_MODULE_NOT_FOUND") return []; throw error; });
export default defineConfig({ plugins: [
  ...mockPlugins,
  { name: "standalone-agent-ui", configureServer(server) {
    server.middlewares.use("/agent-ui.js", (_request, response) => { response.setHeader("Content-Type", "text/javascript"); response.end(readFileSync(bundle)); });
  }, closeBundle() { mkdirSync("dist", { recursive: true }); copyFileSync(bundle, "dist/agent-ui.js"); } },
] });
