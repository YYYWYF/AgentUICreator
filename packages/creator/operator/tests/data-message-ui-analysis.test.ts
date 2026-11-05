import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { analyzeDataMessageUIs } from "../src/project/data-message-ui-analyzer";
import type { PluginAsset } from "../src/project/types";
import { verifyUIProject } from "../src/verify-ui";
import { writeGeneratedPluginRegistry } from "../src/generate-plugin-registry";
import { PLUGIN_REGISTRY_ENTRY_SOURCE } from "../src/project/registry-generator";
import { createSourceRootProjectFixture } from "./support/source-root-project-fixture";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const definition = (name: string, extra = "") => `import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";\n${extra}\nconst definition = { manifest: {}, dataMessageUIs: [defineDataMessageUI({ name: ${name}, render: () => null })], Component: () => null }; export default definition;`;

it.each([
  ['"app.inspection.result"', "", true],
  ["NAME", 'const NAME = "app.inspection.result" as const;', true],
  ["ALIAS", 'import { NAME as ALIAS } from "./schema";', true],
  ["NAME", 'let NAME = "app.inspection.result";', false],
  ["NAME", 'const NAME = String("app.inspection.result");', false],
  ["A", "const A = B; const B = A;", false],
])("resolves only immutable literal names: %s / %s", async (name, extra, valid) => {
  const root = await mkdtemp(path.join(tmpdir(), "消息 UI 常量 ")); roots.push(root);
  await writeFile(path.join(root, "schema.ts"), 'export const NAME = "app.inspection.result";');
  await writeFile(path.join(root, "definition.ts"), definition(name as string, extra as string));
  const asset = { pluginId: "probe", definitionPath: "definition.ts", manifest: { data: { messageUI: true } } } as PluginAsset;
  const issues = await analyzeDataMessageUIs(root, [asset]);
  expect(asset.dataMessageUINames).toEqual(valid ? ["app.inspection.result"] : []);
  expect(issues.map(issue => issue.code)).toEqual(valid ? [] : ["DATA_MESSAGE_UI_NAME_NOT_STATIC"]);
});

it("reports unselected source diagnostics and why a Plugin is excluded from the runtime catalog", async () => {
  const { projectRoot, paths } = await createSourceRootProjectFixture(); roots.push(projectRoot);
  const packageRoot = path.join(projectRoot, "node_modules/@za38.03/agent-ui-plugins");
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  const identity = { name: "@za38.03/agent-ui-plugins", version: "0.0.0" };
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ ...identity, exports: { "./catalog.json": "./dist/catalog.json" } }));
  await writeFile(path.join(packageRoot, "dist/catalog.json"), JSON.stringify({ schemaVersion: 1, package: identity, plugins: [] }));
  const plugin = path.join(paths.pluginsRoot, "probe"); await mkdir(plugin);
  await writeFile(path.join(plugin, "manifest.json"), JSON.stringify({ id: "probe", name: "Probe", description: "Fixture", version: "1.0.0", capabilities: ["headless"], data: { messageUI: true } }));
  await writeFile(path.join(plugin, "definition.ts"), definition('String("app.inspection.result")'));
  await writeFile(paths.pluginRegistryEntryPath, PLUGIN_REGISTRY_ENTRY_SOURCE);
  await writeGeneratedPluginRegistry(projectRoot, { initializeApplications: false });
  const invalid = await verifyUIProject(projectRoot);
  expect(invalid.status).toBe("passed"); // Unselected code does not break the running application.
  expect(invalid.sourceDiagnostics).toContainEqual(expect.objectContaining({ pluginId: "probe", code: "DATA_MESSAGE_UI_NAME_NOT_STATIC" }));
  expect(invalid.pluginStates).toContainEqual({ pluginId: "probe", source: "invalid", composition: "not_selected", runtimeCatalog: "excluded_not_selected" });
  await writeFile(path.join(plugin, "schema.ts"), 'export const NAME = "app.inspection.result";');
  await writeFile(path.join(plugin, "definition.ts"), definition("NAME", 'import { NAME } from "./schema";'));
  await writeGeneratedPluginRegistry(projectRoot, { initializeApplications: false });
  const valid = await verifyUIProject(projectRoot);
  expect(valid.sourceDiagnostics).toEqual([]);
  expect(valid.pluginStates).toContainEqual({ pluginId: "probe", source: "available", composition: "not_selected", runtimeCatalog: "excluded_not_selected" });
  expect(valid.pluginStates).toContainEqual({ pluginId: "foo", source: "available", composition: "selected", runtimeCatalog: "included" });
});
