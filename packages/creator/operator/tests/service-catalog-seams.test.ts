import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppUIModel } from "../src/framework/contracts/app-ui-model";
import { analyzePluginServiceDeclarations, inspectUIServiceDependenciesFromDeclarations } from "../src/project/service-dependency-inspector";
import type { PluginAsset } from "../src/project/types";

const assets: PluginAsset[] = ["provider", "consumer"].map(pluginId => ({
  pluginId, ownership: "official_package", directory: pluginId, name: pluginId, description: "Test service",
  definitionPath: `@example/${pluginId}`, manifestPath: pluginId, capabilities: [],
  manifest: { id: pluginId, name: pluginId, description: "Test service", version: "1.0.0" },
}));
const declarations = { plugins: [
  { pluginId: "provider", provides: ["test.shared"], inject: [], optionalInject: [] },
  { pluginId: "consumer", provides: [], inject: [], optionalInject: ["test.shared"] },
], issues: [], seamPaths: new Map<string, Set<string>>() };

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const conversationAssets: PluginAsset[] = ["conversation-data-source", "conversation-service", "conversation-thread-list"].map(pluginId => ({
  ...assets[0]!, pluginId, manifest: { ...assets[0]!.manifest, id: pluginId },
}));
async function sharedContracts(source: string, projectApplications = false) {
  const root = await mkdtemp(path.join(tmpdir(), "shared contracts 工程 ")); roots.push(root);
  const managed = path.join(root, "src/ui");
  await mkdir(path.join(managed, "services"), { recursive: true });
  await mkdir(path.join(root, "node_modules/@za38.03"), { recursive: true });
  await symlink(fileURLToPath(new URL("../../../plugins", import.meta.url)), path.join(root, "node_modules/@za38.03/agent-ui-plugins"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler", skipLibCheck: true }, include: ["src"] }));
  await writeFile(path.join(managed, "services/conversations.ts"), source);
  const selectedAssets: PluginAsset[] = conversationAssets.map(asset => projectApplications ? {
    ...asset, ownership: "project_source", definitionPath: `src/ui/plugins/${asset.pluginId}/definition.ts`,
  } : asset);
  if (projectApplications) {
    for (const asset of selectedAssets) {
      const provides = asset.pluginId === "conversation-service" ? "[SERVICE]" : asset.pluginId === "conversation-data-source" ? "[DATA_SOURCE]" : "[]";
      const inject = asset.pluginId === "conversation-service" ? "[DATA_SOURCE]" : asset.pluginId === "conversation-thread-list" ? "[SERVICE]" : "[]";
      await mkdir(path.dirname(path.join(root, asset.definitionPath)), { recursive: true });
      await writeFile(path.join(root, asset.definitionPath), `
import { AGENT_UI_CONVERSATION_SERVICE as SERVICE, AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE as DATA_SOURCE } from '../../services/conversations';
export default { manifest: { id: ${JSON.stringify(asset.pluginId)} }, provides: ${provides}, inject: ${inject}, optionalInject: [], Component: () => null };
`);
    }
  }
  const analysis = analyzePluginServiceDeclarations(root, selectedAssets, managed);
  const model = parseAppUIModel({ root: { type: "slot", plugins: selectedAssets.map(asset => ({ pluginId: asset.pluginId })) } });
  return { analysis, inspection: inspectUIServiceDependenciesFromDeclarations(model, selectedAssets, analysis) };
}

it("recognizes shared npm re-exports for project-owned applications without catalog-only definitions", async () => {
  const { analysis, inspection } = await sharedContracts("export * from '@za38.03/agent-ui-plugins/conversation-service';", true);
  expect(analysis.issues).toEqual([]);
  expect(analysis.plugins.find(plugin => plugin.pluginId === 'conversation-service')?.provides).toEqual(['agent-ui.conversations']);
  expect(inspection.issues).toEqual([]);
});

it.each([
  "export * from '@za38.03/agent-ui-plugins/conversation-service';",
  "export { AGENT_UI_CONVERSATION_SERVICE, AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE } from '@za38.03/agent-ui-plugins/conversation-service';",
  "export const SERVICE = 'agent-ui.conversations'; export const DATA_SOURCE = 'agent-ui.conversation-data-source';",
])("recognizes exported npm and project service contracts: %s", async source => {
  const { analysis, inspection } = await sharedContracts(source);
  expect(analysis.issues).toEqual([]);
  for (const name of ["agent-ui.conversations", "agent-ui.conversation-data-source"]) {
    expect([...analysis.seamPaths.get(name) ?? []]).toEqual(["src/ui/services/conversations.ts"]);
  }
  expect(inspection.issues).not.toContainEqual(expect.objectContaining({ code: "shared-service-seam-location" }));
});

it.each([
  "const SERVICE = 'agent-ui.conversations'; const DATA_SOURCE = 'agent-ui.conversation-data-source'; export {};",
  "export const SERVICE: string = 'agent-ui.conversations'; export const DATA_SOURCE: string = 'agent-ui.conversation-data-source';",
])("does not treat private or unresolved names as shared service contracts: %s", async source => {
  const { analysis, inspection } = await sharedContracts(source);
  expect(analysis.seamPaths.size).toBe(0);
  expect(inspection.issues.filter(issue => issue.code === "shared-service-seam-location")).toHaveLength(2);
});

it("does not require local service declarations for unused npm catalog references", () => {
  const model = parseAppUIModel({ root: { type: "slot", plugins: [] } });
  const result = inspectUIServiceDependenciesFromDeclarations(model, assets, declarations);
  expect(result.issues).toEqual([]);
});

it.each([true, false])("still requires shared contracts for selected participants (enabled=%s)", enabled => {
  const model = parseAppUIModel({ root: { type: "slot", plugins: assets.map(asset => ({ pluginId: asset.pluginId, enabled })) } });
  expect(inspectUIServiceDependenciesFromDeclarations(model, assets, declarations).issues).toContainEqual(expect.objectContaining({ code: "shared-service-seam-location" }));
});

it("still requires shared contracts for local applications without instances", () => {
  const model = parseAppUIModel({ root: { type: "slot", plugins: [] } });
  const applications = assets.map(asset => ({ ...asset, application: { entryPath: `${asset.pluginId}/definition.ts`, implementationOwnership: "npm" as const, implementationImport: asset.definitionPath } }));
  expect(inspectUIServiceDependenciesFromDeclarations(model, applications, declarations).issues).toContainEqual(expect.objectContaining({ code: "shared-service-seam-location" }));
});

it.each(["agent-ui.theme", "agent-ui.locale"])("uses the public Runtime contract for %s without a project copy", name => {
  const model = parseAppUIModel({ root: { type: "slot", plugins: assets.map(asset => ({ pluginId: asset.pluginId })) } });
  const runtimeDeclarations = { ...declarations, plugins: [
    { pluginId: "provider", provides: [name], inject: [], optionalInject: [] },
    { pluginId: "consumer", provides: [], inject: [name], optionalInject: [] },
  ] };
  const result = inspectUIServiceDependenciesFromDeclarations(model, assets, runtimeDeclarations);
  expect(result.issues).toEqual([]);
  expect(result.services[0]?.status).toBe("available");

  const missingProvider = { ...runtimeDeclarations, plugins: runtimeDeclarations.plugins.slice(1) };
  expect(inspectUIServiceDependenciesFromDeclarations(model, assets, missingProvider).issues)
    .toContainEqual(expect.objectContaining({ code: "required-service-missing", service: name }));
});
