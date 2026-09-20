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
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

function modelFor(pluginIds: readonly string[]): AppUIModel {
  return {
    applicationPlugins: pluginIds
      .filter((pluginId) => pluginId === "beta")
      .map((pluginId, index) => ({
        id: `application-${index}`,
        pluginId,
        enabled: true,
      })),
    root: {
      type: "slot",
      plugins: pluginIds
        .filter((pluginId) => pluginId !== "beta")
        .map((pluginId, index) => ({
          id: `instance-${index}`,
          pluginId,
          enabled: index === 0,
        })),
    },
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
  options: {
    headless?: boolean;
    defaultExport?: boolean;
    childSlots?: readonly string[];
  } = {},
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
      ...(options.childSlots === undefined
        ? {}
        : {
            slots: {
              children: Object.fromEntries(options.childSlots.map((slot) => [
                slot,
                {
                  description: `${slot} fixture Slot.`,
                  cardinality: "many",
                  optional: true,
                },
              ])),
            },
          }),
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
  it("generates a stable lazy capability catalog while resolving active definitions", async () => {
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
    expect(first.activeComposition.selectedPluginIds).toEqual(["alpha", "beta"]);
    expect(first.activeComposition.resolvedPluginIds).toEqual(["alpha", "beta"]);
    expect(first.capabilityCatalog.pluginIds).toEqual([
      "alpha",
      "beta",
      "unselected",
    ]);
    expect(first.activeComposition.headlessPluginIds).toEqual(["beta"]);
    expect(first.capabilityCatalog.source).toBe(second.capabilityCatalog.source);
    expect(first.capabilityCatalog.source).toContain(
      'import("./alpha-dir/definition")',
    );
    expect(first.capabilityCatalog.source).toContain(
      'import("./beta-dir/definition")',
    );
    expect(first.capabilityCatalog.source).not.toContain("catalog-only");
    expect(first.capabilityCatalog.source).toContain("unselected");
    expect(first.capabilityCatalog.source).not.toMatch(/import pluginDefinition/u);
  });

  it("builds a pure child Slot catalog from selected manifests", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "owner", "owner", {
      childSlots: ["owner.body", "owner.header"],
    });

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["owner"]),
      fixtureConfig,
    );

    expect(result.errors).toEqual([]);
    expect(result.activeComposition.slotCatalog).toEqual({
      owner: {
        "owner.body": {
          description: "owner.body fixture Slot.", cardinality: "many", optional: true,
        },
        "owner.header": {
          description: "owner.header fixture Slot.", cardinality: "many", optional: true,
        },
      },
    });
  });

  it("keeps capability membership stable after its last instance is removed", async () => {
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

    expect(selected.activeComposition.resolvedPluginIds).toEqual(["sample"]);
    expect(removed.activeComposition.resolvedPluginIds).toEqual([]);
    expect(removed.capabilityCatalog.source).toContain("./sample/definition");
    expect(removed.capabilityCatalog.source).toBe(
      selected.capabilityCatalog.source,
    );
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

    expect(result.activeComposition.resolvedPluginIds).toEqual([]);
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

    expect(result.activeComposition.resolvedPluginIds).toEqual([]);
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

    expect(result.activeComposition.resolvedPluginIds).toEqual([]);
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

  it("does not parse an inactive implementation into the Preview module graph", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "active", "active");
    await createPlugin(projectRoot, "inactive", "inactive");
    await writeFile(
      path.join(projectRoot, "plugins", "inactive", "definition.ts"),
      "export default {\n",
    );

    const result = await generatePluginRegistry(
      projectRoot,
      modelFor(["active"]),
      fixtureConfig,
    );

    expect(result.errors).toEqual([]);
    expect(result.capabilityCatalog.source).toContain('import("./inactive/definition")');
  });

  it("scopes declaration issues to selected Plugins", async () => {
    const projectRoot = await createProject();
    await createPlugin(projectRoot, "active", "active");
    await createPlugin(projectRoot, "broken", "broken");
    await writeFile(
      path.join(projectRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext" },
        include: ["plugins/**/*.ts"],
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", "active", "definition.ts"),
      "const definition = { manifest: {}, Component: () => null };\nexport default definition;\n",
    );
    await unlink(path.join(projectRoot, "plugins", "broken", "definition.ts"));

    const healthy = await generatePluginRegistry(
      projectRoot,
      modelFor(["active"]),
      fixtureConfig,
    );
    expect(healthy.errors).toEqual([]);

    const selectedBroken = await generatePluginRegistry(
      projectRoot,
      modelFor(["active", "broken"]),
      fixtureConfig,
    );
    expect(selectedBroken.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-definition-missing" }),
    );
  });
});
