import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { verifyUIProject } from "../scripts/verify-ui";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
};

async function createProject(options: {
  instancePluginId: string;
  mounted: boolean;
  headless?: boolean;
}): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "verify-agent-ui-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins", "sample"), {
    recursive: true,
  });
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "manifest.json"),
    JSON.stringify({
      id: "sample",
      name: "Sample",
      description: "Fixture",
      version: "1.0.0",
      capabilities: options.headless ? ["headless"] : ["visual"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "definition.ts"),
    "const samplePlugin = {};\nexport default samplePlugin;\n",
  );
  const model: AppUIModel = {
    version: "2",
    root: {
      type: "slot",
      id: "main-slot-node",
      slotId: "main",
    },
    pluginInstances: {
      "sample-main": {
        id: "sample-main",
        pluginId: options.instancePluginId,
        enabled: true,
        ...(options.mounted ? { mount: { slotId: "main" } } : {}),
      },
    },
  };
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify(model),
  );
  const registry = await generatePluginRegistry(
    projectRoot,
    model,
    fixtureConfig,
  );
  await writeFile(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registry.source,
  );
  await writeFile(
    path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
    PLUGIN_REGISTRY_ENTRY_SOURCE,
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("verifyUIProject", () => {
  it("allows an enabled visual instance without ordinary mount and reports it as inactive", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: false,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("passed");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "unmounted-enabled-instance" }),
    );
  });

  it("allows an explicitly headless PluginInstance to remain unmounted", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: false,
      headless: true,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("passed");
    expect(result.registry.headlessPluginIds).toEqual(["sample"]);
    expect(result.registry.generatedFileFresh).toBe(true);
  });

  it("rejects PluginInstances whose plugin asset does not exist", async () => {
    const projectRoot = await createProject({
      instancePluginId: "missing",
      mounted: true,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-asset-missing" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "unregistered-plugin" }),
    );
  });

  it("reports a stale generated registry without modifying it", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
    });
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    await writeFile(registryPath, "// stale\n");

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.registry.generatedFileFresh).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "plugin-registry-generated-stale" }),
    );
    expect(await readFile(registryPath, "utf8")).toBe("// stale\n");
  });

  it("rejects mount targets absent from the Layout Tree", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
    });
    const modelPath = path.join(projectRoot, "app-ui", "app-ui.json");
    const model = JSON.parse(await readFile(modelPath, "utf8")) as AppUIModel;
    model.pluginInstances["sample-main"]!.mount = { slotId: "missing" };
    await writeFile(modelPath, JSON.stringify(model));

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "app-ui-model" }),
    );
  });
});
