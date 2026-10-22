// @vitest-environment node
import { handleUIOperatorRequest } from "../../src/handler";
import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host";
import { generatedProjectFixture } from "../support/generated-project";
import { spawn } from "node:child_process";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { inspectCreatorProject } from "../../src/project/creator-project-inspector";
import type { UIOperatorResponse } from "../../src/handler";
import type { AgentUISourceInspection, UICompositionInspection } from "../../src/project/types";
import { compileAppUIModel } from "../../src/framework/contracts/app-ui-compiler";
import { parseAppUIModelJson } from "../../src/framework/contracts/app-ui-model";
import { generatePluginRegistry } from "../../src/project/registry-generator";
import { resolveAgentUIProjectPaths, operatorConfigForPaths } from "../../src/project/agent-ui-project-paths";
import { inspectMockDemoCompatibility } from "../../../src/mock/demo-compatibility";
import { installDemoPlugin } from "../../src/project/install-demo-plugin";
import { verifyUIProject } from "../../src/verify-ui";

const initializationHost = createAgentUIInitializationHost();

const exampleRoot = await generatedProjectFixture();
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

/** Dependencies are preinstalled, but no Agent UI source or control script is seeded. */
export async function freshUserHost(sourceRoot: string) {
  const root = await mkdtemp(path.join(tmpdir(), "fresh-user-host-"));
  roots.push(root);
  const pkg = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8"));
  const devDependencies = { tailwindcss: pkg.devDependencies.tailwindcss, "@tailwindcss/vite": pkg.devDependencies["@tailwindcss/vite"], "tw-animate-css": pkg.devDependencies["tw-animate-css"] };
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fresh-user-host", type: "module", dependencies: pkg.dependencies, devDependencies }));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, path.dirname(sourceRoot)), { recursive: true });
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
  await writeFile(path.join(root, "src/main.tsx"), 'import React from "react"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")!).render(<main>Host</main>);');
  await writeFile(path.join(root, "vite.config.ts"), 'import { defineConfig } from "vite"; export default defineConfig({});');
  // Link the Host's declared frontend and stylesheet dependencies. This
  // fresh Host has no tsx binary, bootstrap package or Creator dependency.
  await mkdir(path.join(root, "node_modules"));
  for (const name of Object.keys({ ...pkg.dependencies, ...devDependencies })) {
    const destination = path.join(root, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(path.join(exampleRoot, "node_modules", name), destination, "dir");
  }
  return root;
}

const matrix = (["assistant", "embedded", "platform"] as const).flatMap(mode =>
  ["src/agent-ui", "client/custom-agent"].map(sourceRoot => ({ mode, sourceRoot })));

describe("fresh user Host architecture regression", () => {
  it.each(matrix)("initializes and mutates $mode at $sourceRoot", async ({ mode, sourceRoot }) => {
    const root = await freshUserHost(sourceRoot);
    await expect(readFile(path.join(root, "scripts/ui-operator.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await inspectCreatorProject(root)).status).toBe("uninitialized");
    await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot }, initializationHost);
    expect((await inspectCreatorProject(root)).status).toBe("ready");
    expect(await readFile(path.join(root, sourceRoot, "index.ts"), "utf8")).toContain("Agent");
    expect((await verifyUIProject(root)).status).toBe("passed");
    const entry = path.join(root, ".agent-ui/operator/entry.mjs");
    expect(await readFile(entry, "utf8")).toContain("runUIOperatorCli");
    await expect(readFile(path.join(root, "node_modules/.bin/tsx"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, "scripts/ui-operator.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    const request = async <T = UICompositionInspection>(operation: string, input: unknown = {}): Promise<T> => {
      const result = await new Promise<UIOperatorResponse>((resolve, reject) => {
        const child = spawn(process.execPath, [entry], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
        let output = "";
        let errors = "";
        child.stdout.on("data", chunk => { output += String(chunk); });
        child.stderr.on("data", chunk => { errors += String(chunk); });
        child.on("error", reject);
        child.on("close", code => {
          try {
            const response = JSON.parse(output) as UIOperatorResponse;
            if (code !== 0 && response.ok) throw new Error(errors);
            resolve(response);
          } catch (error) { reject(error); }
        });
        child.stdin.on("error", reject);
        child.stdin.end(JSON.stringify({ operation, input }));
      });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.error.message);
      return result.result as T;
    };
    await request("inspect_ui_project");
    await request("inspect_app_ui_model");
    await request("list_ui_plugins");
    const initialSources = await request<AgentUISourceInspection>("inspect_agent_ui_sources");
    await request("apply_agent_ui_source_item", { itemId: "plugin/chart-message", expectedStateHash: initialSources.stateHash });
    // Installation readiness is read through formal protocol after formal mutation.
    await installDemoPlugin(root, "chart-message");
    const installed = await request("inspect_ui_project", { view: "composition" });
    const installedSources = await request<AgentUISourceInspection>("inspect_agent_ui_sources");
    expect(inspectMockDemoCompatibility(installed, installedSources).requirements.find(requirement => requirement.id === "chart-message")?.status).toBe("ready");
    // A removable visual source plugin in an optional Slot shared by all presets.
    const pluginRoot = path.join(root, sourceRoot, "plugins/regression-probe");
    await mkdir(pluginRoot);
    await writeFile(path.join(pluginRoot, "manifest.json"), JSON.stringify({ id: "regression-probe", name: "Probe", description: "Regression probe", version: "1.0.0", capabilities: ["theme-control"] }));
    await writeFile(path.join(pluginRoot, "definition.ts"), 'import manifest from "./manifest.json"; export default { manifest, Component: () => null };');
    let snapshot = await request("inspect_ui_project", { view: "composition" });
    const surface = snapshot.pluginInstances.find(instance => instance.pluginId === "conversation-surface");
    expect(surface).toBeDefined();
    await request("mutate_app_ui_model", { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "insert_plugin", plugin: { id: "probe", pluginId: "regression-probe", enabled: true }, target: { type: "plugin_slot", parentInstanceId: surface!.id, slot: "headerActions" }, index: 0 }] });
    snapshot = await request("inspect_ui_project", { view: "composition" });
    expect(snapshot.pluginInstances.some(instance => instance.id === "probe")).toBe(true);
    await request("mutate_app_ui_model", { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "remove_plugin", instanceId: "probe" }] });
    snapshot = await request("inspect_ui_project", { view: "composition" });
    expect(snapshot.pluginInstances.some(instance => instance.id === "probe")).toBe(false);
    expect((await verifyUIProject(root)).status).toBe("passed");
    const paths = resolveAgentUIProjectPaths(root, { mode, sourceRoot });
    const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
    const registry = await generatePluginRegistry(root, model, { config: operatorConfigForPaths(paths), paths });
    const runtime = compileAppUIModel(model, registry.activeComposition.compositionCatalog);
    const revision = JSON.parse(await readFile(path.join(root, sourceRoot, "app-ui/composition-revision.generated.json"), "utf8")) as { transactionId: string };
    const verification = await request<{ verified: boolean }>("verify_runtime_composition", { appUIModelHash: snapshot.appUIModel.hash, composition: {
      appUIModelHash: snapshot.appUIModel.hash,
      compositionRevision: revision.transactionId, capabilityCatalogRevision: snapshot.capabilityCatalogRevision,
      publishedAt: "2026-09-26T00:00:00.000Z", observedAt: "2026-09-26T00:00:00.000Z",
      instances: Object.values(runtime.pluginInstances).flatMap(instance => instance.enabled && instance.mount ? [{ instanceId: instance.id, pluginId: instance.pluginId, slotId: instance.mount.slotId }] : []), slots: [],
    } });
    expect(verification.verified).toBe(true);
    const agentImport = path.relative(path.join(root, "src"), path.join(root, sourceRoot)).split(path.sep).join("/");
    await writeFile(path.join(root, "src/main.tsx"), `import React from "react"; import { createRoot } from "react-dom/client"; import { Agent } from ${JSON.stringify(agentImport.startsWith(".") ? agentImport : `./${agentImport}`)}; createRoot(document.getElementById("root")!).render(<Agent endpoint="/agent" />);`);
    const bundle = await build({ root, configFile: false, plugins: [tailwindcss()], logLevel: "silent", build: { write: false, minify: false } });
    const bundles = Array.isArray(bundle) ? bundle : [bundle];
    for (const output of bundles) {
      if (!("output" in output)) throw new Error("Expected a production build result");
      for (const chunk of output.output) {
        if (chunk.type !== "chunk") continue;
        expect(Object.keys(chunk.modules).some(id => id.includes(".agent-ui/operator"))).toBe(false);
        expect(chunk.code).not.toContain("runUIOperatorCli");
        expect(chunk.code).not.toContain("@za38.03/agent-ui-creator");
      }
    }
  }, 120_000);
});
