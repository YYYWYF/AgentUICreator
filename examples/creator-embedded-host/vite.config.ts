import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { runtimeAliases } from "./vite-runtime-aliases";


const creatorDockPlugin: Plugin = {
  name: "creator-embedded-host-dock",
  apply: "serve",
  transformIndexHtml() {
    return [{ tag: "script", attrs: { type: "module", src: "/dev/creator-dock.ts" }, injectTo: "body" }];
  },
};



// Creator supplies optional development mocks; production builds only need frontend packages.
const mockSpecifier = "@za38.03/agent-ui-creator/mock-agent";
const mockPlugins = process.env.NODE_ENV === "production" ? [] : await import(mockSpecifier)
  .then(({ createMockAgentVitePlugin, createMockConversationApiVitePlugin, showcaseMockScenarios, withPreviewAgentState }) => [createMockAgentVitePlugin({ endpoint: "/agent", scenarios: showcaseMockScenarios.map(withPreviewAgentState), defaultScenarioId: "reasoning-tool-success" }), createMockConversationApiVitePlugin({ endpoint: "/__agent-ui/mock-data" })])
  .catch(error => { if (error?.code === "ERR_MODULE_NOT_FOUND") return []; throw error; });

export default defineConfig({
  plugins: [react(), tailwindcss(), creatorDockPlugin, ...mockPlugins],
  resolve: { alias: runtimeAliases },
  // Optional screenshot fixtures use their own config and package resolver.
  optimizeDeps: { entries: ["index.html", "style-isolation.html"] },
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
});
