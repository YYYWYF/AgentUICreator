import { describe, expect, it } from "vitest";

import {
  CreatorActivityRecorder,
  CreatorProjectPromptContext,
  CreatorRuntimeDiagnosticSession,
  CreatorRuntimeDiagnosticStore,
  createCreatorProjectTools,
  type ProjectControlAdapter,
  type UIProjectInspection,
} from "../src/index.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function inspection(
  hash: string,
  instances: Array<{ id: string; pluginId: string }> = [
    { id: "plugin-a-main", pluginId: "plugin-a" },
  ],
): UIProjectInspection {
  return {
    schemaVersion: 2,
    appUIModel: {
      hash,
      version: "2",
      layout: {
        id: "root-slot",
        type: "slot",
        slotId: "workspace.main",
      },
      slots: [
        {
          slotId: "workspace.main",
          nodeId: "root-slot",
          nodePath: "root",
          mounts: instances.map((instance) => ({
            instanceId: instance.id,
            pluginId: instance.pluginId,
            enabled: true,
          })),
        },
      ],
    },
    pluginInstances: instances.map((instance) => ({
      ...instance,
      enabled: true,
      mount: { slotId: "workspace.main" },
      mountedSlotId: "workspace.main",
    })),
    registry: {
      selectedPluginIds: instances.map(({ pluginId }) => pluginId),
      registeredPluginIds: instances.map(({ pluginId }) => pluginId),
      generatedFileFresh: true,
      issues: [],
    },
    pluginAssets: instances.map(({ pluginId }) => ({
      pluginId,
      directory: pluginId,
      manifestPath: `plugins/${pluginId}/manifest.json`,
      definitionPath: `plugins/${pluginId}/definition.ts`,
      capabilities: ["visual"],
      selected: true,
    })),
    catalogs: [],
    uiStack: [],
  };
}

function combinedPrompt(context: {
  navigationPrompt: string;
  currentStatePrompt: string;
}): string {
  return `${context.navigationPrompt}\n\n${context.currentStatePrompt}`;
}

