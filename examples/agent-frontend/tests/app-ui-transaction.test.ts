import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  resolveRuntimeLayoutSlotId,
  resolveRuntimePluginSlotId,
} from "../framework/contracts/app-ui-composition";
import {
  COMPOSITION_REVISION_PATH,
  mutateAppUIModel,
} from "../scripts/ui-project/app-ui-transaction";
import { actionIdFor } from "../scripts/ui-project/creator-action-catalog";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
} from "../scripts/ui-project/registry-generator";

const temporaryProjects: string[] = [];
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

async function createPlugin(
  projectRoot: string,
  pluginId: string,
  manifestOverrides: Record<string, unknown> = {},
): Promise<void> {
  const pluginRoot = path.join(projectRoot, "plugins", pluginId);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(path.join(pluginRoot, "manifest.json"), JSON.stringify({
    id: pluginId,
    name: pluginId,
    description: "Fixture plugin.",
    version: "1.0.0",
    ...manifestOverrides,
  }));
  await writeFile(
    path.join(pluginRoot, "definition.ts"),
    "const definition = {};\nexport default definition;\n",
  );
}

async function createProject(
  manifestOverrides: Record<string, unknown> = {},
  modelOverride?: AppUIModel,
  additionalPlugins: readonly (readonly [string, Record<string, unknown>])[] = [],
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "app-ui-transaction-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await createPlugin(projectRoot, "sample", manifestOverrides);
  for (const [pluginId, overrides] of additionalPlugins) {
    await createPlugin(projectRoot, pluginId, overrides);
  }
  if (additionalPlugins.length > 0) {
    await writeFile(
      path.join(projectRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext" },
        include: ["plugins/**/*.ts"],
      }),
    );
    const definition = "const definition = { manifest: {}, Component: () => null };\nexport default definition;\n";
    for (const pluginId of ["sample", ...additionalPlugins.map(([id]) => id)]) {
      await writeFile(path.join(projectRoot, "plugins", pluginId, "definition.ts"), definition);
    }
  }
  const model: AppUIModel = modelOverride ?? {
    root: {
      type: "slot",
      plugins: [{
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
        props: { title: "Before" },
      }],
    },
  };
  const source = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(path.join(projectRoot, "app-ui", "app-ui.json"), source);
  const registry = await generatePluginRegistry(projectRoot, model);
  await writeFile(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registry.capabilityCatalog.source,
  );
  return { projectRoot, source };
}

afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

