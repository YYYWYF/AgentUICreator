import { mkdtemp, realpath, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreatorProcessManager } from "../src/CreatorProcessManager.js";
import { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import { publicWorkspaceState } from "../src/workspace/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), "creator-workspace-"));
  roots.push(value);
  return realpath(value);
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
  it("keeps dependency preparation uninitialized without starting the Agent", async () => {
    const createRuntimeManager = vi.fn();
    const inspectProject = vi.fn(async () => ({ status: "uninitialized" as const }));
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject,
      initializeProject: async () => ({ status: "dependencies-prepared" }),
      createRuntimeManager,
    });
    await manager.selectProject(await root());
    expect(await manager.initializeProject({ mode: "platform", sourceRoot: "src/agent-ui", planId: "confirmed" })).toMatchObject({ status: "uninitialized" });
    expect(inspectProject).toHaveBeenCalledTimes(1);
    expect(createRuntimeManager).not.toHaveBeenCalled();
  });
  it("shows the pending-install setup after preparation even if a later Operator inspection would fail", async () => {
    const inspectProject = vi.fn()
      .mockResolvedValueOnce({ status: "uninitialized" })
      .mockRejectedValue(Object.assign(new Error("stale Operator"), { code: "CREATOR_OPERATOR_RESTART_REQUIRED" }));
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(), inspectProject,
      initializeProject: async () => ({ status: "dependencies-prepared" }),
      createRuntimeManager: vi.fn(),
    });
    await manager.selectProject(await root());
    const state = await manager.initializeProject({ mode: "platform", sourceRoot: "src/agent-ui", planId: "confirmed" });
    expect(state.status).toBe("uninitialized");
    expect(inspectProject).toHaveBeenCalledTimes(1);
  });
  it("starts empty and only creates an Agent manager for ready projects", async () => {
    const createRuntimeManager = vi.fn(() => ({ ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) }) as unknown as CreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({ status: "uninitialized" }),
      createRuntimeManager,
    });
    expect(manager.getState()).toEqual({ status: "none" });
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is none");
    expect(await manager.selectProject(await root())).toMatchObject({ status: "uninitialized" });
    expect(createRuntimeManager).not.toHaveBeenCalled();
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is uninitialized");
  });

  it("disposes A, aborts requests, and binds B to a new Project Root", async () => {
    const managers: Array<{ ensureStarted: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];
    const createRuntimeManager = vi.fn((_projectRoot: string) => {
      const value = { ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
      managers.push(value);
      return value as unknown as CreatorProcessManager;
    });
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({
        status: "ready", projectConfig: { mode: "platform", sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
      }),
      createRuntimeManager,
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
    expect(createRuntimeManager.mock.calls.map(([projectRoot]) => projectRoot)).toEqual([a, b]);
    expect(publicWorkspaceState(manager.getState())).not.toHaveProperty("workspace.projectRoot");
    await manager.clear();
    expect(managers[1]?.dispose).toHaveBeenCalledOnce();
    expect(manager.getState()).toEqual({ status: "none" });
  });

  it("keeps the runtime when the selected Project Root is selected again", async () => {
    const runtime = { ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    const createRuntimeManager = vi.fn(() => runtime as unknown as CreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({
        status: "ready", projectConfig: { mode: "assistant", sourceRoot: "src/agent-ui" },
        paths: { sourceRoot: "src/agent-ui" },
      }),
      createRuntimeManager,
    });
    const projectRoot = await root();
    const selected = await manager.selectProject(projectRoot);
    expect(await manager.selectProject(projectRoot)).toBe(selected);
    expect(createRuntimeManager).toHaveBeenCalledOnce();
    expect(runtime.dispose).not.toHaveBeenCalled();
  });

  it("keeps broken workspaces closed to Creator requests", async () => {
    const createRuntimeManager = vi.fn();
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({ status: "broken", issues: [{ code: "BAD_CONFIG", message: "invalid" }] }),
      createRuntimeManager,
    });
    expect(await manager.selectProject(await root())).toMatchObject({ status: "broken" });
    expect(() => manager.ensureCreatorRuntime()).toThrow("workspace status is broken");
    expect(createRuntimeManager).not.toHaveBeenCalled();
  });

  it("starts repair tooling for validated project structure while retaining source errors", async () => {
    const runtime = { ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    const issues = [{ code: "plugin-application-read", message: "invalid application.json", severity: "error" as const }];
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({ status: "broken", issues,
        repairContext: { projectConfig: { mode: "assistant", sourceRoot: "src/ui" }, paths: { sourceRoot: "src/ui" } } }),
      createRuntimeManager: () => runtime as unknown as CreatorProcessManager,
    });
    expect(await manager.selectProject(await root())).toMatchObject({ status: "ready", runtime: { status: "ready" }, warnings: issues });
    expect(manager.ensureCreatorRuntime()).toBe(runtime);
    expect(runtime.ensureStarted).toHaveBeenCalledOnce();
    expect(publicWorkspaceState(manager.getState())).toMatchObject({ warnings: issues });
  });

  it("keeps a ready project ready when the Agent fails and recovers on refresh", async () => {
    let available = false;
    const createRuntimeManager = vi.fn(() => ({
      ensureStarted: vi.fn(async () => {
        if (!available) throw Object.assign(new Error("Agent failed to start"), { code: "CREATOR_START_FAILED" });
      }),
      dispose: vi.fn(async () => undefined),
    }) as unknown as CreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      inspectProject: async () => ({
        status: "ready", projectConfig: { mode: "assistant", sourceRoot: "src/agent-ui" },
        paths: { sourceRoot: "src/agent-ui" },
      }),
      createRuntimeManager,
    });
    const selected = await manager.selectProject(await root());
    expect(selected).toMatchObject({ status: "ready", runtime: { status: "unavailable", code: "CREATOR_START_FAILED" } });
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
    expect(createRuntimeManager).toHaveBeenCalledTimes(2);
  });

  it("initializes the selected root and keeps its workspace identity while starting the Agent", async () => {
    const projectRoot = await root();
    let initialized = false;
    const setup = setupDependencies();
    setup.initializeProject.mockImplementation(async () => { initialized = true; return undefined; });
    const createRuntimeManager = vi.fn(() => ({ ensureStarted: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) }) as unknown as CreatorProcessManager);
    const manager = new CreatorWorkspaceManager({
      ...setup,
      inspectProject: async () => initialized ? {
        status: "ready" as const,
        projectConfig: { mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
        warnings: [{ code: "RECOVERY", message: "refresh required", severity: "warning" as const }],
      } : { status: "uninitialized" as const },
      createRuntimeManager,
    });
    const selected = await manager.selectProject(projectRoot);
    expect(await manager.suggestSourceRoot()).toBe("agent-ui");
    expect(await manager.validateSetup({ mode: "assistant", sourceRoot: "agent-ui" })).toMatchObject({ valid: true, sourceRoot: { absolutePath: path.resolve(projectRoot, "agent-ui") } });
    const ready = await manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" });
    expect(setup.initializeProject).toHaveBeenCalledWith({ projectRoot, mode: "assistant", sourceRoot: "agent-ui" });
    expect(ready).toMatchObject({ status: "ready", workspace: { id: selected.status === "none" ? "" : selected.workspace.id }, runtime: { status: "ready" } });
    expect(publicWorkspaceState(ready)).toMatchObject({ warnings: [{ code: "RECOVERY" }] });
    expect(createRuntimeManager).toHaveBeenCalledOnce();
  });

  it("keeps the committed project ready when Agent startup fails", async () => {
    let initialized = false;
    const manager = new CreatorWorkspaceManager({
      ...setupDependencies(),
      initializeProject: async () => { initialized = true; },
      inspectProject: async () => initialized ? {
        status: "ready" as const,
        projectConfig: { mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
      } : { status: "uninitialized" as const },
      createRuntimeManager: () => ({ ensureStarted: async () => { throw new Error("Agent unavailable"); }, dispose: async () => undefined }) as unknown as CreatorProcessManager,
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
        projectConfig: { mode: "assistant" as const, sourceRoot: "agent-ui" },
        paths: { sourceRoot: "agent-ui" },
      } : { status: "uninitialized" as const },
      createRuntimeManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as CreatorProcessManager,
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

  it.each(["ready", "broken"] as const)("rejects initialization from %s", async (status) => {
    const setup = setupDependencies();
    const manager = new CreatorWorkspaceManager({
      ...setup,
      inspectProject: async () => status === "broken"
        ? { status: "broken", issues: [{ code: "BAD_CONFIG", message: "invalid" }] }
        : { status, projectConfig: { mode: "platform", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } },
      createRuntimeManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as CreatorProcessManager,
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
      createRuntimeManager: () => { throw new Error("should not start the Agent"); },
    });
    await manager.selectProject(await root());
    await expect(manager.initializeProject({ mode: "assistant", sourceRoot: "agent-ui" })).rejects.toMatchObject({
      code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
    });
    expect(manager.getState().status).toBe("broken");
  });
});

it("mutation gate rejects new requests and commands and waits before switching workspace", async () => {
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(),
    inspectProject: async () => ({ status: "ready", projectConfig: { mode: "platform", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } }),
    ensureOperator: vi.fn(async () => ({})) as unknown as typeof import("@za38.03/agent-ui-creator/project").ensureManagedOperator,
    createRuntimeManager: () => ({ ensureStarted: async () => undefined, dispose: async () => undefined }) as unknown as CreatorProcessManager,
  });
  await manager.selectProject(await root());
  const state = manager.getState(); if (state.status !== "ready") throw new Error("fixture");
  const id = state.workspace.id;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const command = manager.runProjectOperation(id, async () => pending, { mutation: true });
  expect(() => manager.trackRequest(() => {})).toThrow("CREATOR_COMMAND_BUSY");
  await expect(manager.runProjectOperation(id, async () => {}, { mutation: true })).rejects.toThrow("CREATOR_COMMAND_BUSY");
  const switchProject = manager.selectProject(await root());
  expect(manager.getState()).toBe(state);
  release(); await command; await switchProject;
  const untrack = manager.trackRequest(() => {});
  const newState = manager.getState(); if (newState.status !== "ready") throw new Error("fixture");
  await expect(manager.runProjectOperation(newState.workspace.id, async () => {}, { mutation: true })).rejects.toThrow("CREATOR_COMMAND_BUSY");
  untrack();
});

