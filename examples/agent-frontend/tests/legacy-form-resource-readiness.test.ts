import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { installMockResource, inspectScenarioResources } from "../scripts/ui-project/install-scenario-resources";
import { mergeOptionalResourceInspection, resourcePaths } from "../scripts/ui-project/optional-resource-paths";
import { inspectAgentUISources } from "../scripts/ui-project/source-registry";
import { inspectUIComposition } from "../scripts/ui-project/project-inspector";
import { inspectMockDemoCompatibility } from "../../../packages/creator/src/mock/demo-compatibility";

const exampleRoot = fileURLToPath(new URL("..", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "legacy-form-readiness-")); roots.push(root);
  for (const directory of ["framework", "runtime", "plugins", "services", "application", "app-ui", "agent-ui", "src"]) {
    await cp(path.join(exampleRoot, directory), path.join(root, directory), { recursive: true });
  }
  const pkg = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8"));
  await writeFile(path.join(root, "package.json"), JSON.stringify(pkg));
  await mkdir(path.join(root, "node_modules"));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const destination = path.join(root, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(path.join(exampleRoot, "node_modules", name), destination, "dir");
  }
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ version: "1", mode: "platform" }));
  const registry = await loadAgentUISourceRegistry();
  const foundations = resolveAgentUISourceItemClosure(registry, "integration/react-hook-form").filter(item => item.kind === "foundation");
  for (const file of foundations.flatMap(item => item.loadedFiles)) {
    const target = path.join(root, file.target); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  return { root, foundations };
}
it("transitions legacy Form resources from missing to ready using the Workbench ownership merge", async () => {
  const { root, foundations } = await fixture();
  async function compatibility() {
    const composition = await inspectUIComposition(root);
    const normal = await inspectAgentUISources(root);
    const resources = await inspectScenarioResources(root);
    const sources = await mergeOptionalResourceInspection(normal, resources);
    return { sources, requirement: inspectMockDemoCompatibility(composition, sources).requirements.find(item => item.id === "frontend-tool-form")! };
  }
  expect((await compatibility()).requirement.status).toBe("missing");
  const before = await Promise.all(foundations.flatMap(item => item.loadedFiles).map(file => readFile(path.join(root, file.target))));
  await installMockResource(root, "demo/frontend-tool-form");
  const result = await compatibility();
  expect(result.requirement.status).toBe("ready");
  expect(result.sources.items.find(item => item.id === "integration/react-hook-form")?.status).toBe("managed");
  expect(result.sources.items.find(item => item.id === "demo/frontend-tool-form")?.status).toBe("managed");
  const { config } = await resourcePaths(root);
  const lock = JSON.parse(await readFile(path.join(root, config.agentUI.metadataRoot, "source-lock.json"), "utf8"));
  expect(Object.keys(lock.items).sort()).toEqual(["demo/frontend-tool-form", "integration/react-hook-form"]);
  const after = await Promise.all(foundations.flatMap(item => item.loadedFiles).map(file => readFile(path.join(root, file.target))));
  expect(after).toEqual(before);
});
it("marks missing host foundation files partial and never silently installs them", async () => {
  const { root, foundations } = await fixture();
  const foundation = foundations[0]!;
  const missing = foundation.loadedFiles[0]!;
  await rm(path.join(root, missing.target));
  const resources = await inspectScenarioResources(root);
  expect(resources.items.find(item => item.id === foundation.id)?.status).toBe("partial");
  await expect(installMockResource(root, "integration/react-hook-form")).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PARTIAL" });
  await expect(readFile(path.join(root, missing.target))).rejects.toMatchObject({ code: "ENOENT" });
});

it("accepts customized host foundations without adopting or overwriting them", async () => {
  const { root, foundations } = await fixture();
  const file = foundations[0]!.loadedFiles[0]!;
  const custom = `${file.content.toString("utf8")}\n// Legacy host customization\n`;
  await writeFile(path.join(root, file.target), custom);
  const resources = await inspectScenarioResources(root);
  expect(resources.items.find(item => item.id === foundations[0]!.id)?.status).toBe("customized");
  await installMockResource(root, "integration/react-hook-form");
  expect(await readFile(path.join(root, file.target), "utf8")).toBe(custom);
  const { config } = await resourcePaths(root);
  const lock = JSON.parse(await readFile(path.join(root, config.agentUI.metadataRoot, "source-lock.json"), "utf8"));
  expect(Object.keys(lock.items)).toEqual(["integration/react-hook-form"]);
});
