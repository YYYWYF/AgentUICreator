import { createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios, withPreviewAgentState } from "@agent-ui/mock-agent";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { runtimeAliases } from "./vite-runtime-aliases";


const creatorDockPlugin: Plugin = {
  name: "creator-host-sandbox-dock",
  apply: "serve",
  transformIndexHtml() {
    return [{ tag: "script", attrs: { type: "module", src: "/dev/creator-dock.ts" }, injectTo: "body" }];
  },
};


export default defineConfig({
  plugins: [react(), tailwindcss(), creatorDockPlugin, createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios.map(withPreviewAgentState), defaultScenarioId: "reasoning-tool-success" }), createMockConversationApiVitePlugin({ endpoint: "/__agent-ui/mock-data" })],
  resolve: { alias: runtimeAliases },
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
});
