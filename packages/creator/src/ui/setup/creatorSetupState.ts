import type { CreatorProjectSetupValidation, CreatorWorkspacePublicState } from "../../workspace/types.js";
import { CreatorWorkspaceRequestError } from "../workspaceClient.js";
import type { CreatorSetupDraft } from "./CreatorProjectSetup.js";

export function createEmptyCreatorSetupDraft(): CreatorSetupDraft {
  return {
    mode: null,
    sourceRoot: "",
    validation: { status: "idle" },
    initializing: false,
    error: null,
  };
}

export function isCreatorSetupValidationUsable(result: CreatorProjectSetupValidation): boolean {
  return result.valid &&
    (result.sourceRoot.targetState === "missing" || result.sourceRoot.targetState === "empty");
}

export function canInitializeCreatorProject(input: {
  workspaceStatus: CreatorWorkspacePublicState["status"] | null;
  draft: CreatorSetupDraft;
  workspaceBusy: boolean;
  setupNeedsRefresh: boolean;
}): boolean {
  return input.workspaceStatus === "uninitialized" &&
    input.draft.mode !== null &&
    input.draft.validation.status === "valid" &&
    isCreatorSetupValidationUsable(input.draft.validation.result) &&
    !input.draft.initializing && !input.workspaceBusy && !input.setupNeedsRefresh;
}

export function isSetupRequestCurrent(input: {
  requestGeneration: number;
  currentGeneration: number;
  requestWorkspaceId: string;
  currentWorkspaceId?: string | undefined;
  aborted: boolean;
}): boolean {
  return !input.aborted &&
    input.requestGeneration === input.currentGeneration &&
    input.requestWorkspaceId === input.currentWorkspaceId;
}

export function shouldRefreshAfterInitializeError(error: unknown): error is CreatorWorkspaceRequestError {
  return error instanceof CreatorWorkspaceRequestError &&
    error.code === "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED";
}
