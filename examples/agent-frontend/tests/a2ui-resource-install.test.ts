import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { minVersion } from "semver";
import { afterEach, expect, it } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { installMockResource, inspectScenarioResources } from "../scripts/ui-project/install-scenario-resources";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(legacy = false) {
  const root = await mkdtemp(path.join(tmpdir(), "a2ui-resource-")); roots.push(root);
  const sourceRoot = legacy ? root : path.join(root, "custom-ui");
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify(legacy ? { version: "1", mode: "platform" } : { version: "2", mode: "platform", sourceRoot: "custom-ui" }));
  const registry = await loadAgentUISourceRegistry();
  const closure = resolveAgentUISourceItemClosure(registry, "integration/a2ui");
  const dependencies = Object.assign({}, ...closure.map(item => item.packages ?? {})) as Record<string, string>;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  if (legacy) {
    const mapping: Record<string, string> = { "index.ts": "src/App.tsx", "application/Agent.tsx": "src/App.tsx", "application/composition-store.ts": "src/runtime-composition-store.ts" };
    for (const file of closure.filter(item => item.kind === "foundation").flatMap(item => item.loadedFiles)) {
      const target = path.join(sourceRoot, mapping[file.target] ?? file.target);
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
    }
  }
  const modelPath = path.join(sourceRoot, "app-ui/app-ui.json"); await mkdir(path.dirname(modelPath), { recursive: true });
  await writeFile(modelPath, JSON.stringify({ root: { type: "slot", plugins: [] } }));
  return { root, sourceRoot, modelPath };
}
it.each([false, true])("installs a pluginless/tool-less A2UI resource without changing AppUIModel (legacy=%s)", async legacy => {
  const f = await fixture(legacy);
  const model = await readFile(f.modelPath, "utf8");
  await installMockResource(f.root, "integration/a2ui");
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  const inspection = await inspectScenarioResources(f.root);
  expect(inspection.items.find(item => item.id === "integration/a2ui")).toMatchObject({ status: "managed", dependencyIssues: [] });
  expect(inspection.items.find(item => item.id === "integration/a2ui")!.resolvedRequirements.every(requirement => requirement.compatible)).toBe(true);
  const generated = await readFile(path.join(f.sourceRoot, "agent-ui/conversation/integrations.generated.tsx"), "utf8");
  expect(generated).toContain('from "./integrations/a2ui"');
  expect(await readFile(path.join(f.sourceRoot, "agent-contract/frontend-tools.generated.ts"), "utf8")).not.toContain("present");
  await installMockResource(f.root, "integration/a2ui");
  expect(await readFile(f.modelPath, "utf8")).toBe(model);
  expect(await readFile(path.join(f.sourceRoot, "agent-ui/conversation/integrations.generated.tsx"), "utf8")).toBe(generated);
});
it("reports incompatible optional dependencies before writing source", async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, "node_modules/@assistant-ui/react-generative-ui/package.json"), JSON.stringify({ name: "@assistant-ui/react-generative-ui", version: "0.0.18" }));
  await expect(installMockResource(f.root, "integration/a2ui")).rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET" });
  await expect(readFile(path.join(f.sourceRoot, "integrations/a2ui/index.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});
