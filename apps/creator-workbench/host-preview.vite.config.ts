import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import { createCreatorHostPreviewPlugin } from "@za38.03/agent-ui-creator/host-preview/vite";
import hostConfig from "../../examples/web-component-vue3/vite.config";

/** Workbench-only overlay; the real Host config remains Creator-independent. */
// Standalone examples retain their demos; Creator Preview exercises Creator-owned history.
const previewHostConfig = { ...hostConfig, plugins: hostConfig.plugins?.filter(plugin =>
  (plugin as Plugin)?.name !== "agent-ui-mock-conversation-api") };
export default defineConfig(mergeConfig(previewHostConfig, {
  root: fileURLToPath(new URL("../../examples/web-component-vue3", import.meta.url)),
  plugins: [createCreatorHostPreviewPlugin()],
}));
