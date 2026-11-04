import { type CreatorLocaleMessages } from "./i18n/locale.js";
import { type CreatorProjectIssue, type CreatorProjectSetupValidation, type CreatorWorkspaceInitializeInput, type CreatorWorkspacePublicState, type CreatorWorkspaceSetupInfo } from "../workspace/types.js";
interface CreatorWorkspaceApiErrorBody {
    code?: string;
    error?: string;
    details?: CreatorProjectIssue[];
}
export declare class CreatorWorkspaceRequestError extends Error {
    readonly code: string | undefined;
    readonly details: readonly CreatorProjectIssue[] | undefined;
    constructor(message: string, body: CreatorWorkspaceApiErrorBody);
}
export declare const getWorkspaceState: (localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspacePublicState>;
export declare const selectWorkspaceProject: (projectRoot: string, localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspacePublicState>;
export declare const chooseWorkspaceProject: (localeMessages?: CreatorLocaleMessages) => Promise<{
    readonly status: "cancelled";
} | CreatorWorkspacePublicState>;
export declare const clearWorkspaceProject: (localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspacePublicState>;
export declare const refreshWorkspaceProject: (localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspacePublicState>;
export declare const getWorkspaceSetup: (signal?: AbortSignal, localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspaceSetupInfo>;
export declare const validateWorkspaceSetup: (input: CreatorWorkspaceInitializeInput, signal?: AbortSignal, localeMessages?: CreatorLocaleMessages) => Promise<CreatorProjectSetupValidation>;
export declare const initializeWorkspaceProjectRequest: (input: CreatorWorkspaceInitializeInput, localeMessages?: CreatorLocaleMessages) => Promise<CreatorWorkspacePublicState>;
export declare function executeCreatorCommand(workspaceId: string, request: import("../commands/types.js").CreatorCommandExecuteRequest, localeMessages?: CreatorLocaleMessages): Promise<import("../commands/types.js").CreatorCommandResult>;
export declare const buildCompatibilityProjectRequest: (messages?: CreatorLocaleMessages) => Promise<unknown>;
export {};
//# sourceMappingURL=workspaceClient.d.ts.map