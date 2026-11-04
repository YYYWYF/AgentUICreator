import { createCreatorHttpService } from "./creatorHttpService.js";
export { CREATOR_API_PATH, CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "./shared.js";
export { resolveCreatorAgentMode } from "./creatorRuntimeConfig.js";
export { CreatorProcessManager, CreatorRuntimeError, resolveConfiguredCreatorEndpoint, } from "./CreatorProcessManager.js";
/** Optional Vite adapter; the standalone launcher uses the same HTTP service. */
export function createCreatorDevServerPlugin(options) {
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
//# sourceMappingURL=vitePlugin.js.map