it("keeps detached runs busy for mutations and disposes them when switching projects", async () => {
  const dispose = vi.fn(async () => undefined);
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(),
    inspectProject: async () => ({ status: "ready", projectConfig: { mode: "platform", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } }),
    createRuntimeManager: () => ({ ensureStarted: async () => undefined, isBusy: async () => true, dispose }) as unknown as CreatorProcessManager,
  });
  const a = await manager.selectProject(await root()); if (a.status !== "ready") throw new Error("fixture");
  // There are no tracked HTTP requests; the worker still owns an active task.
  const mutate = vi.fn();
  await expect(manager.runProjectOperation(a.workspace.id, mutate, { mutation: true })).rejects.toThrow("CREATOR_COMMAND_BUSY");
  expect(mutate).not.toHaveBeenCalled();
  const b = await manager.selectProject(await root()); if (b.status !== "ready") throw new Error("fixture");
  expect(dispose).toHaveBeenCalledOnce();
  expect(b.workspace.id).not.toBe(a.workspace.id);
  await manager.clear();
});

it("defers development reload for streams, detached work and commands, then closes admission before disposal", async () => {
  let busy = true;
  const dispose = vi.fn(async () => {});
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), ensureOperator: vi.fn(async () => []),
    inspectProject: async () => ({ status: "ready", projectConfig: { mode: "platform", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } }),
    createRuntimeManager: () => ({ ensureStarted: async () => {}, isBusy: async () => busy, dispose }) as unknown as CreatorProcessManager,
  });
  const selected = await manager.selectProject(await root());
  if (selected.status !== "ready") throw new Error("fixture");
  expect(await manager.prepareForDevelopmentRestart()).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  busy = false;
  const untrack = manager.trackRequest(() => {});
  expect(await manager.prepareForDevelopmentRestart()).toBe(false);
  untrack();
  let release!: () => void;
  const command = manager.runProjectOperation(selected.workspace.id, () => new Promise<void>(resolve => { release = resolve; }), { mutation: true });
  expect(await manager.prepareForDevelopmentRestart()).toBe(false);
  await Promise.resolve();
  release(); await command;
  expect(await manager.prepareForDevelopmentRestart()).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
  expect(() => manager.trackRequest(() => {})).toThrow("CREATOR_COMMAND_BUSY");
  await expect(manager.selectProject(selected.workspace.projectRoot)).rejects.toThrow("CREATOR_COMMAND_BUSY");
  expect(await manager.prepareForDevelopmentRestart()).toBe(true);
  await manager.clear();
  expect(dispose).toHaveBeenCalledOnce();
  expect(manager.getState()).toEqual({ status: "none" });
});

