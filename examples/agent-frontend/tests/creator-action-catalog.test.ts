import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  applyAppUIOperations as applyAuthoringOperations,
} from "../scripts/ui-project/app-ui-operations";
import {
  actionIdFor,
  buildCreatorActionCatalog,
  isExpectedCreatorActionRejection,
  semanticActionIdentity,
} from "../scripts/ui-project/creator-action-catalog";
import {
  planDefaultPluginInsertion,
  pluginMoveContractsForGeneration,
} from "../scripts/ui-project/creator-action-planners";
import {
  collectPluginProjectFacts,
  generatePluginRegistryFromFacts,
} from "../scripts/ui-project/registry-generator";
import * as registryGenerator from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

const hash = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

async function createFixtureProject(
  model: AppUIModel,
  plugins: readonly (readonly [string, Record<string, unknown>])[],
): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-action-catalog-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext" },
      include: ["plugins/**/*.ts"],
    }),
  );
  for (const [pluginId, overrides] of plugins) {
    const pluginRoot = path.join(projectRoot, "plugins", pluginId);
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(
      path.join(pluginRoot, "manifest.json"),
      JSON.stringify({
        id: pluginId,
        name: pluginId,
        description: "Fixture Plugin.",
        version: "1.0.0",
        capabilities: ["visual"],
        ...overrides,
      }),
    );
    await writeFile(
      path.join(pluginRoot, "definition.ts"),
      "const definition = { manifest: {}, Component: () => null };\nexport default definition;\n",
    );
  }
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    `${JSON.stringify(model, null, 2)}\n`,
  );
  return projectRoot;
}

async function buildCatalog(
  projectRoot: string,
  model: AppUIModel,
  appUIModelSource = JSON.stringify(model),
) {
  const projectFacts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
  const generation = generatePluginRegistryFromFacts(model, projectFacts);
  const catalog = await buildCreatorActionCatalog({
    model,
    generation,
    projectFacts,
    appUIModelHash: hash(appUIModelSource),
  });
  return { projectFacts, generation, catalog };
}

