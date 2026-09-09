import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("inspectUIProject", () => {
  it("discovers the nested Tool Activity and Tool Item Slots", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    const result = await inspectUIProject(projectRoot);

    expect(result.appUIModel.slots).toContainEqual(
      expect.objectContaining({
        slotId: "conversation.message.tool-activity",
        owner: expect.objectContaining({
          kind: "plugin",
          instanceId: "agent-messages-main",
          pluginId: "antd-x-message-list",
        }),
        mounts: [
          expect.objectContaining({
            instanceId: "agent-tool-activity-main",
            pluginId: "antd-x-tool-activity",
          }),
        ],
      }),
    );
    expect(result.appUIModel.slots).toContainEqual(
      expect.objectContaining({
        slotId: "conversation.message.tool-item",
        owner: expect.objectContaining({
          kind: "plugin",
          instanceId: "agent-tool-activity-main",
          pluginId: "antd-x-tool-activity",
        }),
        mounts: [
          expect.objectContaining({
            instanceId: "agent-tool-message-main",
            pluginId: "antd-x-tool-message",
          }),
        ],
      }),
    );
  });

  it("returns a compact, revision-bound project snapshot", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "inspect-agent-ui-"));
    temporaryProjects.push(projectRoot);
    await mkdir(path.join(projectRoot, "app-ui"));
    await mkdir(path.join(projectRoot, "plugins", "sample"), {
      recursive: true,
    });
    await mkdir(path.join(projectRoot, "plugins", "renderer"), {
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
        slots: { children: ["sample.message"] },
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "definition.ts"),
      "const plugin = {};\nexport default plugin;\n",
    );
    await writeFile(
      path.join(projectRoot, "plugins", "renderer", "manifest.json"),
      JSON.stringify({
        id: "renderer",
        name: "Renderer",
        description: "Fixture child renderer",
        version: "1.0.0",
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", "renderer", "definition.ts"),
      "const plugin = {};\nexport default plugin;\n",
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
      pluginInstances: {
        "sample-main": {
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
          mount: { slotId: "main" },
        },
        "renderer-main": {
          id: "renderer-main",
          pluginId: "renderer",
          enabled: true,
          mount: { slotId: "sample.message" },
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
      {
        slotId: "main",
        owner: {
          kind: "layout",
          nodeId: "main-node",
          nodePath: "root.children[0]",
        },
        nodeId: "main-node",
        nodePath: "root.children[0]",
        mounts: [{ instanceId: "sample-main", pluginId: "sample", enabled: true }],
      },
      {
        slotId: "sample.message",
        owner: {
          kind: "plugin",
          instanceId: "sample-main",
          pluginId: "sample",
        },
        mounts: [{ instanceId: "renderer-main", pluginId: "renderer", enabled: true }],
      },
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
