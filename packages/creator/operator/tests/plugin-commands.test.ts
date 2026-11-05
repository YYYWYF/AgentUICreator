import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { getAgentUIAvailablePluginIds, getAgentUIPluginInstances, setAgentUIPluginEnabled } from "../src/project/plugin-commands";
const passedVerification = () => ({ status: "passed" as const,
  sourceDiagnostics: [], pluginStates: [],
  model: { valid: true, mountedInstanceIds: [], unmountedEnabledInstanceIds: [] },
  capabilityCatalog: { pluginIds: [], generatedFileFresh: true },
  activeComposition: { selectedPluginIds: [], resolvedPluginIds: [], headlessPluginIds: [] },
  services: [], creatorReadiness: { plugins: [] }, errors: [], warnings: [], responsiveRiskCount: 0,
});
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-command-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "界面 src" }));
  const model = { root: { type: "slot", plugins: [{ id: "composer", pluginId: "composer", slots: { actions: [{ id: "copy-a", pluginId: "copy-action" }, { id: "copy-b", pluginId: "copy-action", enabled: false }] } }] } };
  const file = path.join(root, "界面 src/app-ui/app-ui.json"); await mkdir(path.dirname(file), { recursive: true });
  const before = JSON.stringify(model); await writeFile(file, before);
  return { root, file, model, before };
}
it("lists nested instances and only changes the selected instance, preserving omitted fields", async () => {
  const f = await project();
  expect(await getAgentUIPluginInstances(f.root)).toEqual([{ id: "composer", pluginId: "composer", enabled: true }, { id: "copy-a", pluginId: "copy-action", enabled: true }, { id: "copy-b", pluginId: "copy-action", enabled: false }]);
  const commit = vi.fn(async (change) => {
    expect(change.path).toBe("界面 src/app-ui/app-ui.json");
    expect(change.before).toBe(f.before);
    const expected = structuredClone(f.model);
    Object.assign(expected.root.plugins[0]!.slots.actions[0]!, { enabled: false });
    expect(JSON.parse(change.after)).toEqual(expected);
    return { runId: "transaction", verification: passedVerification() };
  });
  expect(await setAgentUIPluginEnabled(f.root, "copy-a", false, commit)).toMatchObject({ changed: true, runId: "transaction" });
  expect(commit).toHaveBeenCalledTimes(1);
  // The planner cannot write outside the shared Host storage callback.
  expect(await readFile(f.file, "utf8")).toBe(f.before);
});
it("no-op uses original bytes and unknown instances cannot reach commit", async () => {
  const f = await project();
  const commit = vi.fn(async change => { expect(change.after).toBe(change.before); return { verification: passedVerification() }; });
  expect(await setAgentUIPluginEnabled(f.root, "copy-a", true, commit)).toMatchObject({ changed: false });
  await expect(setAgentUIPluginEnabled(f.root, "missing", false, commit)).rejects.toThrow("PLUGIN_INSTANCE_UNKNOWN");
  expect(commit).toHaveBeenCalledTimes(1);
});
it("preserves structural identities instead of persisting normalized IDs", async () => {
  const f = await project();
  const raw = { root: { type: "slot", plugins: [{ pluginId: "copy-action" }] } };
  await writeFile(f.file, JSON.stringify(raw));
  const [instance] = await getAgentUIPluginInstances(f.root);
  expect(instance?.enabled).toBe(true);
  await setAgentUIPluginEnabled(f.root, instance!.id, false, async change => {
    expect(JSON.parse(change.after)).toEqual({ root: { type: "slot", plugins: [{ pluginId: "copy-action", enabled: false }] } });
    return { verification: passedVerification() };
  });
});

it("discovers additions only from the exact installed catalog and checks package identity", async () => {
  const f = await project();
  expect(await getAgentUIAvailablePluginIds(f.root)).toEqual([]);
  const pkg = path.join(f.root, "node_modules/@za38.03/agent-ui-plugins");
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  await writeFile(path.join(pkg, "package.json"), JSON.stringify({ name: "@za38.03/agent-ui-plugins", version: "1.2.3", exports: { "./catalog.json": "./dist/catalog.json" } }));
  const catalog = { schemaVersion: 1, package: { name: "@za38.03/agent-ui-plugins", version: "1.2.3" }, plugins: [{ id: "chart-message", takeover: { schemaVersion: 1 } }] };
  await writeFile(path.join(pkg, "dist/catalog.json"), JSON.stringify(catalog));
  expect(await getAgentUIAvailablePluginIds(f.root)).toEqual(["chart-message"]);
  catalog.package.version = "2.0.0";
  await writeFile(path.join(pkg, "dist/catalog.json"), JSON.stringify(catalog));
  await expect(getAgentUIAvailablePluginIds(f.root)).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_MISMATCH");
});
