import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import { createCreatorHostPreviewPlugin } from "@za38.03/agent-ui-creator/host-preview/vite";
import { createCreatorDockVitePlugin } from "@za38.03/agent-ui-creator/dock/vite";
import hostConfig from "../../examples/creator-host-sandbox/vite.config";
import { developmentCachePlugin, developmentReloadPlugin } from "./dev";

// Creator integrations belong only to this development overlay.
export default defineConfig(async env => {
  const config = typeof hostConfig === "function" ? await hostConfig(env) : await hostConfig;
  // Workbench preview history comes from Creator, rather than the standalone Mock.
  const previewConfig = { ...config, plugins: config.plugins?.filter(plugin =>
    (plugin as { name?: string })?.name !== "agent-ui-mock-conversation-api") };
  return mergeConfig(previewConfig, {
    root: fileURLToPath(new URL("../../examples/creator-host-sandbox", import.meta.url)),
    optimizeDeps: { include: ["react", "react-dom/client", "@za38.03/agent-ui-creator > html-to-image"] },
    resolve: { dedupe: ["react", "react-dom"] },
    plugins: [
      developmentCachePlugin(fileURLToPath(new URL("../..", import.meta.url)), "host-preview"),
      developmentReloadPlugin(fileURLToPath(new URL("../..", import.meta.url))),
      createCreatorHostPreviewPlugin(),
      createCreatorDockVitePlugin({ creatorUrl: process.env.VITE_CREATOR_DOCK_URL || "http://127.0.0.1:5174", locale: "zh-CN" }),
    ],
  });
});
