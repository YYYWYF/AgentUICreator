import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeGeneratedPluginRegistry } from "../scripts/generate-plugin-registry";
import { verifyUIProject } from "../scripts/verify-ui";
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
import { inspectCreatorProject } from "../scripts/ui-project/creator-project-inspector";
import { collectPluginAssets } from "../scripts/ui-project/plugin-assets";
import { inspectUIProject } from "../scripts/ui-project/project-inspector";
import { PLUGIN_REGISTRY_ENTRY_SOURCE } from "../scripts/ui-project/registry-generator";
import { uiProjectControlConfig } from "../scripts/ui-project/project-config";
import { createV2ProjectFixture } from "./v2-project-fixture";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const project = await createV2ProjectFixture();
  roots.push(project.projectRoot);
  return project;
}

describe("V2 managed source paths", () => {
  it("discovers only sourceRoot plugins and reports project-relative asset paths", async () => {
    const { projectRoot, paths } = await fixture();
    const inventory = await collectPluginAssets(projectRoot, paths, uiProjectControlConfig);
    expect(inventory.errors).toEqual([]);
    expect(inventory.assets.map((asset) => asset.pluginId)).toEqual(["foo"]);
    expect(inventory.assets[0]).toMatchObject({
      manifestPath: "src/agent-ui/plugins/foo/manifest.json",
      definitionPath: "src/agent-ui/plugins/foo/definition.ts",
    });
  });

  it("writes the generated registry under sourceRoot and reads the V2 entry", async () => {
    const { projectRoot, paths } = await fixture();
    await writeFile(paths.pluginRegistryEntryPath, PLUGIN_REGISTRY_ENTRY_SOURCE);
    const result = await writeGeneratedPluginRegistry(projectRoot);
    expect(result).toMatchObject({ changed: true, path: "src/agent-ui/plugins/registry.generated.ts", pluginIds: ["foo"] });
    expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toContain('import { createPluginCapabilityCatalog } from "../runtime/composition";');
    await expect(stat(path.join(projectRoot, "plugins/registry.generated.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await verifyUIProject(projectRoot)).capabilityCatalog.generatedFileFresh).toBe(true);
    expect((await inspectUIProject(projectRoot)).capabilityCatalog.generatedFileFresh).toBe(true);
  });

  it("commits AppUIModel, composition revision, and registry at V2 paths", async () => {
    const { projectRoot, paths, modelSource } = await fixture();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: createHash("sha256").update(modelSource).digest("hex"),
      operations: [{ type: "set_plugin_enabled", instanceId: "foo-main", enabled: false }],
    });
    expect(result.changedPaths).toEqual([
      "src/agent-ui/app-ui/app-ui.json",
      "src/agent-ui/app-ui/composition-revision.generated.json",
      "src/agent-ui/plugins/registry.generated.ts",
    ]);
    expect(await readFile(paths.appUIModelPath, "utf8")).toContain('"enabled": false');
    expect(await readFile(path.join(paths.sourceRoot, "app-ui/composition-revision.generated.json"), "utf8")).toContain("capabilityCatalogRevision");
    expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toContain("pluginCapabilityCatalog");
    await expect(stat(path.join(projectRoot, "plugins/registry.generated.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps stale artifacts as warnings but rejects invalid selected plugins", async () => {
    const { projectRoot, paths, model } = await fixture();
    expect(await inspectCreatorProject(projectRoot)).toMatchObject({
      status: "ready",
      warnings: [{ code: "AGENT_UI_GENERATED_REGISTRY_STALE", severity: "warning" }],
    });
    const brokenModel = { ...model, root: { type: "slot", plugins: [{ id: "missing-main", pluginId: "missing", enabled: true }] } };
    await writeFile(paths.appUIModelPath, JSON.stringify(brokenModel));
    expect(await inspectCreatorProject(projectRoot)).toMatchObject({
      status: "broken",
      issues: [{ code: "selected-plugin-asset-missing", severity: "error" }],
    });
  });
});
