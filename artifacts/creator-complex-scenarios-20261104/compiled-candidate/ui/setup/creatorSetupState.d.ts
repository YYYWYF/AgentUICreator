import type { CreatorProjectSetupValidation, CreatorWorkspacePublicState } from "../../workspace/types.js";
import { CreatorWorkspaceRequestError } from "../workspaceClient.js";
import type { CreatorSetupDraft } from "./CreatorProjectSetup.js";
export declare function createEmptyCreatorSetupDraft(): CreatorSetupDraft;
export declare function isCreatorSetupValidationUsable(result: CreatorProjectSetupValidation): boolean;
export declare function canInitializeCreatorProject(input: {
    workspaceStatus: CreatorWorkspacePublicState["status"] | null;
    draft: CreatorSetupDraft;
    workspaceBusy: boolean;
    setupNeedsRefresh: boolean;
}): boolean;
export declare function isSetupRequestCurrent(input: {
    requestGeneration: number;
    currentGeneration: number;
    requestWorkspaceId: string;
    currentWorkspaceId?: string | undefined;
    aborted: boolean;
}): boolean;
export declare function shouldRefreshAfterInitializeError(error: unknown): error is CreatorWorkspaceRequestError;
//# sourceMappingURL=creatorSetupState.d.ts.map