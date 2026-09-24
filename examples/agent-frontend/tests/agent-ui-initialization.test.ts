import { lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";

import {
  suggestAgentUISourceRoot,
  validateAgentUIProjectSetup,
} from "@agent-ui/bootstrap";
import { inspectCreatorProject } from "../scripts/ui-project/creator-project-inspector";
import { initializeAgentUIProject } from "../scripts/ui-project/initialize-agent-ui-project";

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots: string[] = [];

async function hostProject(sourceParent?: string, linkDependencies = true): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-ui-bootstrap-"));
  roots.push(projectRoot);
  const examplePackage = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({
    name: "plain-host-project",
    private: true,
    dependencies: examplePackage.dependencies,
  }));
  if (linkDependencies) {
    await symlink(path.join(exampleRoot, "node_modules"), path.join(projectRoot, "node_modules"), "dir");
  }
  if (sourceParent !== undefined) await mkdir(path.join(projectRoot, sourceParent), { recursive: true });
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Agent UI project setup", () => {
  it("suggests src only when the host already owns a src directory", async () => {
    const root = await hostProject();
    expect(await suggestAgentUISourceRoot(root)).toBe("agent-ui");
    await mkdir(path.join(root, "src"));
    expect(await suggestAgentUISourceRoot(root)).toBe("src/agent-ui");
  });

  it("rejects missing parents, occupied targets, and escaping paths before mutation", async () => {
    const root = await hostProject("src/agent-ui");
    expect((await validateAgentUIProjectSetup({ projectRoot: root, mode: "assistant", sourceRoot: "foo/bar/agent-ui" })).issues[0]?.code)
      .toBe("AGENT_UI_SOURCE_PARENT_NOT_FOUND");
    await writeFile(path.join(root, "src/agent-ui/user-file.ts"), "export const owned = true;\n");
    expect((await validateAgentUIProjectSetup({ projectRoot: root, mode: "assistant", sourceRoot: "src/agent-ui" })).issues[0]?.code)
      .toBe("AGENT_UI_SOURCE_ROOT_NOT_EMPTY");
    expect((await validateAgentUIProjectSetup({ projectRoot: root, mode: "assistant", sourceRoot: "../agent-ui" })).valid)
      .toBe(false);
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "src/agent-ui" }))
      .rejects.toMatchObject({ code: "AGENT_UI_SOURCE_ROOT_NOT_EMPTY" });
    expect(await readFile(path.join(root, "src/agent-ui/user-file.ts"), "utf8")).toBe("export const owned = true;\n");
  });

  it("rejects a source parent symlink that escapes the host project", async () => {
    const root = await hostProject();
    const external = await mkdtemp(path.join(os.tmpdir(), "agent-ui-external-"));
    roots.push(external);
    await symlink(external, path.join(root, "linked"), "dir");
    const validation = await validateAgentUIProjectSetup({ projectRoot: root, mode: "assistant", sourceRoot: "linked/agent-ui" });
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "AGENT_UI_SOURCE_ROOT_INVALID")).toBe(true);
  });
});

describe("deterministic Agent UI initializer", () => {
  it("fails package preflight without creating project files or sourceRoot", async () => {
    const root = await hostProject(undefined, false);
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }))
      .rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET" });
    await expect(readFile(path.join(root, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(path.join(root, "agent-ui"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await inspectCreatorProject(root)).status).toBe("uninitialized");
  });

  it.each([
    ["assistant", "src/agent-ui", "src"],
    ["embedded", "agent-ui", undefined],
    ["platform", "packages/web/agent-ui", "packages/web"],
  ] as const)("initializes %s at %s into a ready V2 project", async (mode, sourceRoot, parent) => {
    const root = await hostProject(parent);
    const result = await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot });
    expect(result.projectConfig).toEqual({ version: "2", mode, sourceRoot });
    expect(result.installedSourceItems).toContain("foundation/core");
    expect(result.installedSourceItems).toContain("foundation/conversation");
    expect(result.installedSourceItems).toContain("plugin/conversation-surface");
    const state = await inspectCreatorProject(root);
    expect(state.status).toBe("ready");
    const lock = JSON.parse(await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8")) as { sourceRoot: string };
    expect(lock.sourceRoot).toBe(sourceRoot);
    if (mode === "platform") {
      const model = JSON.parse(await readFile(path.join(root, sourceRoot, "app-ui/app-ui.json"), "utf8")) as {
        root: { children: Array<{ child: { plugins: Array<{ pluginId: string }> } }> };
      };
      expect(model.root.children[0]?.child.plugins[0]?.pluginId).toBe("conversation-thread-list");
    }
  });

  it("never creates a missing source parent", async () => {
    const root = await hostProject();
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "foo/bar/agent-ui" }))
      .rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PARENT_NOT_FOUND" });
    expect((await inspectCreatorProject(root)).status).toBe("uninitialized");
  });

  it("treats an interrupted initialization journal as broken", async () => {
    const root = await hostProject();
    await mkdir(path.join(root, ".agent-ui"));
    await writeFile(path.join(root, ".agent-ui/init-transaction.json"), "{}\n");
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "broken",
      issues: [{ code: "AGENT_UI_INITIALIZATION_INTERRUPTED" }],
    });
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }))
      .rejects.toMatchObject({ code: "AGENT_UI_PROJECT_INVALID_STATE" });
  });

  it("rejects a second initialization without changing the committed project", async () => {
    const root = await hostProject();
    await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" });
    const before = await readFile(path.join(root, ".agent-ui/project.json"), "utf8");
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "platform", sourceRoot: "agent-ui" }))
      .rejects.toMatchObject({ code: "AGENT_UI_PROJECT_ALREADY_INITIALIZED" });
    expect(await readFile(path.join(root, ".agent-ui/project.json"), "utf8")).toBe(before);
  });
});
