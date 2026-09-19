import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AppUIModel,
  type AppUIPluginNode,
} from "../framework/contracts/app-ui-model";
import type { AgentUIWorkspacePolicy } from "../framework/contracts/agent-ui-workspace";
import {
  applyAppUIOperations as applyAuthoringOperations,
  lowerWorkspaceRegionMovePlan,
  planWorkspaceRegionMove,
} from "../scripts/ui-project/app-ui-operations";
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
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
import { platformMode } from "../framework/modes/platform";
import { projectWorkspaceTopology } from "../scripts/ui-project/workspace-topology";
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
  workspacePolicy: AgentUIWorkspacePolicy = platformMode.workspace,
) {
  const projectFacts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
  const generation = generatePluginRegistryFromFacts(model, projectFacts);
  const catalog = await buildCreatorActionCatalog({
    model,
    generation,
    projectFacts,
    appUIModelHash: hash(appUIModelSource),
    workspacePolicy,
  });
  return { projectFacts, generation, catalog };
}

function rowModel(instanceIds: readonly string[]): AppUIModel {
  return {
    root: {
      type: "row",
      sizes: instanceIds.map((_, index) =>
        instanceIds.length === 1
          ? "minmax(0, 1fr)"
          : index === 0
          ? "280px"
          : index === instanceIds.length - 1 && instanceIds.length > 2
            ? "280px"
            : "minmax(0, 1fr)"
      ),
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
  const childPlacement = {
    intents: ["show useful example actions"],
    visualRole: "example actions",
    defaultPlacement: { type: "plugin_slot", parentPluginId: "parent", slot: "slotX" },
  };
  const parentSlots = {
    children: {
      slotX: {
        description: "Example actions",
        cardinality: "one",
        optional: true,
        accepts: { anyOfCapabilities: ["capability-A"] },
      },
    },
  };
  const parentNode = (id: string): AppUIPluginNode => ({ id, pluginId: "parent", enabled: true });
  const childSlotModel = (parents: AppUIPluginNode[] = [parentNode("parent-main")]): AppUIModel => ({
    root: { type: "slot", plugins: parents },
  });

  it("does not publish default Add for a visual asset without default placement", async () => {
    const model = childSlotModel();
    const projectRoot = await createFixtureProject(model, [
      ["parent", {}],
      ["unplaced", { authoring: { intents: ["show unplaced content"], visualRole: "content" } }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);
    expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "add_existing_plugin", target: expect.objectContaining({ pluginId: "unplaced" }),
    }));
  });

  it("adds any compatible absent Plugin to its declared child Slot and preserves Add identity", async () => {
    const model = childSlotModel();
    const projectRoot = await createFixtureProject(model, [
      ["parent", { slots: parentSlots }],
      ["child", { capabilities: ["capability-A"], authoring: childPlacement }],
    ]);
    const before = await buildCatalog(projectRoot, model);
    const add = before.catalog.candidates.find((candidate) =>
      candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "child");
    expect(add).toMatchObject({ status: "ready", effect: { type: "add_default" } });
    if (add === undefined) throw new Error("Expected child Add Action");
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(`${JSON.stringify(model, null, 2)}\n`),
      operations: [{ type: "execute_creator_action", actionId: add.actionId }],
    });
    expect(result.semanticComposition?.expectedPlacement).toEqual({
      type: "plugin_slot", instanceId: "child-main", parentInstanceId: "parent-main", slot: "slotX",
    });
    const after = JSON.parse(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8")) as AppUIModel;
    expect(after.root.type === "slot" && after.root.plugins[0]?.slots?.slotX?.[0]).toMatchObject({
      id: "child-main", pluginId: "child", enabled: true,
    });
    const mounted = await buildCatalog(projectRoot, after);
    expect(mounted.catalog.candidates).toContainEqual(expect.objectContaining({
      actionId: add.actionId, kind: "add_existing_plugin", status: "already_satisfied",
    }));
  });

  it.each(["parent missing", "parent ambiguous", "slot missing", "capability mismatch", "cardinality full", "required services unresolved", "hypothetical compile failure"])(
    "does not expose a ready child Slot Add when %s",
    async (scenario) => {
      const parents: AppUIPluginNode[] = scenario === "parent missing"
        ? [{ id: "occupant-main", pluginId: "occupant", enabled: true }]
        : scenario === "parent ambiguous"
        ? [parentNode("parent-one"), parentNode("parent-two")] : [parentNode("parent-main")];
      if (scenario === "cardinality full") {
        parents[0] = { ...parents[0]!, slots: { slotX: [{ id: "occupant-main", pluginId: "occupant", enabled: true }] } };
      }
      const model = childSlotModel(parents);
      const slots = scenario === "slot missing" ? {} : scenario === "capability mismatch"
        ? { children: { slotX: { ...parentSlots.children.slotX, accepts: { anyOfCapabilities: ["other"] } } } }
        : parentSlots;
      const projectRoot = await createFixtureProject(model, [
        ["parent", { slots }],
        ["child", { capabilities: ["capability-A"], authoring: childPlacement }],
        ["occupant", { capabilities: ["capability-A"] }],
      ]);
      const facts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
      if (scenario === "required services unresolved") {
        const declaration = facts.declarations.plugins.find((plugin) => plugin.pluginId === "child");
        if (declaration === undefined) throw new Error("Missing child declaration");
        declaration.inject.push("missing.service");
      }
      if (scenario === "hypothetical compile failure") {
        const child = facts.assets.find((asset) => asset.pluginId === "child");
        if (child === undefined) throw new Error("Missing child asset");
        facts.definitionIssuesByPath = new Map(facts.definitionIssuesByPath).set(child.definitionPath, [{
          code: "selected-plugin-definition-missing", message: "Synthetic definition issue", pluginId: "child",
        }]);
      }
      const generation = generatePluginRegistryFromFacts(model, facts);
      const catalog = await buildCreatorActionCatalog({
        model, generation, projectFacts: facts, appUIModelHash: hash(JSON.stringify(model)),
        workspacePolicy: platformMode.workspace,
      });
      expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
        kind: "add_existing_plugin", status: "ready", target: expect.objectContaining({ pluginId: "child" }),
      }));
    },
  );

  it("rebuilds a Suggestions Add Action after Remove and restores the child Slot", async () => {
    const parent: AppUIPluginNode = {
      id: "agent-conversation-surface-main", pluginId: "conversation-surface", enabled: true,
      slots: { emptySuggestions: [{ id: "conversation-suggestions-main", pluginId: "conversation-suggestions", enabled: true }] },
    };
    const model = childSlotModel([parent]);
    const projectRoot = await createFixtureProject(model, [
      ["conversation-surface", { slots: { children: { emptySuggestions: {
        ...parentSlots.children.slotX, cardinality: "many",
        accepts: { anyOfCapabilities: ["conversation-suggestions"] },
      } } } }],
      ["conversation-suggestions", {
        capabilities: ["conversation-suggestions"],
        authoring: {
          intents: ["show starter prompts and suggested conversation actions"],
          visualRole: "conversation empty-state suggestions",
          defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot: "emptySuggestions" },
        },
      }],
    ]);
    const before = await buildCatalog(projectRoot, model);
    const remove = before.catalog.candidates.find((candidate) =>
      candidate.kind === "remove_plugin" && candidate.target.pluginId === "conversation-suggestions" && candidate.status === "ready");
    if (remove === undefined) throw new Error("Expected Suggestions Remove Action");
    const removed = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(`${JSON.stringify(model, null, 2)}\n`),
      operations: [{ type: "execute_creator_action", actionId: remove.actionId }],
    });
    const absentModel = JSON.parse(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8")) as AppUIModel;
    const afterRemove = await buildCatalog(projectRoot, absentModel);
    const add = afterRemove.catalog.candidates.find((candidate) =>
      candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "conversation-suggestions" && candidate.status === "ready");
    expect(add?.effect).toEqual({ type: "add_default" });
    expect(afterRemove.catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "add_existing_plugin",
      target: expect.objectContaining({ pluginId: "conversation-suggestions" }),
      effect: expect.objectContaining({ type: "workspace_region" }),
    }));
    if (add === undefined) throw new Error("Expected Suggestions Add Action");
    const restored = await mutateAppUIModel(projectRoot, {
      appUIModelHash: removed.appUIModel.afterHash,
      operations: [{ type: "execute_creator_action", actionId: add.actionId }],
    });
    expect(restored.semanticComposition?.expectedPlacement).toEqual({
      type: "plugin_slot", instanceId: "conversation-suggestions-main",
      parentInstanceId: "agent-conversation-surface-main", slot: "emptySuggestions",
    });
  });

  it("emits and executes the Conversation Thread List Add Action when absent", async () => {
    const absentModel = rowModel(["conversation-surface"]);
    const projectRoot = await createFixtureProject(absentModel, [
      ["conversation-surface", {
        name: "Conversation Surface",
        capabilities: ["conversation-surface"],
      }],
      ["conversation-thread-list", {
        name: "Conversation Thread List",
        description: "Uses the public Conversation thread list with AgentUICreator policy and data binding.",
        capabilities: [
          "conversation-create",
          "conversation-history",
          "conversation-selection",
          "plugin-service-consumer",
        ],
        authoring: {
          intents: [
            "add conversation management",
            "browse conversation history",
            "select an existing conversation",
            "start a new conversation",
          ],
          visualRole: "conversation navigation",
          defaultPlacement: { type: "relative",
            relation: "before",
            anchorPluginId: "conversation-surface",
          },
          recommendedSize: { width: "280px" },
        },
      }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, absentModel);
    const add = catalog.candidates.find(
      (candidate) => candidate.kind === "add_existing_plugin" &&
        candidate.target.pluginId === "conversation-thread-list",
    );

    expect(add).toMatchObject({
      kind: "add_existing_plugin",
      status: "ready",
      target: {
        pluginId: "conversation-thread-list",
        pluginName: "Conversation Thread List",
      },
      effect: { type: "add_default" },
    });
    if (add === undefined) throw new Error("fixture did not produce Thread List Add Action");

    const source = `${JSON.stringify(absentModel, null, 2)}\n`;
    const executed = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "execute_creator_action",
        actionId: add.actionId,
      }],
    });

    expect(executed).toMatchObject({
      changed: true,
      creatorAction: {
        actionId: add.actionId,
        actionKind: "add_existing_plugin",
        status: "ready",
      },
      semanticComposition: {
        actionId: add.actionId,
        actionKind: "add_existing_plugin",
        actionStatus: "ready",
        operation: "insert_plugin_default",
        semanticLoweringSucceeded: true,
      },
    });
  });

  it.each(["left", "right"] as const)("adds an absent Workspace Plugin explicitly to %s", async (region) => {
    const model = rowModel(["conversation-surface"]);
    const projectRoot = await createFixtureProject(model, [
      ["conversation-surface", { capabilities: ["conversation-surface"] }],
      ["conversation-thread-list", {
        capabilities: ["conversation-history"],
        authoring: {
          defaultPlacement: { type: "relative", relation: "before", anchorPluginId: "conversation-surface" },
          recommendedSize: { width: "280px" },
        },
      }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);
    const adds = catalog.candidates.filter((candidate) =>
      candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "conversation-thread-list");
    expect(adds.map((candidate) => candidate.effect)).toContainEqual({ type: "add_default" });
    expect(adds.map((candidate) => candidate.effect)).toContainEqual({ type: "workspace_region", region });
    const explicit = adds.find((candidate) =>
      candidate.effect.type === "workspace_region" && candidate.effect.region === region);
    const fallback = adds.find((candidate) => candidate.effect.type === "add_default");
    expect(explicit?.actionId).not.toBe(fallback?.actionId);
    if (explicit === undefined) throw new Error("Missing explicit Workspace Add");
    const source = `${JSON.stringify(model, null, 2)}\n`;
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{ type: "execute_creator_action", actionId: explicit.actionId }],
    });
    expect(result.semanticComposition).toMatchObject({
      operation: "insert_plugin_to",
      expectedWorkspaceFill: [{
        instanceId: "conversation-thread-list-main", region, axis: "width",
        trackIndex: region === "left" ? 0 : 1,
      }],
    });
    const after = JSON.parse(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8")) as AppUIModel;
    const topology = projectWorkspaceTopology(after, platformMode.workspace);
    expect(topology.regions[region]?.index).toBe(region === "left" ? 0 : 1);
    expect(topology.regions[region]?.branch).toMatchObject({
      type: "panel", child: { type: "slot", plugins: [{ pluginId: "conversation-thread-list" }] },
    });
  });

  it("omits occupied explicit destinations while retaining the default Add", async () => {
    const model: AppUIModel = {
      root: { type: "row", sizes: ["minmax(0, 1fr)", "280px"], children: [
        { type: "panel", child: { type: "slot", plugins: [{ id: "conversation-main", pluginId: "conversation-surface", enabled: true }] } },
        { type: "panel", child: { type: "slot", plugins: [{ id: "other-main", pluginId: "other", enabled: true }] } },
      ] },
    };
    const projectRoot = await createFixtureProject(model, [
      ["conversation-surface", { capabilities: ["conversation-surface"] }],
      ["other", { capabilities: ["visual"] }],
      ["conversation-thread-list", { capabilities: ["conversation-history"], authoring: {
        defaultPlacement: { type: "relative", relation: "before", anchorPluginId: "conversation-surface" },
        recommendedSize: { width: "280px" },
      } }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);
    const adds = catalog.candidates.filter((candidate) =>
      candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "conversation-thread-list");
    expect(adds.map((candidate) => candidate.effect)).toContainEqual({ type: "add_default" });
    expect(adds.map((candidate) => candidate.effect)).not.toContainEqual({ type: "workspace_region", region: "right" });
  });

  it("keeps headless assets outside all visual Product Actions", async () => {
    const model: AppUIModel = {
      ...rowModel(["conversation-surface"]),
      applicationPlugins: [{ id: "conversation-service-main", pluginId: "conversation-service", enabled: true }],
    };
    const projectRoot = await createFixtureProject(model, [
      ["conversation-surface", { capabilities: ["conversation-surface"] }],
      ["conversation-service", { capabilities: ["headless", "conversation-history"] }],
      ["conversation-data-source", { capabilities: ["headless", "conversation-history"] }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);
    expect(catalog.candidates.filter((candidate) =>
      ["conversation-service", "conversation-data-source"].includes(candidate.target.pluginId) &&
      ["add_existing_plugin", "remove_plugin", "move_plugin"].includes(candidate.kind))).toEqual([]);
  });

  it("emits the mounted Thread List Remove Action and an Add no-op", async () => {
    const mountedModel = rowModel([
      "conversation-thread-list",
      "conversation-surface",
    ]);
    const projectRoot = await createFixtureProject(mountedModel, [
      ["conversation-surface", {
        name: "Conversation Surface",
        capabilities: ["conversation-surface"],
      }],
      ["conversation-thread-list", {
        name: "Conversation Thread List",
        capabilities: [
          "conversation-create",
          "conversation-history",
          "conversation-selection",
          "plugin-service-consumer",
        ],
        authoring: {
          intents: [
            "add conversation management",
            "browse conversation history",
            "select an existing conversation",
            "start a new conversation",
          ],
          visualRole: "conversation navigation",
          defaultPlacement: { type: "relative",
            relation: "before",
            anchorPluginId: "conversation-surface",
          },
          recommendedSize: { width: "280px" },
        },
      }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, mountedModel);
    const remove = catalog.candidates.find(
      (candidate) => candidate.kind === "remove_plugin" &&
        candidate.target.pluginId === "conversation-thread-list" &&
        candidate.target.instanceId === "conversation-thread-list-main",
    );
    const add = catalog.candidates.find(
      (candidate) => candidate.kind === "add_existing_plugin" &&
        candidate.target.pluginId === "conversation-thread-list",
    );

    expect(remove).toMatchObject({
      kind: "remove_plugin",
      status: "ready",
      effect: { type: "remove" },
      target: {
        pluginId: "conversation-thread-list",
        pluginName: "Conversation Thread List",
        instanceId: "conversation-thread-list-main",
      },
    });
    expect(add).toMatchObject({
      kind: "add_existing_plugin",
      status: "already_satisfied",
      effect: { type: "add_default" },
      target: {
        pluginId: "conversation-thread-list",
        instanceId: "conversation-thread-list-main",
      },
    });
    expect(add?.actionId).toBe(
      actionIdFor(semanticActionIdentity(
        "add_existing_plugin",
        { pluginId: "conversation-thread-list", pluginName: "Conversation Thread List" },
        { type: "add_default" },
      )),
    );
  });

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
          defaultPlacement: { type: "relative", relation: "before", anchorPluginId: "conversation" },
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
          defaultPlacement: { type: "relative",
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
      workspacePolicy: platformMode.workspace,
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

  it("does not expose actions that would empty the required Center Region", async () => {
    const base = rowModel(["history", "conversation"]);
    const model: AppUIModel = {
      ...base,
      applicationPlugins: [{
        id: "parent-main",
        pluginId: "parent",
        enabled: true,
      }],
    };
    const projectRoot = await createFixtureProject(model, [
      ["history", {}],
      ["conversation", {}],
      ["parent", {
        slots: {
          children: {
            content: {
              description: "Content fixture Slot.",
              cardinality: "many",
              optional: true,
              accepts: { anyOfCapabilities: ["visual"] },
            },
          },
        },
      }],
    ]);
    const { catalog } = await buildCatalog(projectRoot, model);

    expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "remove_plugin",
      target: expect.objectContaining({ instanceId: "conversation-main" }),
    }));
    expect(catalog.candidates).not.toContainEqual(expect.objectContaining({
      kind: "move_plugin",
      target: expect.objectContaining({ instanceId: "conversation-main" }),
      effect: {
        type: "plugin_slot",
        parentInstanceId: "parent-main",
        slot: "content",
      },
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
      workspacePolicy: platformMode.workspace,
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
      workspacePolicy: platformMode.workspace,
    })).rejects.toMatchObject({
      name: "CreatorActionCatalogError",
      code: "CREATOR_ACTION_CATALOG_BUILD_FAILED",
      details: { cause: "synthetic AST analyzer crash" },
    });
  });

  it("uses a Workspace Region binding with semantic identity independent of physical syntax", async () => {
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
        candidate.effect.type === "workspace_region" && candidate.effect.region === "right",
    );
    expect(initialRight).toMatchObject({ status: "ready" });
    const initialBinding = initial.catalog.bindings.get(initialRight!.actionId);
    expect(initialBinding).toMatchObject({
      status: "ready",
      operation: {
        type: "workspace_region_move",
        instanceId: "history-main",
        region: "right",
      },
    });

    if (initialBinding?.status !== "ready") throw new Error("fixture did not produce a Workspace binding");
    const movePlan = planWorkspaceRegionMove(
      initialModel,
      initialBinding.operation,
      platformMode.workspace,
    );
    const moved = applyAuthoringOperations(
      initialModel,
      lowerWorkspaceRegionMovePlan(movePlan),
      {
        pluginMoveContracts: pluginMoveContractsForGeneration(initial.generation),
        workspacePolicy: platformMode.workspace,
      },
    );
    if (moved.root.type !== "row") throw new Error("fixture root");
    expect(moved.root.children.map((child) =>
      child.type === "panel" && child.child.type === "slot"
        ? child.child.plugins[0]?.id
        : undefined,
    )).toEqual(["conversation-main", "history-main"]);

    const changedModel = rowModel(["history", "conversation"]);
    if (changedModel.root.type !== "row") throw new Error("fixture root");
    changedModel.root.sizes = ["280px", "1fr"];
    const changed = await buildCatalog(projectRoot, changedModel);
    const changedRight = changed.catalog.candidates.find(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.target.instanceId === "history-main" &&
        candidate.effect.type === "workspace_region" && candidate.effect.region === "right",
    );
    expect(changedRight?.actionId).toBe(initialRight!.actionId);
    expect(changed.catalog.bindings.get(changedRight!.actionId)).toMatchObject({
      status: "ready",
      operation: {
        type: "workspace_region_move",
        region: "right",
      },
    });
  });

  it("does not expose unavailable Workspace Regions for a Center-only policy", async () => {
    const model = rowModel(["conversation"]);
    const projectRoot = await createFixtureProject(model, [["conversation", {}]]);
    const centerOnlyPolicy: AgentUIWorkspacePolicy = {
      regions: { center: platformMode.workspace.regions.center! },
    };
    const { catalog } = await buildCatalog(
      projectRoot,
      model,
      JSON.stringify(model),
      centerOnlyPolicy,
    );
    const workspaceCandidates = catalog.candidates.filter(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.effect.type === "workspace_region",
    );
    expect(workspaceCandidates).toHaveLength(1);
    expect(workspaceCandidates[0]?.effect).toEqual({
      type: "workspace_region",
      region: "center",
    });
  });
});