describe("AppUIModel transaction", () => {
  it("commits the authoring model only after it compiles", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "update_plugin_props",
        instanceId: "sample-main",
        set: { title: "After" },
      }],
    });

    expect(result.changed).toBe(true);
    expect(result.diff.plugins.updated).toEqual(["sample-main"]);
    const written = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as AppUIModel;
    if (written.root.type !== "slot") throw new Error("fixture");
    expect(written.root.plugins[0]?.props?.title).toBe("After");
  });

  it("removes an existing instance without rewriting the capability catalog", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "remove_plugin",
        instanceId: "sample-main",
      }],
    });

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.diff.capabilityCatalog.changed).toBe(false);
    expect(result.activeComposition.resolvedPluginIds).toEqual([]);
  });

  it("removes a history panel in one mutation without catalog churn", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-thread-list-main",
                pluginId: "sample",
                enabled: true,
              }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "sample-main",
                pluginId: "sample",
                enabled: true,
              }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject({}, model);
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [
        {
          type: "remove_plugin",
          instanceId: "conversation-thread-list-main",
        },
        { type: "remove_layout_node", nodeRef: "l1" },
      ],
    });

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.diff.capabilityCatalog).toMatchObject({
      changed: false,
      addedPluginIds: [],
      removedPluginIds: [],
    });
  });

  it("reflows a dedicated history region without a follow-up Layout operation", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-thread-list-main",
                pluginId: "sample",
                enabled: true,
              }],
            },
          },
          {
            type: "slot",
            plugins: [{ id: "sample-main", pluginId: "sample", enabled: true }],
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject({}, model);

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "remove_plugin",
        instanceId: "conversation-thread-list-main",
        reflow: "collapse-empty-region",
      }],
    });

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    )).toEqual({
      root: {
        type: "row",
        sizes: ["1fr"],
        children: [{
          type: "slot",
          plugins: [{ id: "sample-main", pluginId: "sample", enabled: true }],
        }],
      },
    });
  });

  it("productizes default removal with Host-owned reflow metadata", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{ id: "history-main", pluginId: "sample", enabled: true }],
            },
          },
          {
            type: "slot",
            plugins: [{ id: "sample-main", pluginId: "sample", enabled: true }],
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject({}, model);

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "remove_plugin_default",
        instanceId: "history-main",
      }],
    });

    expect(result.semanticComposition).toMatchObject({
      operation: "remove_plugin_default",
      semanticLoweringSucceeded: true,
      expectedRuntime: { absentInstanceIds: ["history-main"] },
      reflow: "preserved-container",
    });
    expect(JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    )).toEqual({
      root: {
        type: "row",
        sizes: ["1fr"],
        children: [{
          type: "slot",
          plugins: [{ id: "sample-main", pluginId: "sample", enabled: true }],
        }],
      },
    });
  });

  it("does not partially commit when deterministic reflow preconditions fail", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "slot",
            plugins: [
              { id: "history-main", pluginId: "sample", enabled: true },
              { id: "secondary-main", pluginId: "sample", enabled: true },
            ],
          },
          { type: "slot", plugins: [{ id: "sample-main", pluginId: "sample", enabled: true }] },
        ],
      },
    };
    const { projectRoot, source } = await createProject({}, model);
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "remove_plugin",
        instanceId: "history-main",
        reflow: "collapse-empty-region",
      }],
    })).rejects.toMatchObject({ code: "LAYOUT_REFLOW_REGION_NOT_EMPTY" });

    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("writes a CompositionRevision before a model plus catalog transaction", async () => {
    const { projectRoot, source } = await createProject();
    await createPlugin(projectRoot, "beta");
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin",
        plugin: {
          id: "beta-main",
          pluginId: "beta",
          enabled: true,
        },
        target: { type: "layout_slot", slotRef: "l0" },
      }],
    });

    expect(result.changedPaths).toEqual([
      "app-ui/app-ui.json",
      COMPOSITION_REVISION_PATH,
      GENERATED_PLUGIN_REGISTRY_PATH,
    ]);
    expect(result.compositionRevision).toBeDefined();
    expect(result.diff.capabilityCatalog).toEqual({
      changed: true,
      addedPluginIds: ["beta"],
      removedPluginIds: [],
    });
    expect(result.activeComposition).toMatchObject({
      selectedPluginIds: ["beta", "sample"],
      resolvedPluginIds: ["beta", "sample"],
    });
    expect(JSON.parse(await readFile(
      path.join(projectRoot, COMPOSITION_REVISION_PATH),
      "utf8",
    ))).toEqual(result.compositionRevision);
    expect(result.snapshotToken.capabilityCatalogRevision).toBe(
      result.compositionRevision!.capabilityCatalogRevision,
    );
  });

  it("lowers an authoring-default insertion into one deterministic visual region", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [{
          type: "panel",
          child: {
            type: "slot",
            plugins: [{
              id: "conversation-surface-main",
              pluginId: "conversation-surface",
              enabled: true,
            }],
          },
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          capabilities: ["conversation-history"],
          authoring: {
            intents: ["add conversation management"],
            visualRole: "conversation navigation",
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    });

    expect(result.semanticComposition).toMatchObject({
      operation: "insert_plugin_default",
      semanticLoweringSucceeded: true,
      expectedGeometry: {
        instanceId: "conversation-thread-list-main",
        anchorInstanceId: "conversation-surface-main",
        relation: "before",
        axis: "width",
        size: "280px",
      },
    });
    expect(JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    ))).toMatchObject({
      root: {
        type: "row",
        sizes: ["280px", "minmax(0, 1fr)"],
        children: [
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{ id: "conversation-thread-list-main" }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{ id: "conversation-surface-main" }],
            },
          },
        ],
      },
    });
  });

  it("lowers an authoring-default insertion when the anchor is a root Panel", async () => {
    const model: AppUIModel = {
      root: {
        type: "panel",
        child: {
          type: "slot",
          plugins: [{
            id: "conversation-surface-main",
            pluginId: "conversation-surface",
            enabled: true,
          }],
        },
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          capabilities: ["conversation-history"],
          authoring: {
            intents: ["add conversation management"],
            visualRole: "conversation navigation",
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    });

    expect(result.semanticComposition).toMatchObject({
      operation: "insert_plugin_default",
      semanticLoweringSucceeded: true,
      expectedGeometry: {
        instanceId: "conversation-thread-list-main",
        anchorInstanceId: "conversation-surface-main",
        relation: "before",
        axis: "width",
        size: "280px",
      },
    });
    const written = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    expect(written.root).toMatchObject({
      type: "row",
      sizes: ["280px", "minmax(0, 1fr)"],
      children: [
        {
          type: "panel",
          child: {
            type: "slot",
            plugins: [{ id: "conversation-thread-list-main" }],
          },
        },
      ],
    });
    if (written.root.type !== "row") throw new Error("fixture");
    expect(written.root.children[1]).toEqual(model.root);
  });

  it("lowers an authoring-default insertion when the anchor is a root Slot", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "conversation-surface-main",
          pluginId: "conversation-surface",
          enabled: true,
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          capabilities: ["conversation-history"],
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );

    await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    });

    const written = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    expect(written.root).toMatchObject({
      type: "row",
      sizes: ["280px", "minmax(0, 1fr)"],
      children: [
        { type: "panel", width: "280px" },
        { type: "slot", plugins: [{ id: "conversation-surface-main" }] },
      ],
    });
    if (written.root.type !== "row") throw new Error("fixture");
    expect(written.root.children[1]).toEqual(model.root);
  });

  it("preserves the current root Panel size over the anchor manifest recommendation", async () => {
    const model: AppUIModel = {
      root: {
        type: "panel",
        width: "480px",
        child: {
          type: "slot",
          plugins: [{
            id: "conversation-surface-main",
            pluginId: "conversation-surface",
            enabled: true,
          }],
        },
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );

    await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    });

    const written = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    if (written.root.type !== "row") throw new Error("fixture");
    expect(written.root.sizes).toEqual(["280px", "480px"]);
    const anchor = written.root.children[1];
    if (anchor?.type !== "panel") throw new Error("Expected original Panel.");
    expect(anchor.width).toBeUndefined();
  });

  it("closes the Productized Remove to Add round-trip from the real canonical output", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "minmax(0, 1fr)"],
        children: [
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-thread-list-main",
                pluginId: "conversation-thread-list",
                enabled: true,
              }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-surface-main",
                pluginId: "conversation-surface",
                enabled: true,
              }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          capabilities: ["conversation-history"],
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );

    const removeResult = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "remove_plugin_default",
        instanceId: "conversation-thread-list-main",
      }],
    });
    expect(removeResult.semanticComposition).toMatchObject({
      operation: "remove_plugin_default",
      semanticLoweringSucceeded: true,
      reflow: "preserved-container",
    });

    const afterRemoveSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    const afterRemove = JSON.parse(afterRemoveSource) as AppUIModel;
    expect(afterRemove).toEqual({
      root: {
        type: "row",
        sizes: ["minmax(0, 1fr)"],
        children: [{
          type: "panel",
          child: {
            type: "slot",
            plugins: [{
              id: "conversation-surface-main",
              pluginId: "conversation-surface",
              enabled: true,
            }],
          },
        }],
      },
    });

    const addResult = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(afterRemoveSource),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    });
    expect(addResult.semanticComposition).toMatchObject({
      operation: "insert_plugin_default",
      semanticLoweringSucceeded: true,
      expectedRuntime: {
        presentInstanceIds: ["conversation-thread-list-main"],
      },
      expectedGeometry: {
        instanceId: "conversation-thread-list-main",
        anchorInstanceId: "conversation-surface-main",
        relation: "before",
        axis: "width",
        size: "280px",
      },
    });

    const restored = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    expect(restored.root).toMatchObject({
      type: "row",
      sizes: ["280px", "minmax(0, 1fr)"],
      children: [
        {
          type: "panel",
          child: {
            type: "slot",
            plugins: [{ id: "conversation-thread-list-main" }],
          },
        },
        {
          type: "panel",
          child: {
            type: "slot",
            plugins: [{ id: "conversation-surface-main" }],
          },
        },
      ],
    });
  });

  it("restores the Center-only Workspace after Productized Add then Remove", async () => {
    const model: AppUIModel = { root: {
      type: "row", sizes: ["minmax(0, 1fr)"],
      children: [{ type: "panel", child: { type: "slot", plugins: [{
        id: "conversation-surface-main", pluginId: "conversation-surface", enabled: true,
      }] } }],
    } };
    const { projectRoot, source } = await createProject({}, model, [
      ["conversation-surface", { authoring: {
        intents: ["show conversation"], recommendedSize: { width: "minmax(0, 1fr)" },
      } }],
      ["conversation-thread-list", { authoring: {
        intents: ["add conversation management"],
        typicalPlacement: { relation: "before", anchorPluginId: "conversation-surface" },
        recommendedSize: { width: "280px" },
      } }],
    ]);
    const add = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{ type: "execute_creator_action", actionId: actionIdFor({
        kind: "add_existing_plugin",
        subject: { pluginId: "conversation-thread-list" },
        effect: { type: "add_default" },
      }) }],
    });
    expect(add.semanticComposition?.expectedWorkspaceFill).toEqual([
      { instanceId: "conversation-thread-list-main", region: "left", axis: "width", trackIndex: 0 },
      { instanceId: "conversation-surface-main", region: "center", axis: "width", trackIndex: 1 },
    ]);
    const afterAdd = JSON.parse(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8")) as AppUIModel;
    if (afterAdd.root.type !== "row") throw new Error("Expected Workspace Row root.");
    expect(afterAdd.root.sizes).toEqual(["280px", "minmax(0, 1fr)"]);
    expect(afterAdd.root.children.every((child) => child.type === "panel" && child.width === undefined)).toBe(true);

    const remove = await mutateAppUIModel(projectRoot, {
      appUIModelHash: add.appUIModel.afterHash,
      operations: [{ type: "execute_creator_action", actionId: actionIdFor({
        kind: "remove_plugin",
        subject: { pluginId: "conversation-thread-list", instanceId: "conversation-thread-list-main" },
        effect: { type: "remove" },
      }) }],
    });
    expect(remove.semanticComposition?.expectedWorkspaceFill).toEqual([
      { instanceId: "conversation-surface-main", region: "center", axis: "width", trackIndex: 0 },
    ]);
    const afterRemove = JSON.parse(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8")) as AppUIModel;
    expect(afterRemove).toEqual(model);
  });

  it("fails closed when a root anchor has no deterministic track size", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "conversation-surface-main",
          pluginId: "conversation-surface",
          enabled: true,
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
          },
        }],
        ["conversation-thread-list", {
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    })).rejects.toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("fails closed when a root Slot is shared by multiple Plugins", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          {
            id: "conversation-surface-main",
            pluginId: "conversation-surface",
            enabled: true,
          },
          { id: "secondary-main", pluginId: "sample", enabled: true },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["conversation-thread-list", {
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "conversation-thread-list-main",
          pluginId: "conversation-thread-list",
          enabled: true,
        },
      }],
    })).rejects.toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("fails closed when authoring-default placement is not available", async () => {
    const { projectRoot, source } = await createProject();
    await createPlugin(projectRoot, "unplaced", {
      authoring: {
        intents: ["unplaced capability"],
        recommendedSize: { width: "280px" },
      },
    });

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: { id: "unplaced-main", pluginId: "unplaced", enabled: true },
      }],
    })).rejects.toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
  });

  it("fails closed when the authoring-default anchor is ambiguous", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-surface-main-a",
                pluginId: "conversation-surface",
                enabled: true,
              }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "conversation-surface-main-b",
                pluginId: "conversation-surface",
                enabled: true,
              }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["history", {
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: { id: "history-main", pluginId: "history", enabled: true },
      }],
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      details: {
        anchorPluginId: "conversation-surface",
        matchingInstanceIds: [
          "conversation-surface-main-a",
          "conversation-surface-main-b",
        ],
      },
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("fails closed when an authoring-default Plugin has an unresolved required Service", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [{
          type: "panel",
          child: {
            type: "slot",
            plugins: [{
              id: "conversation-surface-main",
              pluginId: "conversation-surface",
              enabled: true,
            }],
          },
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["needs-service", {
          authoring: {
            intents: ["add a service-backed panel"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );
    await writeFile(
      path.join(projectRoot, "plugins", "needs-service", "definition.ts"),
      [
        "const definition = {",
        "  manifest: {},",
        '  inject: ["missing.service"],',
        "  Component: () => null,",
        "};",
        "export default definition;",
        "",
      ].join("\n"),
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registry = await generatePluginRegistry(projectRoot, model);
    await writeFile(registryPath, registry.capabilityCatalog.source);
    const registrySource = await readFile(registryPath, "utf8");

    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: {
          id: "needs-service-main",
          pluginId: "needs-service",
          enabled: true,
        },
      }],
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      details: {
        pluginId: "needs-service",
        missingRequiredServices: ["missing.service"],
      },
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("fails closed when the authoring-default anchor is inside an unsupported Layout", async () => {
    const model: AppUIModel = {
      root: {
        type: "stack",
        children: [{
          type: "slot",
          plugins: [{
            id: "conversation-surface-main",
            pluginId: "conversation-surface",
            enabled: true,
          }],
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation-surface", {
          authoring: {
            intents: ["show the primary conversation"],
            visualRole: "primary conversation surface",
            recommendedSize: { width: "minmax(0, 1fr)" },
          },
        }],
        ["history", {
          authoring: {
            intents: ["add conversation management"],
            typicalPlacement: {
              relation: "before",
              anchorPluginId: "conversation-surface",
            },
            recommendedSize: { width: "280px" },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: { id: "history-main", pluginId: "history", enabled: true },
      }],
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      details: {
        anchorInstanceId: "conversation-surface-main",
        expectedParentType: "row",
        actualParentType: "stack",
      },
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("rejects Host lowering details on the semantic operation boundary", async () => {
    const { projectRoot, source } = await createProject();

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin_default",
        plugin: { id: "sample-second", pluginId: "sample", enabled: true },
        anchorRef: "l0",
      }],
    })).rejects.toThrow();
  });

  it("strips transaction localRefs before writing AppUIModel", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [
        {
          type: "replace_layout_node",
          nodeRef: "l0",
          node: {
            type: "slot",
            localRef: "$replacement-slot",
            plugins: [{
              id: "sample-main",
              pluginId: "sample",
              enabled: true,
              props: { title: "Before" },
            }],
          },
        },
        {
          type: "insert_plugin",
          plugin: {
            id: "sample-second",
            pluginId: "sample",
            enabled: true,
          },
          target: { type: "layout_slot", slotRef: "$replacement-slot" },
        },
      ],
    });

    expect(result.changed).toBe(true);
    const written = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    expect(written).not.toContain("localRef");
    expect(JSON.parse(written)).toMatchObject({
      root: {
        type: "slot",
        plugins: [
          { id: "sample-main" },
          { id: "sample-second" },
        ],
      },
    });
  });

  it("does not write a draft that fails deterministic compilation", async () => {
    const { projectRoot, source } = await createProject();
    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin",
        plugin: { id: "missing-main", pluginId: "missing", enabled: true },
        target: { type: "layout_slot", slotRef: "l0" },
      }],
    })).rejects.toMatchObject({ code: "PLUGIN_REGISTRY_GENERATION_FAILED" });

    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
  });

  it("rejects a stale source hash before changing either transaction file", async () => {
    const { projectRoot, source } = await createProject();
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: "0".repeat(64),
      operations: [{
        type: "set_plugin_enabled",
        instanceId: "sample-main",
        enabled: false,
      }],
    })).rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });

    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("preserves source bytes for an already-satisfied semantic operation", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "set_plugin_enabled",
        instanceId: "sample-main",
        enabled: true,
      }],
    });

    expect(result.changed).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
  });

  it("reports a Layout Slot target for width incompatibility", async () => {
    const { projectRoot, source } = await createProject({
      layout: { width: "wide" },
    });
    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin",
        instanceId: "sample-main",
        target: { type: "layout_slot", slotRef: "l0" },
      }],
      runtimeSlotWidths: {
        [resolveRuntimeLayoutSlotId("root")]: "narrow",
      },
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "PLUGIN_WIDTH_INCOMPATIBLE",
      details: {
        pluginId: "sample",
        instanceId: "sample-main",
        target: { type: "layout_slot", slotRef: "l0" },
      },
    });
    expect((error as { details: Record<string, unknown> }).details).not.toHaveProperty("slotId");
    expect(String(error)).not.toContain(resolveRuntimeLayoutSlotId("root"));
  });

  it("reports a Plugin child Slot target for width incompatibility", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "owner-main",
          pluginId: "sample",
          enabled: true,
          slots: {
            content: [{ id: "child-main", pluginId: "sample", enabled: true }],
          },
        }],
      },
    };
    const { projectRoot, source } = await createProject(
      {
        layout: { width: "wide" },
        slots: {
          children: {
            content: {
              description: "Content.",
              cardinality: "many",
              optional: true,
            },
          },
        },
      },
      model,
    );
    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin",
        instanceId: "child-main",
        target: {
          type: "plugin_slot",
          parentInstanceId: "owner-main",
          slot: "content",
        },
      }],
      runtimeSlotWidths: {
        [resolveRuntimePluginSlotId("owner-main", "content")]: "narrow",
      },
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "PLUGIN_WIDTH_INCOMPATIBLE",
      details: {
        pluginId: "sample",
        instanceId: "child-main",
        target: {
          type: "plugin_slot",
          parentInstanceId: "owner-main",
          slot: "content",
        },
      },
    });
    expect((error as { details: Record<string, unknown> }).details).not.toHaveProperty("slotId");
    expect(String(error)).not.toContain(resolveRuntimePluginSlotId("owner-main", "content"));
  });

  it("does not let a semantic Plugin Slot move bypass width admission", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          { id: "child-main", pluginId: "sample", enabled: true },
          {
            id: "owner-main",
            pluginId: "owner",
            enabled: true,
            slots: { content: [] },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {
        capabilities: ["composer-action"],
        layout: { width: "wide" },
      },
      model,
      [
        ["owner", {
          slots: {
            children: {
              content: {
                description: "Content.",
                cardinality: "many",
                optional: true,
                accepts: { anyOfCapabilities: ["composer-action"] },
              },
            },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin_to",
        instanceId: "child-main",
        placement: {
          type: "plugin_slot",
          parentInstanceId: "owner-main",
          slot: "content",
        },
      }],
      runtimeSlotWidths: {
        [resolveRuntimePluginSlotId("owner-main", "content")]: "narrow",
      },
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "PLUGIN_WIDTH_INCOMPATIBLE",
      details: {
        pluginId: "sample",
        instanceId: "child-main",
        target: {
          type: "plugin_slot",
          parentInstanceId: "owner-main",
          slot: "content",
        },
      },
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("uses the starting snapshot target for replace width errors", async () => {
    const { projectRoot, source } = await createProject({
      layout: { width: "wide" },
    });
    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "replace_plugin",
        instanceId: "sample-main",
        replacement: {
          id: "replacement-main",
          pluginId: "sample",
          enabled: true,
        },
      }],
      runtimeSlotWidths: {
        [resolveRuntimeLayoutSlotId("root")]: "narrow",
      },
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "PLUGIN_WIDTH_INCOMPATIBLE",
      details: {
        pluginId: "sample",
        instanceId: "replacement-main",
        target: { type: "layout_slot", slotRef: "l0" },
      },
    });
    expect((error as { details: Record<string, unknown> }).details).not.toHaveProperty("slotId");
  });

  it("commits a deterministic relative Plugin move as one semantic transaction", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["200px", "280px", "minmax(0, 1fr)"],
        children: [
          {
            type: "slot",
            plugins: [{ id: "left-main", pluginId: "sample", enabled: true }],
          },
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{
                id: "history-main",
                pluginId: "sample",
                enabled: true,
                props: { preserved: true },
              }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{ id: "conversation-main", pluginId: "sample", enabled: true }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject({}, model);
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin_to",
        instanceId: "history-main",
        placement: {
          type: "relative",
          anchorInstanceId: "conversation-main",
          relation: "after",
        },
      }],
    });

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.diff.capabilityCatalog).toEqual({
      changed: false,
      addedPluginIds: [],
      removedPluginIds: [],
    });
    expect(result.semanticComposition).toMatchObject({
      operation: "move_plugin_to",
      semanticLoweringSucceeded: true,
      expectedRuntime: { presentInstanceIds: ["history-main"] },
      expectedPlacement: {
        type: "relative",
        instanceId: "history-main",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    });

    const written = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    if (written.root.type !== "row") throw new Error("fixture");
    expect(written.root.sizes).toEqual(["200px", "minmax(0, 1fr)", "280px"]);
    expect(written.root.children[2]).toMatchObject({
      type: "panel",
      width: "280px",
      child: {
        type: "slot",
        plugins: [{ id: "history-main", props: { preserved: true } }],
      },
    });
  });

  it("lowers a Workspace Region Action through the Host private binding", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["minmax(0, 1fr)", "280px"],
        children: [
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{ id: "conversation-main", pluginId: "conversation", enabled: true }],
            },
          },
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{ id: "history-main", pluginId: "history", enabled: true }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["conversation", { capabilities: ["visual"] }],
        ["history", { capabilities: ["visual"] }],
      ],
    );
    const actionId = actionIdFor({
      kind: "move_plugin",
      subject: { pluginId: "history", instanceId: "history-main" },
      effect: { type: "workspace_region", region: "left" },
    });

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{ type: "execute_creator_action", actionId }],
    });

    expect(result.creatorAction).toMatchObject({
      actionId,
      actionKind: "move_plugin",
      status: "ready",
    });
    expect(result.semanticComposition).toMatchObject({
      operation: "move_plugin_to",
      expectedRuntime: { presentInstanceIds: ["history-main"] },
      expectedWorkspaceFill: [
        { instanceId: "history-main", region: "left", axis: "width", trackIndex: 0 },
        { instanceId: "conversation-main", region: "center", axis: "width", trackIndex: 1 },
      ],
      expectedPlacement: {
        type: "relative",
        instanceId: "history-main",
        anchorInstanceId: "conversation-main",
        relation: "before",
      },
    });

    const written = JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    )) as AppUIModel;
    if (written.root.type !== "row") throw new Error("Expected Workspace Row root.");
    expect(written.root.sizes).toEqual(["280px", "minmax(0, 1fr)"]);
    expect(written.root.children.every((child) => child.type === "panel" && child.width === undefined)).toBe(true);
    expect(written.root.children.map((child) =>
      child.type === "panel" && child.child.type === "slot"
        ? child.child.plugins[0]?.id
        : undefined,
    )).toEqual(["history-main", "conversation-main"]);
  });

  it("commits a Plugin Slot move with manifest compatibility and dedicated cleanup", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "minmax(0, 1fr)"],
        children: [
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{ id: "button-main", pluginId: "button", enabled: true }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "composer-main",
                pluginId: "composer",
                enabled: true,
                slots: { actions: [] },
              }],
            },
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["button", { capabilities: ["button", "composer-action"] }],
        ["composer", {
          slots: {
            children: {
              actions: {
                description: "Actions beside the composer input.",
                cardinality: "many",
                optional: true,
                accepts: { anyOfCapabilities: ["composer-action"] },
              },
            },
          },
        }],
      ],
    );

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin_to",
        instanceId: "button-main",
        placement: {
          type: "plugin_slot",
          parentInstanceId: "composer-main",
          slot: "actions",
        },
      }],
    });

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.semanticComposition).toMatchObject({
      operation: "move_plugin_to",
      expectedPlacement: {
        type: "plugin_slot",
        instanceId: "button-main",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    });
    expect(result.diff.capabilityCatalog.changed).toBe(false);
    expect(JSON.parse(await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    ))).toEqual({
      root: {
        type: "panel",
        child: {
          type: "slot",
          plugins: [{
            id: "composer-main",
            pluginId: "composer",
            enabled: true,
            slots: {
              actions: [{ id: "button-main", pluginId: "button", enabled: true }],
            },
          }],
        },
      },
    });
  });

  it("rejects an incompatible Plugin Slot move before changing either artifact", async () => {
    const model: AppUIModel = {
      root: {
        type: "row",
        children: [
          { type: "slot", plugins: [{ id: "button-main", pluginId: "button", enabled: true }] },
          {
            type: "slot",
            plugins: [{
              id: "composer-main",
              pluginId: "composer",
              enabled: true,
              slots: { actions: [] },
            }],
          },
        ],
      },
    };
    const { projectRoot, source } = await createProject(
      {},
      model,
      [
        ["button", { capabilities: ["button"] }],
        ["composer", {
          slots: {
            children: {
              actions: {
                description: "Actions beside the composer input.",
                cardinality: "many",
                optional: true,
                accepts: { anyOfCapabilities: ["other"] },
              },
            },
          },
        }],
      ],
    );
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    const error = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "move_plugin_to",
        instanceId: "button-main",
        placement: {
          type: "plugin_slot",
          parentInstanceId: "composer-main",
          slot: "actions",
        },
      }],
    }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "AUTHORING_MOVE_INCOMPATIBLE",
      details: { reason: "slot-capability-mismatch" },
    });
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });
});
