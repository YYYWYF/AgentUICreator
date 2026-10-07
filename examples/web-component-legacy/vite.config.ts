import { defineConfig } from "vite";
import { copyFileSync, readFileSync, mkdirSync } from "node:fs";
import { createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios } from "@agent-ui/mock-agent";
const bundle = new URL("../../packages/web-component/dist/agent-ui.js", import.meta.url);
export default defineConfig({ plugins: [
  createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios, defaultScenarioId: "reasoning-tool-success" }),
  createMockConversationApiVitePlugin({ endpoint: "/api" }),
  { name: "standalone-agent-ui", configureServer(server) {
    server.middlewares.use("/agent-ui.js", (_request, response) => { response.setHeader("Content-Type", "text/javascript"); response.end(readFileSync(bundle)); });
  }, closeBundle() { mkdirSync("dist", { recursive: true }); copyFileSync(bundle, "dist/agent-ui.js"); } },
] });
