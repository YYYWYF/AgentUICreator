import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import { createCreatorHostPreviewPlugin } from "@agent-ui/creator/host-preview/vite";
import hostConfig from "../../examples/creator-host-sandbox/vite.config";

/** Workbench-only overlay; the real Host config remains Creator-independent. */
export default defineConfig(mergeConfig(hostConfig, {
  root: fileURLToPath(new URL("../../examples/creator-host-sandbox", import.meta.url)),
  plugins: [createCreatorHostPreviewPlugin()],
}));
