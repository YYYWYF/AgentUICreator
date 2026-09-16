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
  uiPackages: ["react", "@base-ui/react"],
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
  it("discovers the canonical assistant-ui conversation Slots", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    const result = await inspectUIProject(projectRoot);

    expect(result.mode).toBe("platform");
    expect(result.modeResolution).toEqual({
      legacy: false,
      configPath: ".agent-ui/project.json",
    });
    for (const slot of [
      "emptyWelcome",
      "emptySuggestions",
    ] as const) {
      const plugins = slot === "emptySuggestions"
        ? [
            expect.objectContaining({
              id: "conversation-suggestions-main",
              pluginId: "conversation-suggestions",
            }),
          ]
        : [];
      expect(result.appUIModel.slots).toContainEqual(
        expect.objectContaining({
          target: {
            type: "plugin_slot",
            parentInstanceId: "agent-conversation-surface-main",
            slot,
          },
          owner: expect.objectContaining({
            kind: "plugin",
            instanceId: "agent-conversation-surface-main",
            pluginId: "conversation-surface",
          }),
          plugins,
        }),
      );
    }
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
        devDependencies: { "@base-ui/react": "1.8.0" },
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
        slots: {
          children: {
            message: {
              description: "Sample child content.",
              cardinality: "many",
              optional: true
            }
          }
        },
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
      root: {
        type: "row",
        sizes: ["1fr"],
        children: [
          {
            type: "slot",
            plugins: [
              {
                id: "sample-main",
                pluginId: "sample",
                enabled: true,
                slots: {
                  message: [
                    {
                      id: "renderer-main",
                      pluginId: "renderer",
                      enabled: true
                    }
                  ]
                }
              }
            ]
          },
        ],
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
      registry.capabilityCatalog.source,
    );
    await writeFile(
      path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
      PLUGIN_REGISTRY_ENTRY_SOURCE,
    );

    const legacyResult = await inspectUIProject(projectRoot, fixtureConfig);

    expect(legacyResult.mode).toBe("platform");
    expect(legacyResult.modeResolution).toEqual({
      legacy: true,
      configPath: ".agent-ui/project.json",
    });
    await mkdir(path.join(projectRoot, ".agent-ui"));
    await writeFile(
      path.join(projectRoot, ".agent-ui", "project.json"),
      JSON.stringify({ version: "1", mode: "platform" }),
    );
    const result = await inspectUIProject(projectRoot, fixtureConfig);
    expect(result.mode).toBe("platform");
    expect(result.modeResolution).toEqual({
      legacy: false,
      configPath: ".agent-ui/project.json",
    });
    expect(result.appUIModel.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.appUIModel.slots).toEqual([
      {
        target: { type: "layout_slot", slotRef: "l1" },
        nodeRef: "l1",
        plugins: [expect.objectContaining({ id: "sample-main", pluginId: "sample" })],
      },
      {
        target: { type: "plugin_slot", parentInstanceId: "sample-main", slot: "message" },
        description: "Sample child content.",
        cardinality: "many",
        optional: true,
        owner: {
          kind: "plugin",
          instanceId: "sample-main",
          pluginId: "sample",
        },
        plugins: [{ id: "renderer-main", pluginId: "renderer", enabled: true }],
      },
    ]);
    expect(result.plugins).toContainEqual(
      expect.objectContaining({
        id: "sample-main",
        target: { type: "layout_slot", slotRef: "l1" },
      }),
    );
    expect(result.pluginAssets).toContainEqual(
      expect.objectContaining({
        pluginId: "sample",
        name: "Sample",
        description: "Fixture plugin",
      }),
    );
    expect(result.capabilityCatalog.generatedFileFresh).toBe(true);
    expect(result.activeComposition).toMatchObject({
      selectedPluginIds: ["renderer", "sample"],
      resolvedPluginIds: ["renderer", "sample"],
    });
    expect(result.catalogs).toEqual([
      { path: "plugins/catalog", exists: true },
    ]);
    expect(result.uiStack).toEqual([
      { packageName: "react", version: "19.2.8" },
      { packageName: "@base-ui/react", version: "1.8.0" },
    ]);
  });
});
