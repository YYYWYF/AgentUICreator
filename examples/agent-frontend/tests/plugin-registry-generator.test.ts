import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { generatePluginRegistry } from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: ["plugins/catalog"],
  uiPackages: [],
};

function modelFor(pluginIds: readonly string[]): AppUIModel {
  return {
    version: "2",
    root: {
      id: "main-node",
      type: "slot",
      slotId: "main",
    },
    pluginInstances: Object.fromEntries(
      pluginIds.map((pluginId, index) => [
        `instance-${index}`,
        {
          id: `instance-${index}`,
          pluginId,
          enabled: index === 0,
          ...(index === 0 ? { mount: { slotId: "main" } } : {}),
        },
      ]),
    ),
  };
}

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "registry-agent-ui-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "plugins"), { recursive: true });
  return projectRoot;
}

async function createPlugin(
  projectRoot: string,
  directory: string,
  pluginId: string,
  options: { headless?: boolean; defaultExport?: boolean } = {},
): Promise<void> {
  const pluginRoot = path.join(projectRoot, "plugins", directory);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, "manifest.json"),
    JSON.stringify({
      id: pluginId,
      name: pluginId,
      description: "Fixture plugin",
      version: "1.0.0",
      capabilities: options.headless ? ["headless"] : ["visual"],
    }),
  );
  await writeFile(
    path.join(pluginRoot, "definition.ts"),
    options.defaultExport === false
      ? "export const plugin = {};\n"
      : "const plugin = {};\nexport { plugin as default };\n",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("generatePluginRegistry", () => {
  it("selects every referenced plugin deterministically, including disabled instances", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "beta-dir", "beta", { headless: true });
    await createPlugin(projectRoot, "alpha-dir", "alpha");
    await createPlugin(projectRoot, "catalog", "catalog-only");
    await createPlugin(projectRoot, "unselected", "unselected");
    const model = modelFor(["beta", "alpha", "alpha"]);

    const first = await generatePluginRegistry(
      projectRoot,
      model,
      fixtureConfig,
    );
    const second = await generatePluginRegistry(
      projectRoot,
      model,
      fixtureConfig,
    );

    expect(first.errors).toEqual([]);
    expect(first.selectedPluginIds).toEqual(["alpha", "beta"]);
    expect(first.registeredPluginIds).toEqual(["alpha", "beta"]);
    expect(first.headlessPluginIds).toEqual(["beta"]);
    expect(first.source).toBe(second.source);
    expect(first.source).toContain(
      'import pluginDefinition0 from "./alpha-dir/definition";',
    );
    expect(first.source).toContain(
      'import pluginDefinition1 from "./beta-dir/definition";',
    );
    expect(first.source).not.toContain("catalog-only");
    expect(first.source).not.toContain("unselected");
  });

  it("removes an asset from the output after its last instance is removed", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "sample", "sample");

    const selected = await generatePluginRegistry(
      projectRoot,
      modelFor(["sample", "sample"]),
      fixtureConfig,
    );
    const removed = await generatePluginRegistry(
      projectRoot,
      modelFor([]),
      fixtureConfig,
    );

    expect(selected.registeredPluginIds).toEqual(["sample"]);
    expect(removed.registeredPluginIds).toEqual([]);
    expect(removed.source).not.toContain("./sample/definition");
    expect(removed.assets).toContainEqual(
      expect.objectContaining({ pluginId: "sample" }),
    );
  });

  it("rejects selected assets without a default definition export", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "sample", "sample", {
      defaultExport: false,
    });

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["sample"]),
      fixtureConfig,
    );

    expect(result.registeredPluginIds).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "selected-plugin-default-export-missing",
      }),
    );
  });

  it("rejects duplicate plugin ids and missing selected assets", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "sample-a", "sample");
    await createPlugin(projectRoot, "sample-b", "sample");

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["sample", "missing"]),
      fixtureConfig,
    );

    expect(result.registeredPluginIds).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "duplicate-plugin-id" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-asset-missing" }),
    );
  });

  it("rejects a selected plugin whose definition file is missing", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "sample", "sample");
    await unlink(path.join(projectRoot, "plugins", "sample", "definition.ts"));

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["sample"]),
      fixtureConfig,
    );

    expect(result.registeredPluginIds).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-definition-missing" }),
    );
  });

  it("reports undeclared plugin directories and invalid definition syntax", async () => {
    const projectRoot = await createProject();
    await mkdir(path.join(projectRoot, "plugins", "undeclared"));
    await createPlugin(projectRoot, "sample", "sample");
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "definition.ts"),
      "export default {\n",
    );

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["sample"]),
      fixtureConfig,
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "plugin-manifest-missing" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-definition-parse" }),
    );
  });
});
