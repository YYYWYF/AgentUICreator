import { ensureManagedOperator } from "@za38.03/agent-ui-creator/project";
import type { CreatorProcessManager } from "../CreatorProcessManager.js";
import type { CreatorProjectInspection, CreatorProjectSetupValidation, CreatorRuntimeManagerFactory, CreatorWorkspaceInitializeInput, CreatorWorkspaceState } from "./types.js";
export declare class CreatorWorkspaceError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class CreatorWorkspaceManager {
    #private;
    constructor(options: {
        inspectProject: (projectRoot: string) => Promise<CreatorProjectInspection>;
        initializeProject: (input: CreatorWorkspaceInitializeInput & {
            projectRoot: string;
        }) => Promise<unknown>;
        validateProjectSetup: (input: CreatorWorkspaceInitializeInput & {
            projectRoot: string;
        }) => Promise<CreatorProjectSetupValidation>;
        suggestSourceRoot: (projectRoot: string) => Promise<string>;
        createRuntimeManager: CreatorRuntimeManagerFactory;
        ensureOperator?: typeof ensureManagedOperator;
        compatibility?: boolean;
    });
    getState(): CreatorWorkspaceState;
    hasActiveCreatorRequests(): boolean;
    runProjectOperation<T>(workspaceId: string, operation: (projectRoot: string) => Promise<T>, options?: {
        mutation?: boolean;
    }): Promise<T>;
    trackRequest(abort: () => void): () => void;
    suggestSourceRoot(): Promise<string>;
    validateSetup(input: CreatorWorkspaceInitializeInput): Promise<CreatorProjectSetupValidation>;
    initializeProject(input: CreatorWorkspaceInitializeInput): Promise<CreatorWorkspaceState>;
    selectProject(projectRoot: string): Promise<CreatorWorkspaceState>;
    buildCompatibility(): Promise<unknown>;
    refresh(): Promise<CreatorWorkspaceState>;
    clear(): Promise<void>;
    ensureCreatorRuntime(): CreatorProcessManager;
}
//# sourceMappingURL=CreatorWorkspaceManager.d.ts.map