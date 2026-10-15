import { build } from "vite";
import { fileURLToPath } from "node:url";

// Build-time only. The installed CLI serves these files without Vite.
// A company Rsbuild configuration can replace this build while retaining dist/browser.
await build({
  configFile: false,
  root: fileURLToPath(new URL("../browser/", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../dist/browser/", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { input: {
      index: fileURLToPath(new URL("../browser/index.html", import.meta.url)),
      dock: fileURLToPath(new URL("../browser/dock.html", import.meta.url)),
    } },
  },
});

await build({
  configFile: false,
  root: fileURLToPath(new URL("../browser/", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../dist/browser/", import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("../browser/dock-client.ts", import.meta.url)),
      name: "AgentUICreatorDock", formats: ["iife"], fileName: () => "dock-client.js",
    },
  },
});
