import { describe, expect, it } from "vitest";

import { resolveCreatorDebugMode } from "../src/ui/creatorDebug.js";
import {
  projectCreatorIntentStage,
  reconcileCreatorStageFromRunResult,
  type CreatorStageActivity,
} from "../src/ui/creatorStageProjection.js";

describe("Creator debug mode", () => {
  it("defaults to debug on for localhost", () => {
    expect(
      resolveCreatorDebugMode({ hostname: "localhost", search: "" }),
    ).toBe(true);
    expect(
      resolveCreatorDebugMode({ hostname: "127.0.0.1", search: "" }),
    ).toBe(true);
  });

  it("honors explicit URL overrides", () => {
    expect(
      resolveCreatorDebugMode({
        hostname: "localhost",
        search: "?creatorDebug=0",
      }),
    ).toBe(false);
    expect(
      resolveCreatorDebugMode({
        hostname: "preview.example.com",
        search: "?creatorDebug=true",
      }),
    ).toBe(true);
  });

  it("defaults to ordinary mode on remote hosts", () => {
    expect(
      resolveCreatorDebugMode({ hostname: "preview.example.com", search: "" }),
    ).toBe(false);
  });
});

describe("Creator stage projection", () => {
  it("shows the selected Action and realtime selector metrics before execution", () => {
    const running = projectCreatorIntentStage(undefined, {
      kind: "started",
      name: "creator.resolve",
      id: "stage-1",
      metadata: { creator: { phase: "understanding", status: "running" } },
    });
    const completed = projectCreatorIntentStage(running, {
      kind: "finished",
      name: "creator.resolve",
      metadata: {
        creator: {
          phase: "understanding",
          status: "success",
          decision: "select_action",
          displayIntent: "将 Conversation Thread List 移到右侧区域",
          intent: "move_plugin",
          actionId: "act_history_right",
          actionKind: "move_plugin",
          actionStatus: "ready",
          effectType: "workspace_region",
          region: "right",
          targetPluginIds: ["conversation-thread-list"],
          targetInstanceIds: ["conversation-thread-list-main"],
          route: "productized",
          modelCalls: 1,
          repairCalls: 0,
          invalidResponses: 0,
          durationMs: 800,
          candidateCount: 7,
          contextCharacters: 3200,
          actionSelectorCalls: 1,
          actionSelectorRepairCalls: 0,
          actionSelectorInvalidResponses: 0,
          actionSelectorDurationMs: 800,
        },
      },
    });

    expect(running?.status).toBe("running");
    expect(completed).toMatchObject({
      id: "stage-1",
      status: "completed",
      displayIntent: "将 Conversation Thread List 移到右侧区域",
      metadata: {
        decision: "select_action",
        intent: "move_plugin",
        actionId: "act_history_right",
        actionKind: "move_plugin",
        actionStatus: "ready",
        effectType: "workspace_region",
        region: "right",
        modelCalls: 1,
        actionSelectorCalls: 1,
        actionSelectorRepairCalls: 0,
        actionSelectorInvalidResponses: 0,
        candidateCount: 7,
        contextCharacters: 3200,
      },
    });
  });

  it("reads legacy Resolver intent metadata for compatibility", () => {
    const stage: CreatorStageActivity = {
      kind: "stage",
      id: "stage-1",
      name: "creator.resolve",
      status: "completed",
      displayIntent: "移除 Conversation Thread List",
      metadata: { modelCalls: 1, durationMs: 1 },
    };

    const reconciled = reconcileCreatorStageFromRunResult(stage, {
      creatorIntent: {
        displayIntent: "移除 Conversation Thread List",
        intent: "remove_plugin",
        targetPluginIds: ["conversation-thread-list"],
        targetInstanceIds: ["conversation-thread-list-main"],
        route: "productized",
      },
      operationResolver: {
        operationResolverCalls: 1,
        operationResolverRepairCalls: 0,
        operationResolverInvalidResponses: 0,
        operationResolverDurationMs: 842,
      },
    });

    expect(reconciled.metadata).toMatchObject({
      modelCalls: 1,
      repairCalls: 0,
      durationMs: 842,
      route: "productized",
    });
  });

  it("reconciles Action Selector fields from RUN_FINISHED", () => {
    const stage: CreatorStageActivity = {
      kind: "stage",
      id: "stage-1",
      name: "creator.resolve",
      status: "completed",
      displayIntent: "将 Conversation Thread List 移到右侧区域",
      metadata: { modelCalls: 1, durationMs: 1 },
    };

    const reconciled = reconcileCreatorStageFromRunResult(stage, {
      creatorIntent: {
        displayIntent: "将 Conversation Thread List 移到右侧区域",
        route: "productized",
      },
      actionSelector: {
        actionSelectorCalls: 1,
        actionSelectorRepairCalls: 0,
        actionSelectorInvalidResponses: 0,
        actionSelectorDurationMs: 800,
        actionSelectorCandidateCount: 7,
        actionSelectorContextCharacters: 3200,
      },
      actionSelection: {
        decision: "select_action",
        actionId: "act_history_right",
      },
      selectedCreatorAction: {
        actionId: "act_history_right",
        kind: "move_plugin",
        status: "ready",
        target: {
          pluginId: "conversation-thread-list",
          pluginName: "Conversation Thread List",
          instanceId: "conversation-thread-list-main",
        },
        effect: {
          type: "workspace_region",
          region: "right",
        },
      },
    });

    expect(reconciled.metadata).toMatchObject({
      decision: "select_action",
      actionId: "act_history_right",
      actionKind: "move_plugin",
      actionStatus: "ready",
      effectType: "workspace_region",
      region: "right",
      route: "productized",
      modelCalls: 1,
      actionSelectorCalls: 1,
      actionSelectorRepairCalls: 0,
      actionSelectorInvalidResponses: 0,
      durationMs: 800,
      candidateCount: 7,
      contextCharacters: 3200,
    });
    expect(reconciled.metadata).not.toHaveProperty("operationResolver");
  });

  it("projects unsupported Action decisions as unsupported", () => {
    const stage: CreatorStageActivity = {
      kind: "stage",
      id: "stage-1",
      name: "creator.resolve",
      status: "completed",
      metadata: {},
    };

    const reconciled = reconcileCreatorStageFromRunResult(stage, {
      actionSelection: {
        decision: "unsupported_product_action",
      },
      completion: "blocked",
      blocker: { code: "PRODUCT_ACTION_UNSUPPORTED" },
    });

    expect(reconciled.metadata).toMatchObject({
      decision: "unsupported_product_action",
      route: "unsupported",
    });
    expect(reconciled.metadata?.route).not.toBe("general-agent");
  });

  it("keeps General Agent totals separate from Action Selector calls", () => {
    const stage: CreatorStageActivity = {
      kind: "stage",
      id: "stage-1",
      name: "creator.resolve",
      status: "completed",
      metadata: {},
    };

    const reconciled = reconcileCreatorStageFromRunResult(stage, {
      actionSelector: { actionSelectorCalls: 1 },
      actionSelection: { decision: "general_change" },
      toolProtocol: {
        modelCalls: 5,
        toolCalls: 4,
        totalModelCalls: 6,
      },
    });

    expect(reconciled.metadata).toMatchObject({
      route: "general-agent",
      actionSelectorCalls: 1,
      generalAgentModelCalls: 5,
      generalAgentToolCalls: 4,
      totalModelCalls: 6,
    });
  });

  it("does not project private Host bindings into observability", () => {
    const stage: CreatorStageActivity = {
      kind: "stage",
      id: "stage-1",
      name: "creator.resolve",
      status: "completed",
      metadata: {},
    };

    const reconciled = reconcileCreatorStageFromRunResult(stage, {
      creatorIntent: {
        displayIntent: "将 Conversation Thread List 移到右侧区域",
        bindings: { internal: "secret" },
        move_layout_node: "private",
      },
      actionSelection: {
        decision: "select_action",
        actionId: "act_history_right",
      },
      selectedCreatorAction: {
        actionId: "act_history_right",
        kind: "move_plugin",
        status: "ready",
        target: {
          pluginId: "conversation-thread-list",
          instanceId: "conversation-thread-list-main",
        },
        effect: {
          type: "workspace_region",
          region: "right",
          destinationTrack: "private",
          insertionIndex: 2,
          layoutRef: "private",
        },
      },
    });

    const serialized = JSON.stringify(reconciled.metadata);
    expect(serialized).not.toContain("bindings");
    expect(serialized).not.toContain("workspace_region_move");
    expect(serialized).not.toContain("move_layout_node");
    expect(serialized).not.toContain("destinationTrack");
    expect(serialized).not.toContain("insertionIndex");
    expect(serialized).not.toContain("layoutRef");
  });

  it("projects bounded move placement and verification metadata", () => {
    const stage = projectCreatorIntentStage(undefined, {
      kind: "finished",
      name: "creator.resolve",
      metadata: {
        creator: {
          status: "success",
          displayIntent: "将 Conversation Thread List 移到 Conversation Surface 右侧",
          intent: "move_plugin",
          route: "productized",
          placementType: "relative",
          anchorPluginId: "conversation-surface",
          anchorInstanceId: "conversation-surface-main",
          relation: "after",
          ignored: { raw: "metadata" },
        },
      },
    });

    const reconciled = reconcileCreatorStageFromRunResult(
      {
        ...stage!,
        name: "creator.productized-operation",
      },
      {
        creatorIntent: {
          placementType: "relative",
          anchorPluginId: "conversation-surface",
          anchorInstanceId: "conversation-surface-main",
          relation: "after",
          route: "productized",
        },
        productizedOperation: {
          operation: "move_plugin",
          status: "success",
          metrics: {
            executionModelCalls: 0,
            mutationAttempts: 1,
            snapshotRefreshes: 0,
          },
          verification: {
            staticStatus: "passed",
            runtimeStatus: "passed",
            runtimeFreshnessAttempts: 1,
            runtimeFreshnessWaitMs: 0,
            placementVerified: true,
            geometryVerified: true,
          },
        },
      },
    );

    expect(stage?.metadata).toMatchObject({
      placementType: "relative",
      anchorPluginId: "conversation-surface",
      anchorInstanceId: "conversation-surface-main",
      relation: "after",
    });
    expect(stage?.metadata).not.toHaveProperty("ignored");
    expect(reconciled.metadata).toMatchObject({
      placementType: "relative",
      placementVerified: true,
      geometryVerified: true,
    });
  });
});
