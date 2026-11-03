import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host";
import { generatedProjectFixture } from "../support/generated-project";
import { lstat, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";

import {
  suggestAgentUISourceRoot,
  validateAgentUIProjectSetup,
} from "@za38.03/agent-ui-creator/bootstrap";
import { inspectCreatorProject } from "../../src/project/creator-project-inspector";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../../src/framework/contracts/app-ui-model";
import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";

const initializationHost = createAgentUIInitializationHost();

const exampleRoot = await generatedProjectFixture();
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
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "src/agent-ui" }, initializationHost))
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
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }, initializationHost))
      .rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET" });
    await expect(readFile(path.join(root, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(path.join(root, "agent-ui"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await inspectCreatorProject(root)).status).toBe("uninitialized");
  });

  it.each([
    ["assistant", "src/agent-ui", "src"],
    ["embedded", "agent-ui", undefined],
    ["platform", "packages/web/agent-ui", "packages/web"],
  ] as const)("initializes %s at %s into a ready project", async (mode, sourceRoot, parent) => {
    const root = await hostProject(parent);
    const packageSource = await readFile(path.join(root, "package.json"), "utf8");
    const viteConfig = 'export default { server: { port: 5400 } };\r\n';
    const toolConfig = 'CREATOR_MODEL_API_KEY=private-fixture\r\n';
    await writeFile(path.join(root, "vite.config.ts"), viteConfig);
    await mkdir(path.join(root, ".agent-ui", "creator"), { recursive: true });
    await writeFile(path.join(root, ".agent-ui/creator/.env.local"), toolConfig);
    const result = await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot }, initializationHost);
    expect(result.projectConfig).toEqual({ mode, sourceRoot });
    // Fresh projects consume npm mechanics and retain only their application decisions.
    for (const directory of ["runtime", "framework", "agent-contract", "conversation", "agent-ui", "app-ui", "agent-ui/conversation", "agent-ui/i18n", "agent-ui/theme", "agent-ui/authoring"]) {
      await expect(lstat(path.join(root, sourceRoot, directory))).rejects.toMatchObject({ code: "ENOENT" });
    }
    await expect(lstat(path.join(root, sourceRoot, "config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, sourceRoot, "styles.css"), "utf8")).toContain("styles-base.css");
    expect(await readFile(path.join(root, sourceRoot, "application/Agent.tsx"), "utf8")).toContain("AgentApplication");
    await expect(lstat(path.join(root, sourceRoot, "application/AgentUICompatibilityRoot.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, sourceRoot, "application/project-config.tsx"), "utf8")).toContain("createAgentUIProject");
    expect(await readFile(path.join(root, sourceRoot, "plugins/registry.generated.ts"), "utf8")).toContain("@za38.03/agent-ui-runtime/ui");

    // Inspect the actual delivered source and lock, including generated imports.
    async function assertProductNames(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        expect(entry.name).not.toMatch(/assistant[ _-]?ui/i);
        if (entry.isDirectory()) await assertProductNames(file);
        else expect(await readFile(file, "utf8"), file).not.toMatch(/assistant[ _-]?ui/i);
      }
    }
    await assertProductNames(path.join(root, sourceRoot));
    expect(await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8")).not.toContain("assistant-ui");
    expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(packageSource);

    expect(result.createdPaths).not.toContain(".agent-ui/creator/.env.local");
    execFileSync("git", ["-C", root, "init", "--quiet"]);
    const localData = ["creator/.env.local", "creator/logs/run.jsonl", "operator/entry.mjs", "connection.local.json", "visual-observations/capture.webp"];
    const projectRecords = ["project.json", "source-lock.json", "plugin-ownership.json", "source-baselines/base.json", "mocks/scenario.jsonl", ".gitignore"];
    const ignored = execFileSync("git", ["-C", root, "-c", "core.excludesFile=", "check-ignore", "--no-index", "--stdin"], {
      input: [...localData, ...projectRecords].map(file => `.agent-ui/${file}`).join("\n") + "\n", encoding: "utf8",
    }).trim().split(/\r?\n/u);
    expect(ignored).toEqual(localData.map(file => `.agent-ui/${file}`));
    expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(viteConfig);
    expect(await readFile(path.join(root, ".agent-ui/creator/.env.local"), "utf8")).toBe(toolConfig);
    expect(result.installedSourceItems).toContain("foundation/core");
    expect(result.installedSourceItems).not.toContain("foundation/conversation");
    expect(result.installedSourceItems).toContain("plugin/conversation-surface");
    expect(result.installedSourceItems).toContain("plugin/tool-result");
    expect(result.installedSourceItems).not.toContain("plugin/tool-fallback");
    const deliveredModel = await readFile(path.join(root, sourceRoot, "app-ui.json"), "utf8");
    const selectedIds = [...new Set(collectAppUIPluginLocations(parseAppUIModelJson(deliveredModel)).map(location => location.plugin.pluginId))].sort();
    const applicationDirectories = (await readdir(path.join(root, sourceRoot, "plugins"), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    expect(applicationDirectories).toEqual(selectedIds);
    expect(deliveredModel).toContain('"pluginId": "tool-result"');
    expect(deliveredModel).not.toContain('"pluginId": "tool-fallback"');
    expect(await readFile(path.join(root, sourceRoot, "plugins/tool-result/index.tsx"), "utf8"))
      .toContain('from "@za38.03/agent-ui-plugins/tool-result"');
    const state = await inspectCreatorProject(root);
    expect(state.status).toBe("ready");
    const lock = JSON.parse(await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8")) as { sourceRoot: string };
    expect(lock.sourceRoot).toBe(sourceRoot);
    expect(await readFile(path.join(root, sourceRoot, "application/runtime-config.generated.ts"), "utf8"))
      .toContain(`export { ${mode[0]!.toUpperCase()}${mode.slice(1)}Shell as ProjectShell }`);
    expect(JSON.parse(await readFile(path.join(root, ".agent-ui/project.json"), "utf8"))).toEqual({ sourceRoot });
    // This Host intentionally has no root tsconfig. The catalog must still
    // agree with the installed plugin definitions before Runtime can mount.
    const registry = await readFile(path.join(root, sourceRoot, "plugins/registry.generated.ts"), "utf8");
    expect(registry).toContain('provides: ["agent-ui.conversation-data-source"]');
    expect(registry).toContain('inject: ["agent-ui.conversation-data-source"]');
    if (mode === "assistant" || mode === "embedded") {
      expect(result.installedSourceItems).toContain("plugin/conversation-new");
      expect(result.installedSourceItems).toContain("plugin/conversation-thread-list");
      const model = JSON.parse(await readFile(path.join(root, sourceRoot, "app-ui.json"), "utf8"));
      expect(model.root.type).toBe("column");
      expect(model.root.children[0].type).toBe("row");
      expect(model.root.children[0].children[1].plugins[0].pluginId).toBe("conversation-new");
      expect(model.root.children[0].children[2].plugins[0]).toMatchObject({
        pluginId: "conversation-thread-list",
      });
    }
    if (mode === "platform") {
      const model = JSON.parse(await readFile(path.join(root, sourceRoot, "app-ui.json"), "utf8")) as {
        root: { type: string; children: Array<{ child: { children: Array<{ plugins: Array<{ pluginId: string }> }> } }> };
      };
      expect(model.root.type).toBe("row");
      expect(model.root.children[0]?.child.children[1]?.plugins[0]?.pluginId).toBe("conversation-thread-list");
    }
    if (mode === "assistant") {
      const model = JSON.parse(deliveredModel);
      model.root.children[0].children[0].plugins.push({ id: "project-locale-switch", pluginId: "locale-switch", enabled: true });
      await writeFile(path.join(root, sourceRoot, "app-ui.json"), JSON.stringify(model));
      await writeGeneratedPluginRegistry(root);
      expect(await readFile(path.join(root, sourceRoot, "plugins/locale-switch/index.tsx"), "utf8")).toContain('from "@za38.03/agent-ui-plugins/locale-switch"');
      await expect(lstat(path.join(root, sourceRoot, "plugins/auth-account"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await inspectCreatorProject(root)).status).toBe("ready");
    }
  });

  it("never creates a missing source parent", async () => {
    const root = await hostProject();
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "foo/bar/agent-ui" }, initializationHost))
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
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }, initializationHost))
      .rejects.toMatchObject({ code: "AGENT_UI_PROJECT_INVALID_STATE" });
  });

  it("rejects a second initialization without changing the committed project", async () => {
    const root = await hostProject();
    await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }, initializationHost);
    const before = await readFile(path.join(root, ".agent-ui/project.json"), "utf8");
    await expect(initializeAgentUIProject({ projectRoot: root, mode: "platform", sourceRoot: "agent-ui" }, initializationHost))
      .rejects.toMatchObject({ code: "AGENT_UI_PROJECT_ALREADY_INITIALIZED" });
    expect(await readFile(path.join(root, ".agent-ui/project.json"), "utf8")).toBe(before);
  });
});
