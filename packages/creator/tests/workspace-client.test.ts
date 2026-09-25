import { afterEach, describe, expect, it, vi } from "vitest";

import { CREATOR_WORKSPACE_API_PATH } from "../src/workspace/types.js";
import {
  CreatorWorkspaceRequestError,
  chooseWorkspaceProject,
  getWorkspaceSetup,
  initializeWorkspaceProjectRequest,
  validateWorkspaceSetup,
} from "../src/ui/workspaceClient.js";

const setup = { suggestedSourceRoot: "src/agent-ui", modes: [
  { id: "assistant", title: "Assistant", description: "" },
] };
const valid = { valid: true, sourceRoot: { normalized: "src/agent-ui", parentExists: true, targetState: "missing" }, issues: [] };
const ready = { status: "ready", workspace: { id: "A", name: "A", displayPath: "/A" },
  project: { version: "2", mode: "assistant", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" } };

function respond(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace client Setup API", () => {
  it("requests the system folder chooser and distinguishes cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond({ status: "cancelled" })).mockResolvedValueOnce(respond(ready));
    vi.stubGlobal("fetch", fetchMock);
    expect(await chooseWorkspaceProject()).toEqual({ status: "cancelled" });
    expect(await chooseWorkspaceProject()).toEqual(ready);
    expect(fetchMock).toHaveBeenCalledWith(`${CREATOR_WORKSPACE_API_PATH}/choose-directory`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
  });

  it("GETs setup info and forwards an abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(setup));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await getWorkspaceSetup(signal)).toEqual(setup);
    expect(fetchMock).toHaveBeenCalledWith(`${CREATOR_WORKSPACE_API_PATH}/setup`, { signal });
  });

  it("POSTs validation input and reads target state and issues", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(valid));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await validateWorkspaceSetup({ mode: "assistant", sourceRoot: "src/agent-ui" }, signal)).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledWith(`${CREATOR_WORKSPACE_API_PATH}/setup/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "assistant", sourceRoot: "src/agent-ui" }), signal,
    });
  });

  it("POSTs initialize and reads the new workspace state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(ready));
    vi.stubGlobal("fetch", fetchMock);
    expect(await initializeWorkspaceProjectRequest({ mode: "assistant", sourceRoot: "src/agent-ui" })).toEqual(ready);
    expect(fetchMock).toHaveBeenCalledWith(`${CREATOR_WORKSPACE_API_PATH}/initialize`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "assistant", sourceRoot: "src/agent-ui" }),
    });
  });

  it("preserves structured package requirement errors", async () => {
    const details = [{ code: "PACKAGE_MISSING", message: "Missing package" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({
      code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", error: "Package requirements are unmet.", details,
    }, false)));
    await expect(initializeWorkspaceProjectRequest({ mode: "assistant", sourceRoot: "src/agent-ui" }))
      .rejects.toMatchObject({
        name: "CreatorWorkspaceRequestError", code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET",
        message: "Package requirements are unmet.", details,
      } satisfies Partial<CreatorWorkspaceRequestError>);
  });
});