describe("CreatorProjectPromptContext snapshot freshness", () => {
  it("reuses unchanged navigation, refreshes once per revision, and removes stale facts", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-context",
    );
    activity.begin("run-a");
    let currentInspection = inspection(hashA);
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request(operation: string) {
        if (operation !== "inspect_ui_project") throw new Error(operation);
        inspectUIProjectCalls += 1;
        return currentInspection;
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);

    const first = combinedPrompt(await promptContext.current());
    const unchanged = combinedPrompt(await promptContext.current());
    expect(first).toContain("<ui-project-navigation-snapshot>");
    expect(first).toContain("<creator-current-state>");
    expect(first).toContain(hashA);
    expect(first).toContain("plugin-a-main");
    expect(unchanged).toContain(hashA);
    expect(inspectUIProjectCalls).toBe(1);

    currentInspection = inspection(hashB, []);
    activity.touch("app-ui/app-ui.json");
    activity.touch("plugins/registry.generated.ts");
    const afterMutation = combinedPrompt(await promptContext.current());
    const reusedAfterMutation = combinedPrompt(await promptContext.current());
    expect(afterMutation).toContain(hashB);
    expect(afterMutation).not.toContain(hashA);
    expect(afterMutation).not.toContain("plugin-a-main");
    expect(afterMutation).toContain('"mutationRevision":2');
    expect(afterMutation).toContain('"snapshotRevision":2');
    expect(reusedAfterMutation).toContain(hashB);
    expect(inspectUIProjectCalls).toBe(2);
    expect(promptContext.metrics()).toEqual({
      snapshotRefreshes: 2,
      snapshotCacheHits: 2,
      snapshotInvalidations: 0,
    });
  });

  it("refreshes once after a source edit and for a new run", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-source-edit",
    );
    activity.begin("run-a");
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request() {
        inspectUIProjectCalls += 1;
        return inspection(hashA);
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);

    await promptContext.current();
    activity.touch("plugins/plugin-a/definition.tsx");
    await promptContext.current();
    await promptContext.current();
    expect(inspectUIProjectCalls).toBe(2);

    activity.begin("run-b");
    await promptContext.current();
    expect(inspectUIProjectCalls).toBe(3);
  });

  it("updates validation and verification state without reloading navigation", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-validation",
    );
    activity.begin("run-validation");
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request() {
        inspectUIProjectCalls += 1;
        return inspection(hashA);
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);

    await promptContext.current();
    activity.recordValidation("pnpm typecheck", {
      output: "passed",
      exitCode: 0,
      truncated: false,
    });
    const afterValidation = combinedPrompt(await promptContext.current());
    expect(afterValidation).toContain('"command":"pnpm typecheck"');
    expect(afterValidation).toContain('"status":"passed"');
    expect(inspectUIProjectCalls).toBe(1);

    activity.recordVerification({
      status: "changed-and-verified",
      projectRevision: 0,
      auditAttempts: 1,
      checks: [],
    });
    const afterVerification = combinedPrompt(await promptContext.current());
    expect(afterVerification).toContain('"status":"changed-and-verified"');
    expect(inspectUIProjectCalls).toBe(1);
  });

  it("updates runtime diagnostics without reloading navigation", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-runtime",
    );
    activity.begin("run-runtime");
    const store = new CreatorRuntimeDiagnosticStore();
    const runtimeDiagnostics = new CreatorRuntimeDiagnosticSession(
      store,
      "project-a",
    );
    runtimeDiagnostics.beginThread("thread-a");
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request() {
        inspectUIProjectCalls += 1;
        return inspection(hashA);
      },
    };
    const promptContext = new CreatorProjectPromptContext(
      adapter,
      activity,
      runtimeDiagnostics,
    );

    await promptContext.current();
    store.record("project-a", "thread-a", {
      schemaVersion: 1,
      kind: "plugin-render",
      status: "error",
      appUIModelHash: hashA,
      occurredAt: new Date().toISOString(),
      pluginId: "plugin-a",
      instanceId: "plugin-a-main",
      errorMessage: "render failed",
    });
    const afterDiagnostic = combinedPrompt(await promptContext.current());
    expect(afterDiagnostic).toContain('"currentOpenCount":1');
    expect(inspectUIProjectCalls).toBe(1);
  });

  it("reloads after explicit invalidation even when the revision is unchanged", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-invalidation",
    );
    activity.begin("run-conflict");
    let currentInspection = inspection(hashA);
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request() {
        inspectUIProjectCalls += 1;
        return currentInspection;
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);

    await promptContext.current();
    currentInspection = inspection(hashB);
    promptContext.invalidate("app_ui_model_hash_conflict");
    const refreshed = combinedPrompt(await promptContext.current());
    expect(activity.revision).toBe(0);
    expect(refreshed).toContain(hashB);
    expect(refreshed).not.toContain(hashA);
    expect(inspectUIProjectCalls).toBe(2);
  });

  it("connects mutate_app_ui_model hash conflicts to prompt invalidation", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-tool-conflict",
    );
    activity.begin("run-tool-conflict");
    let externalChangeApplied = false;
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request(operation: string) {
        if (operation === "inspect_ui_project") {
          inspectUIProjectCalls += 1;
          return inspection(externalChangeApplied ? hashB : hashA);
        }
        if (operation === "mutate_app_ui_model") {
          externalChangeApplied = true;
          throw Object.assign(new Error("AppUIModel changed externally."), {
            code: "APP_UI_MODEL_HASH_CONFLICT",
          });
        }
        throw new Error(operation);
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);
    const tools = createCreatorProjectTools(
      adapter as unknown as ProjectControlAdapter,
      activity,
      undefined,
      promptContext,
    );
    const mutationTool = tools.find(
      (candidate) => candidate.name === "mutate_app_ui_model",
    );
    if (mutationTool === undefined) throw new Error("Missing mutation tool.");

    const before = combinedPrompt(await promptContext.current());
    expect(before).toContain(hashA);
    await (
      mutationTool as unknown as {
        invoke(input: {
          appUIModelHash: string;
          operations: unknown[];
        }): Promise<unknown>;
      }
    ).invoke({
      appUIModelHash: hashA,
      operations: [{ type: "remove_instance", instanceId: "plugin-a-main" }],
    });
    const after = combinedPrompt(await promptContext.current());
    expect(activity.revision).toBe(0);
    expect(after).toContain(hashB);
    expect(after).not.toContain(hashA);
    expect(inspectUIProjectCalls).toBe(2);
    expect(promptContext.metrics().snapshotInvalidations).toBe(1);
    expect(promptContext.metrics().lastInvalidationReason).toBe(
      "app_ui_model_hash_conflict",
    );
  });

  it("primes navigation from inspect_ui_project and invalidates after exact AppUIModel inspection", async () => {
    const activity = new CreatorActivityRecorder(
      "/tmp/creator-project-prompt-prime",
    );
    activity.begin("run-prime");
    let inspectUIProjectCalls = 0;
    const adapter = {
      async request(operation: string) {
        if (operation === "inspect_ui_project") {
          inspectUIProjectCalls += 1;
          return inspection(hashA);
        }
        if (operation === "inspect_app_ui_model") {
          return { hash: hashA, model: {} };
        }
        throw new Error(operation);
      },
    };
    const promptContext = new CreatorProjectPromptContext(adapter, activity);
    const tools = createCreatorProjectTools(
      adapter as unknown as ProjectControlAdapter,
      activity,
      undefined,
      promptContext,
    );
    const invoke = async (name: string) => {
      const selected = tools.find((candidate) => candidate.name === name);
      if (selected === undefined) throw new Error(`Missing tool ${name}.`);
      return (
        selected as unknown as { invoke(input: {}): Promise<unknown> }
      ).invoke({});
    };

    await invoke("inspect_ui_project");
    await promptContext.current();
    expect(inspectUIProjectCalls).toBe(1);

    await invoke("inspect_app_ui_model");
    await promptContext.current();
    expect(inspectUIProjectCalls).toBe(2);
  });
});