it("does not restart when a request arrives during the asynchronous worker health check", async () => {
  let checked!: (busy: boolean) => void;
  const dispose = vi.fn(async () => {});
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), ensureOperator: vi.fn(async () => []),
    inspectProject: async () => ({ status: "ready", projectConfig: { mode: "platform", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } }),
    createRuntimeManager: () => ({ ensureStarted: async () => {}, isBusy: () => new Promise<boolean>(resolve => { checked = resolve; }), dispose }) as unknown as CreatorProcessManager,
  });
  await manager.selectProject(await root());
  const preparing = manager.prepareForDevelopmentRestart();
  await Promise.resolve();
  const untrack = manager.trackRequest(() => {});
  checked(false);
  expect(await preparing).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  untrack(); await manager.clear();
});

it("reports stale Operator as a tool failure without installing control or starting the Agent", async () => {
  const ensureOperator = vi.fn();
  const createRuntimeManager = vi.fn();
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), ensureOperator, createRuntimeManager,
    inspectProject: async () => { throw Object.assign(new Error('Restart Creator using pnpm dev.'), { code: 'CREATOR_OPERATOR_RESTART_REQUIRED' }); },
  });
  expect(await manager.selectProject(await root())).toMatchObject({ issues: [{ code: 'CREATOR_OPERATOR_RESTART_REQUIRED' }] });
  expect(ensureOperator).not.toHaveBeenCalled();
  expect(createRuntimeManager).not.toHaveBeenCalled();
});

