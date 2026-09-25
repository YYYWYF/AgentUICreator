import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PythonCreatorProcessManager } from "../src/PythonCreatorProcessManager.js";
import { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import { handleCreatorWorkspaceRequest } from "../src/workspace/workspace-api.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "creator-workspace-api-"));
  roots.push(root);
  return realpath(root);
}

function fixture() {
  let initialized = false;
  const initializeProject = vi.fn(async () => { initialized = true; });
  const validateProjectSetup = vi.fn(async ({ sourceRoot }: { sourceRoot: string }) => ({
    valid: true,
    sourceRoot: { normalized: sourceRoot, parentExists: true, targetState: "missing" as const },
    issues: [],
  }));
  const manager = new CreatorWorkspaceManager({
    initializeProject,
    validateProjectSetup,
    suggestSourceRoot: async () => "src/agent-ui",
    inspectProject: async () => initialized ? {
      status: "ready" as const,
      projectConfig: { version: "2" as const, mode: "assistant" as const, sourceRoot: "src/agent-ui" },
      paths: { sourceRoot: "src/agent-ui" },
    } : { status: "uninitialized" as const },
    createPythonManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as PythonCreatorProcessManager,
  });
  return { manager, initializeProject, validateProjectSetup };
}

async function request(manager: CreatorWorkspaceManager, method: string, route: string, body?: unknown,
  origin = "http://localhost:5174", pickerStartDirectory?: string,
  pickDirectory?: (startDirectory: string) => Promise<string | undefined>) {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  const incoming = Object.assign(stream, {
    method, url: route,
    headers: { host: "localhost:5174", origin },
  }) as unknown as IncomingMessage;
  let output = "";
  const response = {
    statusCode: 200,
    setHeader: vi.fn(),
    end(value: string) { output = value; },
  } as unknown as ServerResponse;
  await handleCreatorWorkspaceRequest(incoming, response, manager, pickerStartDirectory, pickDirectory);
  return { status: response.statusCode, body: JSON.parse(output) as Record<string, unknown> };
}

describe("Creator Workspace setup API", () => {
  it("opens the system folder chooser and keeps the current project on cancellation", async () => {
    const currentRoot = await projectRoot();
    const nextRoot = await projectRoot();
    const { manager } = fixture();
    await manager.selectProject(currentRoot);
    const picker = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(nextRoot);
    expect((await request(manager, "POST", "/choose-directory", {}, undefined, undefined, picker)).body)
      .toEqual({ status: "cancelled" });
    expect(manager.getState()).toMatchObject({ status: "uninitialized", workspace: { projectRoot: currentRoot } });
    const selected = await request(manager, "POST", "/choose-directory", {}, undefined, undefined, picker);
    expect(selected.body).toMatchObject({ status: "uninitialized", workspace: { displayPath: nextRoot } });
    expect(picker).toHaveBeenNthCalledWith(1, currentRoot);
    expect(picker).toHaveBeenNthCalledWith(2, currentRoot);
    expect((await request(manager, "POST", "/choose-directory", {}, "http://evil.example", undefined, picker)).body)
      .toMatchObject({ code: "CREATOR_WORKSPACE_ORIGIN_DENIED" });
    expect(picker).toHaveBeenCalledTimes(2);
  });

  it("selects, suggests, validates, and initializes into a public ready state", async () => {
    const root = await projectRoot();
    const { manager, initializeProject, validateProjectSetup } = fixture();
    const selected = await request(manager, "POST", "/select", { projectRoot: root });
    expect(selected.body).toMatchObject({ status: "uninitialized" });
    const setup = await request(manager, "GET", "/setup");
    expect(setup.body).toMatchObject({ suggestedSourceRoot: "src/agent-ui", modes: [{ id: "assistant" }, { id: "embedded" }, { id: "platform" }] });
    const input = { mode: "assistant", sourceRoot: "src/agent-ui" };
    expect((await request(manager, "POST", "/setup/validate", input)).body).toMatchObject({ valid: true });
    expect(validateProjectSetup).toHaveBeenCalledWith({ ...input, projectRoot: root });
    const ready = await request(manager, "POST", "/initialize", input);
    expect(ready.body).toMatchObject({ status: "ready", project: { mode: "assistant", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" } });
    expect((ready.body.workspace as { id: string }).id).toBe((selected.body.workspace as { id: string }).id);
    expect(ready.body.workspace).not.toHaveProperty("projectRoot");
    expect(initializeProject).toHaveBeenCalledWith({ ...input, projectRoot: root });
    expect((await request(manager, "GET", "/")).body).toMatchObject({ status: "ready" });
  });

  it("rejects cross-origin and malformed setup mutations before calling the initializer", async () => {
    const { manager, initializeProject } = fixture();
    await manager.selectProject(await projectRoot());
    const input = { mode: "assistant", sourceRoot: "src/agent-ui" };
    expect((await request(manager, "POST", "/initialize", input, "http://evil.example")).body)
      .toMatchObject({ code: "CREATOR_WORKSPACE_ORIGIN_DENIED" });
    for (const body of [
      { ...input, projectRoot: "/tmp/other" },
      { mode: "wrong", sourceRoot: "src/agent-ui" },
      { mode: "assistant" },
      { mode: "assistant", sourceRoot: "" },
    ]) {
      const result = await request(manager, "POST", "/initialize", body);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("CREATOR_WORKSPACE_INPUT_INVALID");
    }
    expect(initializeProject).not.toHaveBeenCalled();
  });

  it("returns structured preflight issues without exposing the selected root in details", async () => {
    const root = await projectRoot();
    const manager = new CreatorWorkspaceManager({
      initializeProject: async () => { throw Object.assign(new Error("Package requirements are unmet."), {
        code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET",
        details: [{ code: "PACKAGE_MISSING", message: `Missing package in ${root}/node_modules.` }],
      }); },
      validateProjectSetup: async () => ({ valid: true, sourceRoot: { normalized: "agent-ui", parentExists: true, targetState: "missing" }, issues: [] }),
      suggestSourceRoot: async () => "agent-ui",
      inspectProject: async () => ({ status: "uninitialized" }),
      createPythonManager: () => { throw new Error("should not start Python"); },
    });
    await manager.selectProject(root);
    const result = await request(manager, "POST", "/initialize", { mode: "assistant", sourceRoot: "agent-ui" });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", details: [{ code: "PACKAGE_MISSING" }] });
    expect(JSON.stringify(result.body.details)).not.toContain(root);
  });
});
