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
  it("shows the resolver intent before execution", () => {
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
          displayIntent: "移除 Conversation Thread List",
          intent: "remove_plugin",
          targetPluginIds: ["conversation-thread-list"],
          targetInstanceIds: ["conversation-thread-list-main"],
          route: "productized",
          modelCalls: 1,
          repairCalls: 0,
          durationMs: 842,
        },
      },
    });

    expect(running?.status).toBe("running");
    expect(completed).toMatchObject({
      id: "stage-1",
      status: "completed",
      displayIntent: "移除 Conversation Thread List",
      metadata: {
        intent: "remove_plugin",
        targetPluginIds: ["conversation-thread-list"],
        modelCalls: 1,
      },
    });
  });

  it("reconciles streamed resolver metrics from RUN_FINISHED", () => {
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
          metrics: { executionModelCalls: 0, mutationAttempts: 1, snapshotRefreshes: 0 },
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
