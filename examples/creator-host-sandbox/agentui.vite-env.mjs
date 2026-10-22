import { readFileSync } from "node:fs";
import path from "node:path";

export function createAgentUILocalEnvPlugin() {
  return {
    name: "agent-ui-local-env",
    apply: "serve",
    configResolved(config) {
      // Vite's normal env files and process environment always win.
      if (config.env.VITE_AGENT_ENDPOINT) return;
      let source;
      try { source = readFileSync(path.join(config.root, ".env.agentui.local"), "utf8"); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      // Deliberately read ONE public field, never import/raw-load the file or
      // spread its contents into define, process.env, or import.meta.env.
      for (const line of source.split(/\r?\n/u)) {
        const match = line.match(/^\s*(?:export\s+)?VITE_AGENT_ENDPOINT\s*=\s*(.*)$/u);
        if (!match) continue;
        const raw = match[1].trim();
        const value = raw.startsWith('"') || raw.startsWith("'")
          ? raw.slice(1, raw.indexOf(raw[0], 1)) : raw.split("#", 1)[0].trim();
        if (value) config.env.VITE_AGENT_ENDPOINT = value;
      }
    },
  };
}

export function withAgentUILocalEnv(config) {
  if (typeof config === "function") return async env => withAgentUILocalEnv(await config(env));
  if (config && typeof config.then === "function") return config.then(withAgentUILocalEnv);
  return { ...config, plugins: [...(config?.plugins ?? []), createAgentUILocalEnvPlugin()] };
}