function rowModel(instanceIds: readonly string[]): AppUIModel {
  return {
    root: {
      type: "row",
      sizes: instanceIds.map((_, index) => index === 0 ? "280px" : "minmax(0, 1fr)"),
      children: instanceIds.map((instanceId) => ({
        type: "panel" as const,
        child: {
          type: "slot" as const,
          plugins: [{
            id: `${instanceId}-main`,
            pluginId: instanceId,
            enabled: true,
          }],
        },
      })),
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("Creator Action semantic identity", () => {
  it("keeps Add identity independent from the current instance binding", () => {
    const before = semanticActionIdentity(
      "add_existing_plugin",
      { pluginId: "conversation-thread-list", pluginName: "Thread List" },
      { type: "add_default" },
    );
    const after = semanticActionIdentity(
      "add_existing_plugin",
      {
        pluginId: "conversation-thread-list",
        pluginName: "Thread List (renamed)",
        instanceId: "conversation-thread-list-main",
      },
      { type: "add_default" },
    );

    expect(before).toEqual({
      kind: "add_existing_plugin",
      subject: { pluginId: "conversation-thread-list" },
      effect: { type: "add_default" },
    });
    expect(actionIdFor(before)).toBe(actionIdFor(after));
  });

  it("keeps Remove instance safety and exact Move anchors in the identity", () => {
    const removeMounted = actionIdFor(semanticActionIdentity(
      "remove_plugin",
      { pluginId: "history", pluginName: "History", instanceId: "history-main" },
      { type: "remove" },
    ));
    const removeAbsent = actionIdFor(semanticActionIdentity(
      "remove_plugin",
      { pluginId: "history", pluginName: "History" },
      { type: "remove" },
    ));
    const moveToOldAnchor = actionIdFor(semanticActionIdentity(
      "move_plugin",
      { pluginId: "history", pluginName: "History", instanceId: "history-main" },
      {
        type: "relative",
        anchorPluginId: "conversation",
        anchorPluginName: "Conversation",
        anchorInstanceId: "conversation-old",
        relation: "after",
      },
    ));
    const moveToReplacementAnchor = actionIdFor(semanticActionIdentity(
      "move_plugin",
      { pluginId: "history", pluginName: "History", instanceId: "history-main" },
      {
        type: "relative",
        anchorPluginId: "conversation",
        anchorPluginName: "Conversation",
        anchorInstanceId: "conversation-replacement",
        relation: "after",
      },
    ));
    const moveToOldParentSlot = actionIdFor(semanticActionIdentity(
      "move_plugin",
      { pluginId: "button", pluginName: "Button", instanceId: "button-main" },
      {
        type: "plugin_slot",
        parentPluginId: "composer",
        parentPluginName: "Composer",
        parentInstanceId: "composer-old",
        slot: "actions",
      },
    ));
    const moveToReplacementParentSlot = actionIdFor(semanticActionIdentity(
      "move_plugin",
      { pluginId: "button", pluginName: "Button", instanceId: "button-main" },
      {
        type: "plugin_slot",
        parentPluginId: "composer",
        parentPluginName: "Composer",
        parentInstanceId: "composer-replacement",
        slot: "actions",
      },
    ));

    expect(removeMounted).not.toBe(removeAbsent);
    expect(moveToOldAnchor).not.toBe(moveToReplacementAnchor);
    expect(moveToOldParentSlot).not.toBe(moveToReplacementParentSlot);
  });

  it("distinguishes expected semantic rejection from infrastructure failure", () => {
    const expected = Object.assign(new Error("incompatible"), {
      code: "AUTHORING_MOVE_INCOMPATIBLE",
    });
    expect(isExpectedCreatorActionRejection(expected)).toBe(true);
    expect(isExpectedCreatorActionRejection(new Error("synthetic infrastructure failure"))).toBe(false);
  });
});

describe("Creator Action Catalog", () => {
  it("keeps Add ready to already-satisfied actionId stable", async () => {
    const initialModel: AppUIModel = {
      root: {
        type: "row",
        children: [{
          type: "panel",
          child: {
            type: "slot",
            plugins: [{ id: "conversation-main", pluginId: "conversation", enabled: true }],
          },
        }],
      },
    };
    const projectRoot = await createFixtureProject(initialModel, [
      ["conversation", {}],
      ["history", {
        authoring: {
          intents: ["add history"],
          typicalPlacement: { relation: "before", anchorPluginId: "conversation" },
          recommendedSize: { width: "280px" },
        },
      }],
    ]);
    const initial = await buildCatalog(projectRoot, initialModel);
    const ready = initial.catalog.candidates.find(
      (candidate) => candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "history",
    );
    expect(ready).toMatchObject({ status: "ready", target: { pluginId: "history" } });

    const binding = initial.catalog.bindings.get(ready!.actionId);
    if (binding?.status !== "ready" || binding.operation.type !== "insert_plugin_default") {
      throw new Error("fixture did not produce an Add binding");
    }
    const plan = planDefaultPluginInsertion(
      initialModel,
      binding.operation,
      initial.generation,
    );
    const mountedModel = applyAuthoringOperations(initialModel, plan.operations);
    const mounted = await buildCatalog(projectRoot, mountedModel);
    const alreadySatisfied = mounted.catalog.candidates.find(
      (candidate) => candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "history",
    );

    expect(alreadySatisfied).toMatchObject({
      actionId: ready!.actionId,
      status: "already_satisfied",
      target: { pluginId: "history", instanceId: "history-main" },
    });
  });

  it("emits absent Remove no-ops but not for disabled mounted instances", async () => {
    const absentModel: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{ id: "conversation-main", pluginId: "conversation", enabled: true }],
      },
    };
    const projectRoot = await createFixtureProject(absentModel, [
      ["conversation", {}],
      ["history", {}],
    ]);
    const absent = await buildCatalog(projectRoot, absentModel);
    expect(absent.catalog.candidates).toContainEqual(expect.objectContaining({
      kind: "remove_plugin",
      status: "already_satisfied",
      target: expect.objectContaining({ pluginId: "history", pluginName: "history" }),
      effect: { type: "remove" },
    }));

    const disabledModel: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          { id: "conversation-main", pluginId: "conversation", enabled: true },
          { id: "history-main", pluginId: "history", enabled: false },
        ],
      },
    };
    const disabled = await buildCatalog(projectRoot, disabledModel);
    expect(disabled.catalog.candidates).toContainEqual(expect.objectContaining({
      kind: "remove_plugin",
      status: "ready",
      target: expect.objectContaining({ pluginId: "history", instanceId: "history-main" }),
    }));
    expect(disabled.catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "remove_plugin",
      status: "already_satisfied",
      target: expect.objectContaining({ pluginId: "history", instanceId: undefined }),
    }));
  });

  it("filters a candidate-specific definition issue without dropping healthy actions", async () => {
    const model = rowModel(["conversation"]);
    const projectRoot = await createFixtureProject(model, [
      ["conversation", {}],
      ["broken", {
        authoring: {
          typicalPlacement: {
            relation: "after",
            anchorPluginId: "conversation",
          },
          recommendedSize: { width: "280px" },
        },
      }],
    ]);
    const collectedFacts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
    const brokenAsset = collectedFacts.assets.find((asset) => asset.pluginId === "broken");
    if (brokenAsset === undefined) throw new Error("fixture did not produce broken asset");
    const definitionIssuesByPath = new Map(collectedFacts.definitionIssuesByPath);
    definitionIssuesByPath.set(brokenAsset.definitionPath, [{
      code: "selected-plugin-definition-missing",
      message: `${brokenAsset.definitionPath}: synthetic missing definition`,
      pluginId: "broken",
    }]);
    const projectFacts = {
      ...collectedFacts,
      definitionIssuesByPath,
    };
    const generation = generatePluginRegistryFromFacts(model, projectFacts);
    const catalog = await buildCreatorActionCatalog({
      model,
      generation,
      projectFacts,
      appUIModelHash: hash(JSON.stringify(model)),
    });

    expect(catalog.candidates).toContainEqual(expect.objectContaining({
      kind: "remove_plugin",
      status: "ready",
      target: expect.objectContaining({
        pluginId: "conversation",
        instanceId: "conversation-main",
      }),
    }));
    expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "add_existing_plugin",
      target: expect.objectContaining({ pluginId: "broken" }),
    }));
  });

  it("emits compatible Plugin Slot actions and filters incompatible candidates", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          { id: "parent-main", pluginId: "parent", enabled: true },
          { id: "compatible-main", pluginId: "compatible", enabled: true },
          { id: "incompatible-main", pluginId: "incompatible", enabled: true },
        ],
      },
    };
    const projectRoot = await createFixtureProject(model, [
      ["parent", {
        slots: {
          children: {
            content: {
              description: "Content fixture Slot.",
              cardinality: "many",
              optional: true,
              accepts: { anyOfCapabilities: ["accepted"] },
            },
          },
        },
      }],
      ["compatible", { capabilities: ["accepted"] }],
      ["incompatible", { capabilities: ["rejected"] }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);
    const compatible = catalog.candidates.find(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.target.instanceId === "compatible-main" &&
        candidate.effect.type === "plugin_slot" &&
        candidate.effect.parentInstanceId === "parent-main" &&
        candidate.effect.slot === "content",
    );

    expect(compatible).toMatchObject({ status: "ready" });
    expect(catalog.bindings.get(compatible!.actionId)).toMatchObject({
      status: "ready",
      operation: {
        type: "move_plugin_to",
        instanceId: "compatible-main",
        placement: {
          type: "plugin_slot",
          parentInstanceId: "parent-main",
          slot: "content",
        },
      },
    });
    expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "move_plugin",
      target: expect.objectContaining({ instanceId: "incompatible-main" }),
      effect: expect.objectContaining({
        type: "plugin_slot",
        parentInstanceId: "parent-main",
        slot: "content",
      }),
    }));
  });

  it("uses one request-scoped facts collection for a Catalog build", async () => {
    const model = rowModel(["history", "conversation"]);
    const projectRoot = await createFixtureProject(model, [
      ["history", {}],
      ["conversation", {}],
    ]);
    const collectFacts = vi.spyOn(registryGenerator, "collectPluginProjectFacts");
    const projectFacts = await registryGenerator.collectPluginProjectFacts(
      projectRoot,
      fixtureConfig,
    );
    const generation = registryGenerator.generatePluginRegistryFromFacts(
      model,
      projectFacts,
    );
    await buildCreatorActionCatalog({
      model,
      generation,
      projectFacts,
      appUIModelHash: hash(JSON.stringify(model)),
    });

    expect(collectFacts).toHaveBeenCalledTimes(1);
  });

  it("surfaces unexpected simulation failures as Catalog build errors", async () => {
    const model = rowModel(["conversation"]);
    const projectRoot = await createFixtureProject(model, [["conversation", {}]]);
    const projectFacts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
    const generation = generatePluginRegistryFromFacts(model, projectFacts);
    vi.spyOn(registryGenerator, "generatePluginRegistryFromFacts").mockImplementation(() => {
      throw new TypeError("synthetic AST analyzer crash");
    });

    await expect(buildCreatorActionCatalog({
      model,
      generation,
      projectFacts,
      appUIModelHash: hash(JSON.stringify(model)),
    })).rejects.toMatchObject({
      name: "CreatorActionCatalogError",
      code: "CREATOR_ACTION_CATALOG_BUILD_FAILED",
      details: { cause: "synthetic AST analyzer crash" },
    });
  });

  it("uses a relative binding for row-edge actions and keeps its identity across anchor changes", async () => {
    const initialModel = rowModel(["history", "conversation"]);
    const projectRoot = await createFixtureProject(initialModel, [
      ["history", {}],
      ["conversation", {}],
      ["inspector", {}],
    ]);
    const initial = await buildCatalog(projectRoot, initialModel);
    const initialRight = initial.catalog.candidates.find(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.target.instanceId === "history-main" &&
        candidate.effect.type === "row_edge" && candidate.effect.edge === "right",
    );
    expect(initialRight).toMatchObject({ status: "ready" });
    const initialBinding = initial.catalog.bindings.get(initialRight!.actionId);
    expect(initialBinding).toMatchObject({
      status: "ready",
      operation: {
        type: "move_plugin_to",
        instanceId: "history-main",
        placement: {
          type: "relative",
          anchorInstanceId: "conversation-main",
          relation: "after",
        },
      },
    });

    if (initialBinding?.status !== "ready") throw new Error("fixture did not produce a row binding");
    const moved = applyAuthoringOperations(
      initialModel,
      [initialBinding.operation],
      { pluginMoveContracts: pluginMoveContractsForGeneration(initial.generation) },
    );
    if (moved.root.type !== "row") throw new Error("fixture root");
    expect(moved.root.children.map((child) =>
      child.type === "panel" && child.child.type === "slot"
        ? child.child.plugins[0]?.id
        : undefined,
    )).toEqual(["conversation-main", "history-main"]);

    const changedModel = rowModel(["history", "conversation", "inspector"]);
    const changed = await buildCatalog(projectRoot, changedModel);
    const changedRight = changed.catalog.candidates.find(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.target.instanceId === "history-main" &&
        candidate.effect.type === "row_edge" && candidate.effect.edge === "right",
    );
    expect(changedRight?.actionId).toBe(initialRight!.actionId);
    expect(changed.catalog.bindings.get(changedRight!.actionId)).toMatchObject({
      operation: {
        placement: {
          type: "relative",
          anchorInstanceId: "inspector-main",
          relation: "after",
        },
      },
    });
  });
});
