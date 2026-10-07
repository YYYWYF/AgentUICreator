import { defineConfig } from "vite";
export default defineConfig({ build: { emptyOutDir: false, lib: { entry: "src/host.ts", formats: ["es"], fileName: () => "host.js" }, rolldownOptions: { external: ["react", "react-dom/client"] } } });
