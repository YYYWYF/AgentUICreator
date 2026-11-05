// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { collectPluginAssets } from "../src/project/plugin-assets";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { inspectCreatorProject } from "../src/project/creator-project-inspector";
import { repositoryRoot } from "./support/generated-project";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(marker?: string) {
  const root = await mkdtemp(path.join(tmpdir(), "application diagnostics 中文-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await mkdir(path.join(root, "node_modules/@za38.03"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src/ui" }));
  await symlink(path.join(repositoryRoot, "packages/plugins"), path.join(root, "node_modules/@za38.03/agent-ui-plugins"), process.platform === "win32" ? "junction" : "dir");
  for (const id of ["custom-card", "valid-card"]) {
    const directory = path.join(root, "src/ui/plugins", id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ id, name: id, description: "Custom project Plugin", version: "0.0.1" }));
    await writeFile(path.join(directory, "definition.ts"), "export default {};\n");
  }
  await writeFile(path.join(root, "src/ui/app-ui.json"), '{"root":{"type":"slot","plugins":[]}}');
  const file = path.join(root, "src/ui/plugins/custom-card/application.json");
  if (marker !== undefined) await writeFile(file, marker);
  const { paths, config } = await resourcePaths(root);
  return { root, paths, config, file };
}

it("identifies an accidental npm marker on a custom Plugin at its actual file", async () => {
  const marker = JSON.stringify({ schemaVersion: 1, pluginId: "custom-card" });
  const f = await fixture(marker);
  const result = await collectPluginAssets(f.root, f.paths, f.config);
  expect(result.errors).toContainEqual(expect.objectContaining({
    code: "plugin-application-read", path: "src/ui/plugins/custom-card/application.json",
    message: expect.stringContaining('"custom-card", which is absent from the installed'),
  }));
  expect(result.errors.some(issue => issue.path === "src/ui/plugins/custom-card/manifest.json")).toBe(false);
  expect(result.assets.some(asset => asset.pluginId === "valid-card")).toBe(true);
  expect(result.assets.some(asset => asset.pluginId === "custom-card")).toBe(false);
  expect(await readFile(f.file, "utf8")).toBe(marker);
});

it.each(["{invalid", JSON.stringify({ schemaVersion: 1, pluginId: "another-id" })])("reports invalid marker data without aborting other Plugin discovery: %s", async marker => {
  const f = await fixture(marker);
  const result = await collectPluginAssets(f.root, f.paths, f.config);
  expect(result.errors).toContainEqual(expect.objectContaining({ code: "plugin-application-read", path: "src/ui/plugins/custom-card/application.json" }));
  expect(result.assets.some(asset => asset.pluginId === "valid-card")).toBe(true);
  expect(await readFile(f.file, "utf8")).toBe(marker);
});

it("continues to discover custom implementations without npm application markers", async () => {
  const f = await fixture();
  const result = await collectPluginAssets(f.root, f.paths, f.config);
  expect(result.errors).toEqual([]);
  expect(result.assets.some(asset => asset.pluginId === "custom-card" && !asset.application)).toBe(true);
});

it("keeps strict source inspection broken but provides a validated repair context", async () => {
  const f = await fixture(JSON.stringify({ schemaVersion: 1, pluginId: "custom-card" }));
  expect(await inspectCreatorProject(f.root)).toMatchObject({ status: "broken",
    repairContext: { projectConfig: { sourceRoot: "src/ui" }, paths: { sourceRoot: f.paths.sourceRoot } },
    issues: expect.arrayContaining([expect.objectContaining({ code: "plugin-application-read", severity: "error" })]),
  });
});

it("does not offer source repair when project structure is invalid", async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, ".agent-ui/project.json"), '{"sourceRoot":"../outside"}');
  const result = await inspectCreatorProject(f.root);
  expect(result.status).toBe("broken");
  expect(result).not.toHaveProperty("repairContext");
});
