import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAgentUIProject } from "../scripts/ui-project/initialize-agent-ui-project";
import { inspectCreatorProject } from "../scripts/ui-project/creator-project-inspector";
import { handleUIProjectControlRequest } from "../scripts/ui-project-control";
import { verifyUIProject } from "../scripts/verify-ui";

const exampleRoot = fileURLToPath(new URL("../", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

/** Dependencies are preinstalled, but no Agent UI source or control script is seeded. */
export async function freshUserHost(sourceRoot: string) {
  const root = await mkdtemp(path.join(tmpdir(), "fresh-user-host-"));
  roots.push(root);
  const pkg = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fresh-user-host", type: "module", dependencies: pkg.dependencies }));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, path.dirname(sourceRoot)), { recursive: true });
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
  await writeFile(path.join(root, "src/main.tsx"), 'import React from "react"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")!).render(<main>Host</main>);');
  await writeFile(path.join(root, "vite.config.ts"), 'import { defineConfig } from "vite"; export default defineConfig({});');
  await symlink(path.join(exampleRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

const matrix = (["assistant", "embedded", "platform"] as const).flatMap(mode =>
  ["src/agent-ui", "client/custom-agent"].map(sourceRoot => ({ mode, sourceRoot })));

describe("fresh user Host architecture regression", () => {
  it.each(matrix)("initializes and mutates $mode at $sourceRoot", async ({ mode, sourceRoot }) => {
    const root = await freshUserHost(sourceRoot);
    await expect(readFile(path.join(root, "scripts/ui-project-control.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await inspectCreatorProject(root)).status).toBe("uninitialized");
    await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot });
    expect((await inspectCreatorProject(root)).status).toBe("ready");
    expect(await readFile(path.join(root, sourceRoot, "index.ts"), "utf8")).toContain("Agent");
    expect((await verifyUIProject(root)).status).toBe("passed");
    const request = async (operation: string, input: unknown = {}) => {
      const result = await handleUIProjectControlRequest({ schemaVersion: 3, operation, input }, root);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.error.message);
      return result.result as { appUIModel: { hash: string }; pluginInstances: Array<{ id: string }> };
    };
    await request("inspect_ui_project");
    await request("inspect_app_ui_model");
    // A real source plugin, independent of the preset's provider cardinality.
    const pluginRoot = path.join(root, sourceRoot, "plugins/regression-probe");
    await mkdir(pluginRoot);
    await writeFile(path.join(pluginRoot, "manifest.json"), JSON.stringify({ id: "regression-probe", name: "Probe", description: "Regression probe", version: "1.0.0" }));
    await writeFile(path.join(pluginRoot, "definition.ts"), 'import manifest from "./manifest.json"; export default { manifest, Component: () => null };');
    let snapshot = await request("inspect_ui_project", { view: "composition" });
    await request("mutate_app_ui_model", { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "insert_plugin", plugin: { id: "probe", pluginId: "regression-probe", enabled: true }, target: { type: "application" }, index: 0 }] });
    snapshot = await request("inspect_ui_project", { view: "composition" });
    expect(snapshot.pluginInstances.some(instance => instance.id === "probe")).toBe(true);
    await request("mutate_app_ui_model", { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "remove_plugin", instanceId: "probe" }] });
    snapshot = await request("inspect_ui_project", { view: "composition" });
    expect(snapshot.pluginInstances.some(instance => instance.id === "probe")).toBe(false);
    expect((await verifyUIProject(root)).status).toBe("passed");
  }, 120_000);
});
