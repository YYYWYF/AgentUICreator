import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  if (command === "build" && !env.VITE_AGENT_ENDPOINT?.trim()) {
    throw new Error(
      "VITE_AGENT_ENDPOINT is required for a production Agent Frontend build.",
    );
  }

  return { plugins: [react()] };
});
