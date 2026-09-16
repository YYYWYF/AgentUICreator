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
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "app-ui-transaction-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await createPlugin(projectRoot, "sample", manifestOverrides);
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
  await writeFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), registry.source);
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
    expect(result.diff.registry.changed).toBe(false);
    expect(result.registry.registeredPluginIds).toEqual([]);
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
    expect(result.diff.registry).toMatchObject({
      changed: false,
      addedPluginIds: [],
      removedPluginIds: [],
    });
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
    expect(JSON.parse(await readFile(
      path.join(projectRoot, COMPOSITION_REVISION_PATH),
      "utf8",
    ))).toEqual(result.compositionRevision);
    expect(result.snapshotToken.capabilityCatalogRevision).toBe(
      result.compositionRevision!.capabilityCatalogRevision,
    );
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
});
