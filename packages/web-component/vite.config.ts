import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: { entry: "src/register.ts", name: "AgentUIWebComponent", formats: ["es"], fileName: () => "agent-ui.es.js" },
    // All React, assistant-ui, Runtime and official Plugin code is bundled.
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
