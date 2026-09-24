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

describe("CreatorWorkspaceManager", () => {
  it("starts empty and only creates a Python manager for ready projects", async () => {
    const createPythonManager = vi.fn(() => ({ ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) }) as unknown as PythonCreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
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
});
