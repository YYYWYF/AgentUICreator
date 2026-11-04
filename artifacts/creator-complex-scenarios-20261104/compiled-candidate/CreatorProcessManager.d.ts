import type { CreatorAgentMode } from "./shared.js";
export declare const CREATOR_START_TIMEOUT_MS = 15000;
export declare const CREATOR_STOP_TIMEOUT_MS = 3000;
export declare class CreatorRuntimeError extends Error {
    readonly code: string;
    readonly details?: unknown;
    constructor(code: string, message: string, details?: unknown);
}
export interface CreatorExternalEndpoint {
    host: "127.0.0.1";
    port: number;
    authToken: string;
}
export interface CreatorEndpoint extends CreatorExternalEndpoint {
    agentMode: CreatorAgentMode;
}
export interface CreatorProcessManagerOptions {
    projectRoot: string;
    configRoot?: string | undefined;
    skillsRoot?: string | undefined;
    allowExternalEndpoint?: boolean | undefined;
    environment?: NodeJS.ProcessEnv | undefined;
    startupTimeoutMs?: number | undefined;
    stopTimeoutMs?: number | undefined;
    log?: ((message: string) => void) | undefined;
}
export declare function resolveConfiguredCreatorEndpoint({ endpoint, authToken }: {
    endpoint?: string | undefined;
    authToken?: string | undefined;
}): CreatorExternalEndpoint | undefined;
export declare class CreatorProcessManager {
    #private;
    constructor(options: CreatorProcessManagerOptions);
    get processId(): number | undefined;
    isBusy(): Promise<boolean>;
    ensureStarted(): Promise<CreatorEndpoint>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=CreatorProcessManager.d.ts.map