it("keeps a previously valid project ready when its loaded tool becomes stale", async () => {
  let stale = false;
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), ensureOperator: vi.fn(async () => []),
    createRuntimeManager: () => ({ ensureStarted: async () => {}, dispose: async () => {} }) as unknown as CreatorProcessManager,
    inspectProject: async () => {
      if (stale) throw Object.assign(new Error('Restart Creator.'), { code: 'CREATOR_OPERATOR_RESTART_REQUIRED' });
      return { status: 'ready', projectConfig: { mode: 'platform', sourceRoot: 'agent-ui' }, paths: { sourceRoot: 'agent-ui' } };
    },
  });
  await manager.selectProject(await root());
  stale = true;
  expect(await manager.refresh()).toMatchObject({ status: 'ready', runtime: { status: 'unavailable', code: 'CREATOR_OPERATOR_RESTART_REQUIRED' } });
  expect(() => manager.ensureCreatorRuntime()).toThrow('Restart Creator.');
});

it("does not install a control plane when selecting or refreshing an uninitialized project", async () => {
  const ensureOperator = vi.fn();
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), ensureOperator, createRuntimeManager: vi.fn(),
    inspectProject: async () => ({ status: 'uninitialized' }),
  });
  expect(await manager.selectProject(await root())).toMatchObject({ status: 'uninitialized' });
  expect(await manager.refresh()).toMatchObject({ status: 'uninitialized' });
  expect(ensureOperator).not.toHaveBeenCalled();
});

it("routes a bound Vue workspace to its producer while retaining the host identity", async () => {
  const host = await root(); const producer = path.join(host, "agent-ui");
  await mkdir(path.join(host, ".agent-ui")); await mkdir(producer);
  await writeFile(path.join(host, "package.json"), JSON.stringify({ dependencies: { vue: "3.5.42" } }));
  await writeFile(path.join(host, ".agent-ui/producer.json"), JSON.stringify({ schemaVersion: 1, producerRoot: "agent-ui" }));
  const createRuntimeManager = vi.fn(() => ({ ensureStarted: async () => {}, dispose: async () => {} }) as unknown as CreatorProcessManager);
  const manager = new CreatorWorkspaceManager({ ...setupDependencies(), compatibility: true, createRuntimeManager, ensureOperator: vi.fn(async () => []),
    inspectProject: async () => ({ status: "ready", projectConfig: { mode: "embedded", sourceRoot: "src/agent-ui" }, paths: { sourceRoot: "src/agent-ui" } }),
  });
  const state = await manager.selectProject(host);
  expect(state).toMatchObject({ status: "ready", workspace: { projectRoot: producer, hostProjectRoot: host, hostFramework: "vue", displayPath: host } });
  expect(createRuntimeManager).toHaveBeenCalledWith(producer);
  if (state.status !== "ready") throw new Error("not ready");
  expect(await manager.runProjectOperation(state.workspace.id, async target => target)).toBe(producer);
  expect((await manager.selectProject(host))).toBe(state);
  await manager.clear();
});
