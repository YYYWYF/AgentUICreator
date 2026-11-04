import { type CreatorAgentMode, type CreatorVerificationMode } from "./shared.js";
export declare const CREATOR_HOST_ENV_FILE = ".agent-ui/creator/.env.local";
export interface LoadCreatorHostConfigOptions {
    configRoot?: string | undefined;
    environment?: NodeJS.ProcessEnv | undefined;
}
export declare function readCreatorHostEnvironment(configRoot?: string): Record<string, string | undefined>;
export declare function readCreatorHostConfigValue(configRoot: string | undefined, name: string): string | undefined;
export declare function resolveCreatorAgentMode({ configRoot, environment, }?: LoadCreatorHostConfigOptions): CreatorAgentMode;
export declare function resolveCreatorVerificationMode({ configRoot, environment, }?: LoadCreatorHostConfigOptions): CreatorVerificationMode;
//# sourceMappingURL=creatorRuntimeConfig.d.ts.map