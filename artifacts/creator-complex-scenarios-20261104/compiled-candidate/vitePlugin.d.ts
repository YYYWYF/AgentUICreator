import type { Plugin } from "vite";
import { type CreatorHttpServiceOptions } from "./creatorHttpService.js";
export { CREATOR_API_PATH, CREATOR_RUNTIME_DIAGNOSTICS_API_PATH, CREATOR_VISUAL_OBSERVATION_API_PATH } from "./shared.js";
export { resolveCreatorAgentMode, type LoadCreatorHostConfigOptions } from "./creatorRuntimeConfig.js";
export { CreatorProcessManager, CreatorRuntimeError, resolveConfiguredCreatorEndpoint, type CreatorEndpoint, type CreatorExternalEndpoint, type CreatorProcessManagerOptions, } from "./CreatorProcessManager.js";
export type CreatorDevServerPluginOptions = CreatorHttpServiceOptions;
/** Optional Vite adapter; the standalone launcher uses the same HTTP service. */
export declare function createCreatorDevServerPlugin(options: CreatorDevServerPluginOptions): Plugin;
//# sourceMappingURL=vitePlugin.d.ts.map