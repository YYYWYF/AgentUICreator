import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { inspectUIProject } from "../scripts/ui-project/project-inspector";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: ["plugins/catalog"],
  uiPackages: ["react", "antd"],
};

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("inspectUIProject", () => {
  it("returns a compact, revision-bound project snapshot", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "inspect-agent-ui-"));
    temporaryProjects.push(projectRoot);
    await mkdir(path.join(projectRoot, "app-ui"));
    await mkdir(path.join(projectRoot, "plugins", "sample"), {
      recursive: true,
    });
    await mkdir(path.join(projectRoot, "plugins", "catalog"));
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        dependencies: { react: "19.2.8" },
        devDependencies: { antd: "6.6.2" },
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "manifest.json"),
      JSON.stringify({
        id: "sample",
        name: "Sample",
        description: "Fixture plugin",
        version: "1.0.0",
        capabilities: ["visual"],
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "definition.ts"),
      "const plugin = {};\nexport default plugin;\n",
    );
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "slots.json"),
      JSON.stringify({
        actions: {
          kind: "list",
          scope: "thread",
          description: "Nested sample actions",
          fallback: "owner",
        },
      }),
    );
    const model: AppUIModel = {
      version: "2",
      root: {
        id: "root-row",
        type: "row",
        sizes: ["1fr"],
        children: [
          {
            id: "main-node",
            type: "slot",
            slotId: "main",
          },
        ],
      },
      slots: {
        main: {
          id: "main",
          kind: "single",
          scope: "root",
          description: "Main fixture slot",
          owner: { type: "layout", nodeId: "main-node" },
          occupants: [{ instanceId: "sample-main" }],
        },
        "sample.actions": {
          id: "sample.actions",
          kind: "list",
          scope: "thread",
          description: "Nested sample actions",
          owner: {
            type: "plugin-instance",
            instanceId: "sample-main",
            outlet: "actions",
          },
          fallback: "owner",
          occupants: [],
        },
      },
      pluginInstances: {
        "sample-main": {
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
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

    const result = await inspectUIProject(projectRoot, fixtureConfig);

    expect(result.appUIModel.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.appUIModel.slots).toEqual([
      expect.objectContaining({
        slotId: "main",
        kind: "single",
        scope: "root",
        owner: { type: "layout", nodeId: "main-node" },
        occupants: [
          {
            instanceId: "sample-main",
            pluginId: "sample",
            enabled: true,
          },
        ],
        nodeId: "main-node",
        nodePath: "root.children[0]",
        childSlotIds: ["sample.actions"],
        replaceRisk: "removes-descendant-slots",
      }),
      expect.objectContaining({
        slotId: "sample.actions",
        kind: "list",
        scope: "thread",
        declarer: {
          type: "plugin",
          pluginId: "sample",
          instanceId: "sample-main",
          outlet: "actions",
        },
        declarationStatus: "verified",
        declarationSource: "plugins/sample/slots.json",
        parentSlotId: "main",
        fallback: "owner",
        replaceRisk: "replaces-owner-fallback",
      }),
    ]);
    expect(result.pluginInstances).toContainEqual(
      expect.objectContaining({
        id: "sample-main",
        mountedSlotId: "main",
      }),
    );
    expect(result.registry.generatedFileFresh).toBe(true);
    expect(result.catalogs).toEqual([
      { path: "plugins/catalog", exists: true },
    ]);
    expect(result.uiStack).toEqual([
      { packageName: "react", version: "19.2.8" },
      { packageName: "antd", version: "6.6.2" },
    ]);
  });
});
