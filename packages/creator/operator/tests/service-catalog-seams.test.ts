import { expect, it } from "vitest";
import { parseAppUIModel } from "../src/framework/contracts/app-ui-model";
import { inspectUIServiceDependenciesFromDeclarations } from "../src/project/service-dependency-inspector";
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
