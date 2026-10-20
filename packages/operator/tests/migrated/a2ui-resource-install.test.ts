import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { minVersion } from "semver";
import { afterEach, expect, it, vi } from "vitest";
import { installOptionalAgentUIResource } from "../../src/project/install-optional-agent-ui-resource";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@za38.03/agent-ui-operator/source-registry";
import { installOfficialAgentUIResource } from "../../src/project/install-official-agent-ui-resource";
import { commitAgentUISourceTransaction } from "../../src/project/source-registry/transaction";
import { resourcePaths } from "../../src/project/optional-resource-paths";
import { installMockResource, inspectScenarioResources } from "../../src/project/install-scenario-resources";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(itemId = "integration/a2ui") {
  const root = await mkdtemp(path.join(tmpdir(), "a2ui-resource-")); roots.push(root);
  const sourceRoot = path.join(root, "custom-ui");
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "custom-ui" }));
  const registry = await loadAgentUISourceRegistry();
  const closure = resolveAgentUISourceItemClosure(registry, itemId);
  const dependencies = Object.assign({}, ...closure.map(item => item.packages ?? {})) as Record<string, string>;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  const modelPath = path.join(sourceRoot, "app-ui/app-ui.json"); await mkdir(path.dirname(modelPath), { recursive: true });
  await writeFile(modelPath, JSON.stringify({ root: { type: "slot", plugins: [] } }));
  return { root, sourceRoot, modelPath };
}
it.skip("installs a pluginless/tool-less A2UI resource without changing AppUIModel", async () => {
  const f = await fixture();
  const model = await readFile(f.modelPath, "utf8");
  await installMockResource(f.root, "integration/a2ui");
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  const inspection = await inspectScenarioResources(f.root);
  for (const id of ["integration/generative-ui", "integration/a2ui"]) {
    expect(inspection.items.find(item => item.id === id)).toMatchObject({ status: "managed", dependencyIssues: [] });
  }
  expect(inspection.items.find(item => item.id === "integration/a2ui")).toMatchObject({ status: "managed", dependencyIssues: [] });
  expect(inspection.items.find(item => item.id === "integration/a2ui")!.resolvedRequirements.every(requirement => requirement.compatible)).toBe(true);
  const generated = await readFile(path.join(f.sourceRoot, "agent-ui/conversation/integrations.generated.tsx"), "utf8");
  expect(generated).toContain('from "./integrations/a2ui"');
  expect(await readFile(path.join(f.sourceRoot, "agent-contract/frontend-tools.generated.ts"), "utf8")).not.toContain("present");
  await installMockResource(f.root, "integration/a2ui");
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  expect(await readFile(path.join(f.sourceRoot, "agent-ui/conversation/integrations.generated.tsx"), "utf8")).toBe(generated);
});
it.skip("reports incompatible optional dependencies before writing source", async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, "node_modules/@za38.03/agent-ui-plugins/package.json"), JSON.stringify({ name: "@za38.03/agent-ui-plugins", version: "0.0.0" }));
  await expect(installMockResource(f.root, "integration/a2ui")).rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET" });
  await expect(readFile(path.join(f.sourceRoot, "integrations/a2ui/index.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["integration/generative-ui", "agent-component/generative-ui"])("installs Generative UI through %s without changing layout or mounting Tool permission", async itemId => {
  const f = await fixture(itemId);
  const model = await readFile(f.modelPath, "utf8");
  await installMockResource(f.root, itemId);
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  const inspection = await inspectScenarioResources(f.root);
  expect(inspection.items.find(item => item.id === "integration/generative-ui")).toMatchObject({ status: "managed", dependencyIssues: [] });
  expect(await readFile(path.join(f.sourceRoot, "agent-ui/conversation/generative-ui.ts"), "utf8")).toContain("createAgentUIGenerativeUI");
  expect(inspection.items.find(item => item.id === "integration/a2ui")?.status).not.toBe("managed");
  const tools = await readFile(path.join(f.sourceRoot, "agent-contract/frontend-tools.generated.ts"), "utf8");
  expect(tools).not.toContain("present"); expect(tools).not.toContain("prompt_user");
  const host = await readFile(path.join(f.sourceRoot, "agent-ui/conversation/integrations.generated.tsx"), "utf8");
  expect(host).not.toContain('from "./integrations/generative-ui"');
  expect(host).not.toContain('from "./integrations/a2ui"');
});


it.skip("installs the Official A2UI Resource and supplements missing dependencies", async () => {
  const f = await fixture();
  const manifestPath = path.join(f.root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.dependencies["@za38.03/agent-ui-plugins"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await rm(path.join(f.root, "node_modules/@za38.03/agent-ui-plugins"), { recursive: true });
  const model = await readFile(f.modelPath, "utf8");
  const runPackages = vi.fn(async (_root: string, command: { command: string; args: string[] }) => {
    expect(command).toEqual({ command: "npm", args: ["install", "--save", "--save-exact", "@za38.03/agent-ui-plugins@0.0.1"] });
    manifest.dependencies["@za38.03/agent-ui-plugins"] = "0.0.1";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const directory = path.join(f.root, "node_modules/@za38.03/agent-ui-plugins"); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@za38.03/agent-ui-plugins", version: "0.0.1" }));
  });
  await installOfficialAgentUIResource(f.root, "a2ui", { runPackages });
  expect(runPackages).toHaveBeenCalledTimes(1);
  const sources = await inspectScenarioResources(f.root);
  expect(sources.items.find(item => item.id === "integration/a2ui")).toMatchObject({ status: "managed", dependencyIssues: [] });
  expect(sources.integrationRegistryReady).toBe(true);
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  await installOfficialAgentUIResource(f.root, "a2ui", { runPackages });
  expect(runPackages).toHaveBeenCalledTimes(1);
});

it.skip("does not install Source or report readiness after package installation fails, and remains retryable", async () => {
  const f = await fixture();
  const manifestPath = path.join(f.root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.dependencies["@za38.03/agent-ui-plugins"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await rm(path.join(f.root, "node_modules/@za38.03/agent-ui-plugins"), { recursive: true });
  await expect(installOfficialAgentUIResource(f.root, "a2ui", { runPackages: async () => { throw new Error("package manager failed"); } })).rejects.toMatchObject({ code: "RESOURCE_INSTALL_FAILED", technicalDetails: { message: "package manager failed" } });
  await expect(readFile(path.join(f.sourceRoot, "integrations/a2ui/index.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await inspectScenarioResources(f.root)).items.find(item => item.id === "integration/a2ui")?.status).toBe("not-installed");
  manifest.dependencies["@za38.03/agent-ui-plugins"] = "0.0.1";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const directory = path.join(f.root, "node_modules/@za38.03/agent-ui-plugins"); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@za38.03/agent-ui-plugins", version: "0.0.1" }));
  await installOfficialAgentUIResource(f.root, "a2ui");
  expect((await inspectScenarioResources(f.root)).integrationRegistryReady).toBe(true);
});

it("refuses upstream source writes even if a legacy release requests them", async () => {
  const f = await fixture();
  const { config } = await resourcePaths(f.root);
  await expect(commitAgentUISourceTransaction(f.root, config, "legacy-resource", [
    { target: "agent-ui/vendor/assistant-ui/legacy.ts", content: Buffer.from("export const upstream = true;") },
  ], Buffer.from("{}"))).rejects.toMatchObject({ code: "AGENT_UI_UPSTREAM_SOURCE_FORBIDDEN" });
  await expect(readFile(path.join(f.sourceRoot, "agent-ui/vendor/assistant-ui/legacy.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects deferred A2UI installation through official and direct source APIs", async () => {
  const f = await fixture();
  await expect(installOfficialAgentUIResource(f.root, "a2ui")).rejects.toMatchObject({ code: "RESOURCE_UNKNOWN" });
  await expect(installOptionalAgentUIResource(f.root, "integration/a2ui")).rejects.toMatchObject({ code: "AGENT_UI_RESOURCE_DISABLED" });
  await expect(installMockResource(f.root, "integration/a2ui")).rejects.toMatchObject({ code: "AGENT_UI_RESOURCE_DISABLED" });
  await expect(readFile(path.join(f.sourceRoot, "integrations/a2ui/index.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});
