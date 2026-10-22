// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { initializeAgentUIProject } from "../src/bootstrap/initialize-agent-ui-project";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";
import { collectAppUIPluginLocations, parseAppUIModel } from "../src/framework/contracts/app-ui-model";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it.each(["assistant", "embedded", "platform"] as const)("delivers complete shared CSS to a new %s project", async mode => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-ui-compact-template-"));
  roots.push(projectRoot);
  const hostRoot = path.join(workspaceRoot, "examples/creator-assistant-host");
  await writeFile(path.join(projectRoot, "package.json"), await readFile(path.join(hostRoot, "package.json")));
  await symlink(path.join(hostRoot, "node_modules"), path.join(projectRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await mkdir(path.join(projectRoot, "src"));
  const sourceRoot = "src/custom ui";
  const result = await initializeAgentUIProject({ projectRoot, mode, sourceRoot }, createAgentUIInitializationHost());
  const conversationRoot = path.join(projectRoot, sourceRoot, "agent-ui/conversation");
  expect(result.projectConfig).toEqual({ mode, sourceRoot });
  expect(await readFile(path.join(projectRoot, sourceRoot, "app-ui/app-ui.json"), "utf8"))
    .not.toMatch(/"enabled"\s*:\s*true/u);
  const saved = JSON.parse(await readFile(path.join(projectRoot, sourceRoot, "app-ui/app-ui.json"), "utf8"));
  const normalized = parseAppUIModel(saved);
  expect(collectAppUIPluginLocations(normalized).length).toBeGreaterThan(0);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value === null || typeof value !== "object") return;
    if ("pluginId" in value) expect(value).not.toHaveProperty("id");
    Object.values(value).forEach(visit);
  };
  visit(saved);
  expect(await readFile(path.join(conversationRoot, "styles.css"), "utf8"))
    .toContain('@import "./compact.css";');
  expect(await readFile(path.join(conversationRoot, "compact.css"), "utf8"))
    .toBe(await readFile(path.join(workspaceRoot, "packages/plugins/resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/compact.css"), "utf8"));
});
