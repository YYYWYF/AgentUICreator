import { describe, expect, it } from "vitest";

import type { CreatorProjectSetupValidation } from "../src/workspace/types.js";
import { CreatorWorkspaceRequestError } from "../src/ui/workspaceClient.js";
import {
  canInitializeCreatorProject,
  createEmptyCreatorSetupDraft,
  isCreatorSetupValidationUsable,
  isSetupRequestCurrent,
  shouldRefreshAfterInitializeError,
} from "../src/ui/setup/creatorSetupState.js";

function validation(targetState: CreatorProjectSetupValidation["sourceRoot"]["targetState"], valid = true): CreatorProjectSetupValidation {
  return { valid, sourceRoot: { normalized: "src/agent-ui", parentExists: true, targetState }, issues: [] };
}

describe("Creator Setup state", () => {
  it("starts without a mode or validation", () => {
    expect(createEmptyCreatorSetupDraft()).toEqual({
      mode: null, sourceRoot: "", validation: { status: "idle" }, initializing: false, error: null,
    });
  });

  it.each([
    ["missing", true, true],
    ["empty", true, true],
    ["managed", true, false],
    ["occupied", true, false],
    ["missing", false, false],
  ] as const)("accepts target %s with valid=%s: %s", (target, valid, usable) => {
    expect(isCreatorSetupValidationUsable(validation(target, valid))).toBe(usable);
  });

  it("requires an uninitialized, valid, idle workspace before Initialize", () => {
    const draft = { ...createEmptyCreatorSetupDraft(), mode: "assistant" as const,
      sourceRoot: "src/agent-ui", validation: { status: "valid" as const, result: validation("missing") } };
    const input = { workspaceStatus: "uninitialized" as const, draft, workspaceBusy: false, setupNeedsRefresh: false };
    expect(canInitializeCreatorProject(input)).toBe(true);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, mode: null } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, validation: { status: "idle" } } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, validation: { status: "validating" } } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, validation: { status: "invalid", result: validation("occupied") } } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, validation: { status: "valid", result: validation("occupied") } } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, draft: { ...draft, initializing: true } })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, workspaceBusy: true })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, setupNeedsRefresh: true })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, workspaceStatus: "ready" })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, workspaceStatus: "broken" })).toBe(false);
    expect(canInitializeCreatorProject({ ...input, workspaceStatus: "none" })).toBe(false);
  });

  it("ignores stale generations, other workspaces, and aborted responses", () => {
    const request = { requestGeneration: 2, currentGeneration: 2, requestWorkspaceId: "A", currentWorkspaceId: "A", aborted: false };
    expect(isSetupRequestCurrent(request)).toBe(true);
    expect(isSetupRequestCurrent({ ...request, currentGeneration: 3 })).toBe(false);
    expect(isSetupRequestCurrent({ ...request, currentWorkspaceId: "B" })).toBe(false);
    expect(isSetupRequestCurrent({ ...request, currentWorkspaceId: undefined })).toBe(false);
    expect(isSetupRequestCurrent({ ...request, aborted: true })).toBe(false);
  });

  it("refreshes only after an initialization postcondition failure", () => {
    const error = (code: string) => new CreatorWorkspaceRequestError(code, { code });
    expect(shouldRefreshAfterInitializeError(error("AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED"))).toBe(true);
    expect(shouldRefreshAfterInitializeError(error("AGENT_UI_PACKAGE_REQUIREMENTS_UNMET"))).toBe(false);
    expect(shouldRefreshAfterInitializeError(error("AGENT_UI_SOURCE_ROOT_NOT_EMPTY"))).toBe(false);
    expect(shouldRefreshAfterInitializeError(new Error("AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED"))).toBe(false);
  });
});
