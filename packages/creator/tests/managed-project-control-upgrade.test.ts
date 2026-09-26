import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureManagedProjectControl, installManagedProjectControl, MANAGED_CONTROL_ENTRY } from "@agent-ui/project-control";
import { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import type { PythonCreatorProcessManager } from "../src/PythonCreatorProcessManager.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "control-upgrade-"));
  roots.push(root);
  await installManagedProjectControl(root);
  const entry = path.join(root, MANAGED_CONTROL_ENTRY);
  const source = await readFile(entry, "utf8");
  const start = vi.fn(async () => {
    expect(await readFile(entry, "utf8")).toBe(source);
  });
  const manager = new CreatorWorkspaceManager({
    inspectProject: async () => ({ status: "ready", projectConfig: { version: "2", mode: "assistant", sourceRoot: "agent-ui" }, paths: { sourceRoot: "agent-ui" } }),
    initializeProject: async () => undefined,
    validateProjectSetup: async () => ({ valid: true, sourceRoot: { normalized: "agent-ui", parentExists: true, targetState: "missing" }, issues: [] }),
    suggestSourceRoot: async () => "agent-ui",
    createPythonManager: () => ({ ensureStarted: start, dispose: async () => undefined }) as unknown as PythonCreatorProcessManager,
  });
  return { root, entry, source, start, manager };
}

describe("ready workspace control upgrade lifecycle", () => {
  it("upgrades runtime version 0 before Python starts on select and refresh", async () => {
    const { root, entry, source, manager, start } = await fixture();
    const old = source.replace("controlRuntimeVersion: 1", "controlRuntimeVersion: 0");
    await writeFile(entry, old);
    expect(await manager.selectProject(root)).toMatchObject({ status: "ready", runtime: { status: "ready" } });
    await writeFile(entry, old);
    expect(await manager.refresh()).toMatchObject({ runtime: { status: "ready" } });
    expect(start).toHaveBeenCalledTimes(2);
    await manager.clear();
  });
  it("upgrades a relocated tool URL and leaves current entries alone", async () => {
    const { root, entry, source } = await fixture();
    await writeFile(entry, source.replace(/from "file:[^"]+";/, 'from "file:///old-install/project-control-runtime.mjs";'));
    expect(await ensureManagedProjectControl(root)).toEqual([MANAGED_CONTROL_ENTRY]);
    expect(await readFile(entry, "utf8")).toBe(source);
    expect(await ensureManagedProjectControl(root)).toEqual([]);
  });
  it("refuses user edits and does not start Python", async () => {
    const { root, entry, source, manager, start } = await fixture();
    const customized = source + "// user customization\n";
    await writeFile(entry, customized);
    expect(await manager.selectProject(root)).toMatchObject({ runtime: { status: "unavailable" } });
    expect(start).not.toHaveBeenCalled();
    expect(await readFile(entry, "utf8")).toBe(customized);
    await manager.clear();
  });
  it("keeps missing legacy entries and reinstalls missing managed entries", async () => {
    const { root, entry } = await fixture();
    await rm(entry);
    expect(await ensureManagedProjectControl(root)).toEqual([]);
    expect(await ensureManagedProjectControl(root, { managed: true })).toEqual([MANAGED_CONTROL_ENTRY]);
  });
});
