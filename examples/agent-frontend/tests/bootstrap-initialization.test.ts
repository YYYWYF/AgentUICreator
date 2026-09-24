import { lstat, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeAgentUIProject, type AgentUIInitializationHost } from "../../../packages/bootstrap/src/initialize-agent-ui-project";

const roots: string[] = [];
const input = (projectRoot: string) => ({ projectRoot, mode: "assistant" as const, sourceRoot: "agent-ui" });
const configPath = (root: string) => path.join(root, ".agent-ui/project.json");
const journalPath = (root: string) => path.join(root, ".agent-ui/init-transaction.json");
const managedPath = (root: string) => path.join(root, "agent-ui/managed.ts");

async function exists(filePath: string): Promise<boolean> {
  try { await readFile(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bootstrap-boundary-"));
  roots.push(root);
  const paths = ["agent-ui/managed.ts", "agent-ui/app-ui/app-ui.json", "agent-ui/registry.generated.ts"];
  const host: AgentUIInitializationHost<unknown> = {
    inspectProject: vi.fn().mockResolvedValueOnce({ status: "uninitialized" }).mockResolvedValue({ status: "ready" }),
    parseAppUIModel: (value) => value,
    preflightSources: vi.fn().mockResolvedValue({ plannedPaths: paths }),
    installSources: vi.fn(async () => {
      await mkdir(path.join(root, "agent-ui"), { recursive: true });
      await writeFile(managedPath(root), "managed\n");
      return { installedSourceItems: ["foundation/core"], createdPaths: [paths[0]!] };
    }),
    writeAppUIModel: vi.fn(async () => {
      await mkdir(path.join(root, "agent-ui/app-ui"), { recursive: true });
      await writeFile(path.join(root, paths[1]!), "{}\n");
      return paths[1]!;
    }),
    writeGeneratedRegistry: vi.fn(async () => {
      await writeFile(path.join(root, paths[2]!), "export {};\n");
      return paths[2]!;
    }),
    verifyProject: vi.fn().mockResolvedValue({ status: "passed", errors: [] }),
    rollbackCreatedPaths: vi.fn(async (_root, _created, _config, planned) => {
      for (const relative of planned) {
        await unlink(path.join(root, relative)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }),
  };
  return { root, host };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("bootstrap initialization commit boundary", () => {
  it("does not mutate or roll back when preflight fails", async () => {
    const { root, host } = await fixture();
    host.preflightSources = vi.fn().mockRejectedValue(new Error("preflight"));
    await expect(initializeAgentUIProject(input(root), host)).rejects.toThrow("preflight");
    expect(host.installSources).not.toHaveBeenCalled();
    expect(host.rollbackCreatedPaths).not.toHaveBeenCalled();
    expect(await exists(configPath(root))).toBe(false);
  });

  it("rolls back a partial install before commit", async () => {
    const { root, host } = await fixture();
    host.installSources = vi.fn(async () => {
      await mkdir(path.join(root, "agent-ui"));
      await writeFile(managedPath(root), "partial\n");
      throw new Error("install failed");
    });
    await expect(initializeAgentUIProject(input(root), host)).rejects.toThrow("install failed");
    expect(host.rollbackCreatedPaths).toHaveBeenCalledOnce();
    expect(await exists(managedPath(root))).toBe(false);
    expect(await exists(configPath(root))).toBe(false);
  });

  it("rolls back AppUIModel write failure", async () => {
    const { root, host } = await fixture();
    host.writeAppUIModel = vi.fn().mockRejectedValue(new Error("model write"));
    await expect(initializeAgentUIProject(input(root), host)).rejects.toThrow("model write");
    expect(host.rollbackCreatedPaths).toHaveBeenCalledOnce();
    expect(await exists(configPath(root))).toBe(false);
    expect(await exists(journalPath(root))).toBe(false);
  });

  it("preserves a pre-existing empty metadata directory after pre-commit failure", async () => {
    const { root, host } = await fixture();
    await mkdir(path.join(root, ".agent-ui"));
    host.writeAppUIModel = vi.fn().mockRejectedValue(new Error("model write"));
    await expect(initializeAgentUIProject(input(root), host)).rejects.toThrow("model write");
    expect((await lstat(path.join(root, ".agent-ui"))).isDirectory()).toBe(true);
    expect(await exists(journalPath(root))).toBe(false);
  });

  it("classifies registry and prospective verification failures before commit", async () => {
    for (const failure of ["registry", "verification"] as const) {
      const { root, host } = await fixture();
      if (failure === "registry") host.writeGeneratedRegistry = vi.fn().mockRejectedValue(new Error("registry"));
      else host.verifyProject = vi.fn().mockResolvedValue({ status: "failed", errors: [{ code: "BAD", message: "bad" }] });
      await expect(initializeAgentUIProject(input(root), host)).rejects.toMatchObject({
        code: "AGENT_UI_INITIALIZATION_VERIFICATION_FAILED",
      });
      expect(host.rollbackCreatedPaths).toHaveBeenCalledOnce();
      expect(await exists(configPath(root))).toBe(false);
      expect(await exists(journalPath(root))).toBe(false);
    }
  });

  it("preserves an external project.json created at the commit race", async () => {
    const { root, host } = await fixture();
    host.verifyProject = vi.fn(async () => {
      await writeFile(configPath(root), "external\n", { flag: "wx" });
      return { status: "passed" as const, errors: [] };
    });
    await expect(initializeAgentUIProject(input(root), host)).rejects.toMatchObject({
      code: "AGENT_UI_PROJECT_ALREADY_INITIALIZED",
    });
    expect(await readFile(configPath(root), "utf8")).toBe("external\n");
    expect(await exists(managedPath(root))).toBe(false);
    expect(host.rollbackCreatedPaths).toHaveBeenCalledOnce();
  });

  it.each(["broken", "throw"])("preserves committed files when final inspect %s", async (outcome) => {
    const { root, host } = await fixture();
    host.inspectProject = vi.fn().mockResolvedValueOnce({ status: "uninitialized" });
    if (outcome === "throw") vi.mocked(host.inspectProject).mockRejectedValueOnce(new Error("inspect failed"));
    else vi.mocked(host.inspectProject).mockResolvedValueOnce({ status: "broken" });
    await expect(initializeAgentUIProject(input(root), host)).rejects.toMatchObject({
      code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
    });
    expect(await exists(configPath(root))).toBe(true);
    expect(await exists(managedPath(root))).toBe(true);
    expect(await exists(journalPath(root))).toBe(true);
    expect(JSON.parse(await readFile(journalPath(root), "utf8"))).toMatchObject({ phase: "postcondition-failed" });
    expect(host.rollbackCreatedPaths).not.toHaveBeenCalled();
  });

  it("does not roll back when the committed journal update fails", async () => {
    const { root, host } = await fixture();
    host.writeInitializationJournal = vi.fn(async (filePath, journal, create) => {
      if (journal.phase === "committed" || journal.phase === "postcondition-failed") throw new Error("journal failed");
      await writeFile(filePath, `${JSON.stringify(journal)}\n`, create ? { flag: "wx" } : undefined);
    });
    await expect(initializeAgentUIProject(input(root), host)).rejects.toMatchObject({
      code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
    });
    expect(await exists(configPath(root))).toBe(true);
    expect(await exists(managedPath(root))).toBe(true);
    expect(JSON.parse(await readFile(journalPath(root), "utf8"))).toMatchObject({ phase: "verified" });
    expect(host.rollbackCreatedPaths).not.toHaveBeenCalled();
  });

  it("removes the journal only after a ready final inspection", async () => {
    const { root, host } = await fixture();
    const result = await initializeAgentUIProject(input(root), host);
    expect(result.installedSourceItems).toEqual(["foundation/core"]);
    expect(await exists(configPath(root))).toBe(true);
    expect(await exists(journalPath(root))).toBe(false);
    expect(host.rollbackCreatedPaths).not.toHaveBeenCalled();
  });
});
