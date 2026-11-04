import { CreatorWorkspaceRequestError } from "../workspaceClient.js";
export function createEmptyCreatorSetupDraft() {
    return {
        mode: null,
        sourceRoot: "",
        validation: { status: "idle" },
        initializing: false,
        error: null,
    };
}
export function isCreatorSetupValidationUsable(result) {
    return result.valid &&
        (result.sourceRoot.targetState === "missing" || result.sourceRoot.targetState === "empty");
}
export function canInitializeCreatorProject(input) {
    return input.workspaceStatus === "uninitialized" &&
        input.draft.mode !== null &&
        input.draft.validation.status === "valid" &&
        isCreatorSetupValidationUsable(input.draft.validation.result) &&
        !input.draft.initializing && !input.workspaceBusy && !input.setupNeedsRefresh;
}
export function isSetupRequestCurrent(input) {
    return !input.aborted &&
        input.requestGeneration === input.currentGeneration &&
        input.requestWorkspaceId === input.currentWorkspaceId;
}
export function shouldRefreshAfterInitializeError(error) {
    return error instanceof CreatorWorkspaceRequestError &&
        error.code === "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED";
}
//# sourceMappingURL=creatorSetupState.js.map