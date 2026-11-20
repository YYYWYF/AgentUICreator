import type { Plugin } from "vite";
import { creatorWatchOptions } from "./nodeWatch.js";
import { createCreatorHttpService, type CreatorHttpServiceOptions } from "./creatorHttpService.js";

export { CREATOR_API_PATH, CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "./shared.js";
export { resolveCreatorAgentMode, type LoadCreatorHostConfigOptions } from "./creatorRuntimeConfig.js";
export {
  CreatorProcessManager, CreatorRuntimeError, resolveConfiguredCreatorEndpoint,
  type CreatorEndpoint, type CreatorExternalEndpoint, type CreatorProcessManagerOptions,
} from "./CreatorProcessManager.js";
export type CreatorDevServerPluginOptions = CreatorHttpServiceOptions;

/** Optional Vite adapter; the standalone launcher uses the same HTTP service. */
export function createCreatorDevServerPlugin(options: CreatorDevServerPluginOptions): Plugin {
  const service = createCreatorHttpService(options);
  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    config(config) {
      const watch = creatorWatchOptions(config.server?.watch);
      return { define: { __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__: JSON.stringify(service.runtimeDiagnosticsEnabled) }, ...(watch === undefined ? {} : { server: { watch } }) };
    },
    configureServer(server) {
      service.mount(server.middlewares);
      server.httpServer?.once("close", () => { void service.dispose(); });
      server.watcher.once("close", () => { void service.dispose(); });
    },
  };
}
