import { defineConfig } from "vite";
export default defineConfig({ build: { emptyOutDir: false, lib: { entry: "src/host.ts", formats: ["es"], fileName: () => "host.js" }, rollupOptions: { external: ["react", "react-dom/client"] } } });
