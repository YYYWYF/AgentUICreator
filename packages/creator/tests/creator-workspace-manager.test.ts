import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PythonCreatorProcessManager } from "../src/PythonCreatorProcessManager.js";
import { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import { publicWorkspaceState } from "../src/workspace/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), "creator-workspace-"));
  roots.push(value);
  return value;
}

function setupDependencies() {
  return {
    initializeProject: vi.fn(async () => undefined),
    validateProjectSetup: vi.fn(async ({ sourceRoot }: { sourceRoot: string }) => ({
      valid: true, sourceRoot: { normalized: sourceRoot, parentExists: true, targetState: "missing" as const }, issues: [],
    })),
    suggestSourceRoot: vi.fn(async () => "agent-ui"),
  };
}

describe("CreatorWorkspaceManager", () => {
  it("starts empty and only creates a Python manager for ready projects", async () => {
    const createPythonManager = vi.fn(() => ({ ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) }) as unknown as PythonCreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({ status: "uninitialized" }),
      createPythonManager,
    });
    expect(manager.getState()).toEqual({ status: "none" });
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is none");
    expect(await manager.selectProject(await root())).toMatchObject({ status: "uninitialized" });
    expect(createPythonManager).not.toHaveBeenCalled();
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is uninitialized");
  });

  it("disposes A, aborts requests, and binds B to a new Project Root", async () => {
    const managers: Array<{ ensureStarted: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];
    const createPythonManager = vi.fn((_projectRoot: string) => {
      const value = { ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
      managers.push(value);
      return value as unknown as PythonCreatorProcessManager;
    });
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({
        status: "ready", projectConfig: { version: "1", mode: "platform" },
        paths: { sourceRoot: "agent-ui" },
      }),
      createPythonManager,
    });
    const a = await root();
    const b = await root();
    await manager.selectProject(a);
    expect(managers[0]?.ensureStarted).toHaveBeenCalledOnce();
    const abort = vi.fn();
    manager.trackRequest(abort);
    await manager.selectProject(b);
    expect(abort).toHaveBeenCalledOnce();
    expect(managers[0]?.dispose).toHaveBeenCalledOnce();
    expect(managers[1]?.ensureStarted).toHaveBeenCalledOnce();
    expect(createPythonManager.mock.calls.map(([projectRoot]) => projectRoot)).toEqual([a, b]);
    expect(publicWorkspaceState(manager.getState())).not.toHaveProperty("workspace.projectRoot");
    await manager.clear();
    expect(managers[1]?.dispose).toHaveBeenCalledOnce();
    expect(manager.getState()).toEqual({ status: "none" });
  });

  it("keeps broken workspaces closed to Creator requests", async () => {
    const createPythonManager = vi.fn();
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({ status: "broken", issues: [{ code: "BAD_CONFIG", message: "invalid" }] }),
      createPythonManager,
    });
    expect(await manager.selectProject(await root())).toMatchObject({ status: "broken" });
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is broken");
    expect(createPythonManager).not.toHaveBeenCalled();
  });

  it("keeps a ready project ready when Python fails and recovers on refresh", async () => {
    let available = false;
    const createPythonManager = vi.fn(() => ({
      ensureStarted: vi.fn(async () => {
        if (!available) throw Object.assign(new Error("Python executable missing"), { code: "CREATOR_PYTHON_RUNTIME_MISSING" });
      }),
      dispose: vi.fn(async () => undefined),
    }) as unknown as PythonCreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({
        status: "ready", projectConfig: { version: "2", mode: "assistant", sourceRoot: "src/agent-ui" },
        paths: { sourceRoot: "src/agent-ui" },
      }),
      createPythonManager,
    });
    const selected = await manager.selectProject(await root());
    expect(selected).toMatchObject({ status: "ready", runtime: { status: "unavailable", code: "CREATOR_PYTHON_RUNTIME_MISSING" } });
    expect(publicWorkspaceState(selected)).toMatchObject({ status: "ready", project: { sourceRoot: "src/agent-ui" }, runtime: { status: "unavailable" } });
    try {
      manager.ensureCreatorRuntime();
      throw new Error("Expected Creator runtime to be unavailable");
    } catch (error) {
      expect(error).toMatchObject({ code: "CREATOR_RUNTIME_UNAVAILABLE" });
    }

    available = true;
    expect(await manager.refresh()).toMatchObject({ status: "ready", runtime: { status: "ready" } });
    expect(manager.ensureCreatorRuntime()).toBeDefined();
    expect(createPythonManager).toHaveBeenCalledTimes(2);
  });

  it("initializes the selected root and keeps its workspace identity while starting Python", async () => {
    const projectRoot = await root();
    let initialized = false;
    const setup = setupDependencies();
    setup.initializeProject.mockImplementation(async () => { initialized = true; return undefined; });
    const createPythonManager = vi.fn(() => ({ ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) }) as unknown as PythonCreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setup,
      inspectProject: async () => initialized ? {
        status: "ready" as const,
        projectConfig: { version: "2" as const, mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
        warnings: [{ code: "RECOVERY", message: "refresh required", severity: "warning" as const }],
      } : { status: "uninitialized" as const },
      createPythonManager,
    });
    const selected = await manager.selectProject(projectRoot);
    expect(await manager.suggestSourceRoot()).toBe("agent-ui");
    expect(await manager.validateSetup({ mode: "assistant", sourceRoot: "agent-ui" })).toMatchObject({ valid: true });
    const ready = await manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" });
    expect(setup.initializeProject).toHaveBeenCalledWith({ projectRoot, mode: "assistant", sourceRoot: "agent-ui" });
    expect(ready).toMatchObject({ status: "ready", workspace: { id: selected.status === "none" ? "" : selected.workspace.id }, runtime: { status: "ready" } });
    expect(publicWorkspaceState(ready)).toMatchObject({ warnings: [{ code: "RECOVERY" }] });
    expect(createPythonManager).toHaveBeenCalledOnce();
  });

  it("keeps the committed project ready when Python startup fails", async () => {
    let initialized = false;
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      initializeProject: async () => { initialized = true; },
      inspectProject: async () => initialized ? {
        status: "ready" as const,
        projectConfig: { version: "2" as const, mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
      } : { status: "uninitialized" as const },
      createPythonManager: () => ({ ensureStarted: async () => { throw new Error("Python unavailable"); }, dispose: async () => undefined }) as unknown as PythonCreatorProcessManager,
    });
    await manager.selectProject(await root());
    expect(await manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" }))
      .toMatchObject({ status: "ready", runtime: { status: "unavailable" } });
  });

  it("rejects setup outside uninitialized and serializes initialize with clear", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let initialized = false;
    const setup = setupDependencies();
    setup.initializeProject.mockImplementation(async () => { signalStarted(); await pending; initialized = true; return undefined; });
    const manager = new CreatorWorkspaceManager({
      ...setup,
      inspectProject: async () => initialized ? {
        status: "ready" as const,
        projectConfig: { version: "2" as const, mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
      } : { status: "uninitialized" as const },
      createPythonManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as PythonCreatorProcessManager,
    });
    await expect(manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" })).rejects.toMatchObject({ code: "CREATOR_WORKSPACE_REQUIRED" });
    await manager.selectProject(await root());
    const initialization = manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" });
    await started;
    const clearing = manager.clear();
    expect(manager.getState().status).toBe("uninitialized");
    release();
    expect((await initialization).status).toBe("ready");
    await clearing;
    expect(manager.getState()).toEqual({ status: "none" });
  });

  it.each(["ready", "legacy", "broken"] as const)("rejects initialization from %s", async (status) => {
    const setup = setupDependencies();
    const manager = new CreatorWorkspaceManager({
      ...setup,
      inspectProject: async () => status === "broken"
        ? { status: "broken", issues: [{ code: "BAD_CONFIG", message: "invalid" }] }
        : { status, projectConfig: { version: "1", mode: "platform" }, paths: { sourceRoot: "agent-ui" } },
      createPythonManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as PythonCreatorProcessManager,
    });
    await manager.selectProject(await root());
    await expect(manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" })).rejects.toMatchObject({
      code: status === "broken" ? "AGENT_UI_PROJECT_INVALID_STATE" : "AGENT_UI_PROJECT_ALREADY_INITIALIZED",
    });
    expect(setup.initializeProject).not.toHaveBeenCalled();
  });

  it("leaves setup after a committed postcondition failure", async () => {
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      initializeProject: async () => { throw Object.assign(new Error("committed inspection failed"), { code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED" }); },
      inspectProject: async () => ({ status: "uninitialized" }),
      createPythonManager: () => { throw new Error("should not start Python"); },
    });
    await manager.selectProject(await root());
    await expect(manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" })).rejects.toMatchObject({
      code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
    });
    expect(manager.getState().status).toBe("broken");
  });
});
