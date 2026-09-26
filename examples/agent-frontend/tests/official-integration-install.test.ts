import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "@agent-ui/source-registry";
import { applyAgentUISourceItem, inspectAgentUISources, removeAgentUISourceItems } from "../scripts/ui-project/source-registry";
import { uiProjectControlConfig } from "../scripts/ui-project/project-config";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "official-integration-")); roots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { "react-hook-form": "^7", "@assistant-ui/react-hook-form": "0.12.34" } }));
  for (const [name, version] of [["react-hook-form", "7.0.0"], ["@assistant-ui/react-hook-form", "0.12.34"]]) {
    const directory = path.join(root, "node_modules", name!); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
  }
  return root;
}
it("installs the Integration and Demo in one closure, stays idempotent and guards reverse dependencies", async () => {
  const root = await fixture();
  const before = await inspectAgentUISources(root);
  const form = before.items.find(item => item.id === "demo/frontend-tool-form")!;
  expect(form.requirements).toEqual([]);
  expect(form.resolvedRequirements.map(item => item.name)).toEqual(["@assistant-ui/react-hook-form", "react-hook-form"]);
  const install = await applyAgentUISourceItem(root, { itemId: form.id, expectedStateHash: before.stateHash });
  expect(install.changedItems).toEqual(["foundation/core-runtime", "integration/react-hook-form", form.id]);
  const after = await inspectAgentUISources(root);
  expect(after.items.find(item => item.id === form.id)?.dependencyIssues).toEqual([]);
  const lock = JSON.parse(await readFile(path.join(root, uiProjectControlConfig.agentUI.metadataRoot, "source-lock.json"), "utf8"));
  expect(Object.keys(lock.items)).toEqual(expect.arrayContaining(["integration/react-hook-form", form.id]));
  expect((await applyAgentUISourceItem(root, { itemId: form.id, expectedStateHash: after.stateHash })).changed).toBe(false);
  await expect(removeAgentUISourceItems(root, { itemIds: ["integration/react-hook-form"], expectedStateHash: after.stateHash })).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_DEPENDENCY_IN_USE" });
  expect((await inspectAgentUISources(root)).stateHash).toBe(after.stateHash);
  await removeAgentUISourceItems(root, { itemIds: [form.id, "integration/react-hook-form"], expectedStateHash: after.stateHash });
});
it.each(["react-hook-form", "@assistant-ui/react-hook-form"])("reports transitive blocker %s without changing direct requirements", async name => {
  const root = await fixture();
  await rm(path.join(root, "node_modules", name), { recursive: true });
  const inspection = await inspectAgentUISources(root);
  const form = inspection.items.find(item => item.id === "demo/frontend-tool-form")!;
  expect(form.requirements).toEqual([]);
  expect(form.resolvedRequirements.find(item => item.name === name)?.compatible).toBe(false);
  await expect(applyAgentUISourceItem(root, { itemId: form.id, expectedStateHash: inspection.stateHash })).rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_MISSING" });
});
it("respects legacy host-owned Runtime without adopting its files into the optional lock", async () => {
  const root = await fixture();
  const registry = await loadAgentUISourceRegistry();
  const foundation = registry.byId.get("foundation/core-runtime")!;
  for (const file of foundation.loadedFiles) {
    const target = path.join(root, file.target); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  const config = { ...uiProjectControlConfig, agentUI: { ...uiProjectControlConfig.agentUI, sourceRoot: ".", providedSourceItems: [foundation.id] } };
  const before = await inspectAgentUISources(root, config);
  const install = await applyAgentUISourceItem(root, { itemId: "integration/react-hook-form", expectedStateHash: before.stateHash }, config);
  expect(install.changedItems).toEqual(["integration/react-hook-form"]);
  const lock = JSON.parse(await readFile(path.join(root, config.agentUI.metadataRoot, "source-lock.json"), "utf8"));
  expect(lock.items[foundation.id]).toBeUndefined();
  expect((await inspectAgentUISources(root, config)).items.find(item => item.id === "integration/react-hook-form")?.dependencyIssues).toEqual([]);
});
