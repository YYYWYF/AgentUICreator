import type { Plugin } from "vite";
import { createCreatorHttpService, type CreatorHttpServiceOptions } from "./creatorHttpService.js";

export { CREATOR_API_PATH, CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "./shared.js";
export { resolveCreatorPythonAgentMode, type LoadCreatorHostConfigOptions } from "./creatorRuntimeConfig.js";
export {
  PythonCreatorProcessManager, PythonCreatorRuntimeError, resolveConfiguredCreatorPythonEndpoint,
  type PythonCreatorEndpoint, type PythonCreatorExternalEndpoint, type PythonCreatorProcessManagerOptions,
} from "./PythonCreatorProcessManager.js";
export type CreatorDevServerPluginOptions = CreatorHttpServiceOptions;

/** Optional Vite adapter; the standalone launcher uses the same HTTP service. */
export function createCreatorDevServerPlugin(options: CreatorDevServerPluginOptions): Plugin {
  const service = createCreatorHttpService(options);
  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    config() {
      return { define: { __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__: JSON.stringify(service.runtimeDiagnosticsEnabled) } };
    },
    configureServer(server) {
      service.mount(server.middlewares);
      server.httpServer?.once("close", () => { void service.dispose(); });
      server.watcher.once("close", () => { void service.dispose(); });
    },
  };
}
