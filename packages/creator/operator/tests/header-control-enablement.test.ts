import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

import { initializeAgentUIProject } from "../src/bootstrap/initialize-agent-ui-project";
import { agentUIModeRegistry } from "../src/framework/modes/index";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { mutateAppUIModel } from "../src/project/app-ui-transaction";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";
import { buildCreatorActionCatalog } from "../src/project/creator-action-catalog";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { completePluginEnablement, preparePluginEnablement } from "../src/project/plugin-enablement";
import { collectPluginProjectFacts, generatePluginRegistryFromFacts } from "../src/project/registry-generator";
import { repositoryRoot } from "./support/generated-project";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

// Exercise installed catalog -> application preparation -> Creator Add candidate
// -> Host transaction, without inventing a Layout Row for either control.
it.each(["platform", "assistant", "embedded"] as const)(
  "%s enables both header controls through their canonical Slot and preserves position on re-enable",
  async mode => {
    const root = await mkdtemp(path.join(tmpdir(), "header-controls 空间-"));
    roots.push(root);
    const host = path.join(repositoryRoot, "examples/creator-host-sandbox");
    await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
    await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot: "agent-ui" }, createAgentUIInitializationHost());
    const context = await resourcePaths(root);
    const readModel = async () => parseAppUIModelJson(await readFile(context.paths.appUIModelPath, "utf8"));
    const original = await readModel();

    // Both orders must work: locale cannot rely on theme already being selected.
    const order = mode === "assistant" ? ["theme-switch", "locale-switch"] : ["locale-switch", "theme-switch"];
    for (const pluginId of order) {
      const before = await readFile(context.paths.appUIModelPath, "utf8");
      const preparation = await preparePluginEnablement(root, pluginId);
      await completePluginEnablement(root, preparation);
      expect(await readFile(context.paths.appUIModelPath, "utf8")).toBe(before);

      const model = await readModel();
      const projectFacts = await collectPluginProjectFacts(root, context.config, context.paths);
      const generation = generatePluginRegistryFromFacts(model, projectFacts);
      expect(generation.errors).toEqual([]);
      const appUIModelHash = createHash("sha256").update(before).digest("hex");
      const catalog = await buildCreatorActionCatalog({ model, generation, projectFacts, appUIModelHash,
        workspacePolicy: agentUIModeRegistry.get(mode).workspace });
      const candidate = catalog.candidates.find(action => action.kind === "add_existing_plugin" &&
        action.target.pluginId === pluginId && action.effect.type === "add_default");
      expect(candidate, `${pluginId} must have a ready default Add action`).toMatchObject({
        status: "ready", effect: { type: "add_default", placementDomain: "plugin_slot" },
      });
      const binding = catalog.bindings.get(candidate!.actionId)!;
      expect(binding.status).toBe("ready");
      if (binding.status !== "ready") throw new Error("Expected a ready Add binding");
      await mutateAppUIModel(root, { appUIModelHash, operations: [binding.operation] });
    }

    const model = await readModel();
    const surface = collectAppUIPluginLocations(model).find(({ plugin }) => plugin.pluginId === "conversation-surface")!.plugin;
    expect(surface.slots?.headerActions?.map(plugin => plugin.pluginId)).toEqual(order);
    expect(collectAppUIPluginLocations(model).filter(({ plugin }) => order.includes(plugin.pluginId)).map(({ target }) => target))
      .toEqual(order.map(() => ({ type: "plugin_slot", parentInstanceId: surface.id, slot: "headerActions" })));
    const beforeRoot = structuredClone(model.root);
    delete surface.slots!.headerActions;
    // No layout tracks or sibling rows are introduced by the formal Add path.
    const originalSurface = collectAppUIPluginLocations(original).find(({ plugin }) => plugin.pluginId === "conversation-surface")!.plugin;
    originalSurface.slots ??= {};
    delete originalSurface.slots.headerActions;
    expect(model.root).toEqual(original.root);

    const id = collectAppUIPluginLocations({ ...model, root: beforeRoot }).find(({ plugin }) => plugin.pluginId === "locale-switch")!.plugin.id;
    for (const enabled of [false, true]) {
      const source = await readFile(context.paths.appUIModelPath, "utf8");
      await mutateAppUIModel(root, { appUIModelHash: createHash("sha256").update(source).digest("hex"),
        operations: [{ type: "set_plugin_enabled", instanceId: id, enabled }] });
      const location = collectAppUIPluginLocations(await readModel()).find(({ plugin }) => plugin.id === id)!;
      expect(location.target).toEqual({ type: "plugin_slot", parentInstanceId: surface.id, slot: "headerActions" });
    }
    const final = await readModel();
    expect(final.root).toEqual(beforeRoot);
  },
  120_000,
);
