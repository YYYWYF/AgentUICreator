import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { RunAgentInputSchema, EventType } from "@ag-ui/core";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  CompositionFastPath,
  CreatorActivityRecorder,
  CreatorAgUiAdapter,
  CreatorProjectPromptContext,
  compileCompositionOperations,
  createCreatorAgent,
  isCompositionFastPathCandidate,
  resolveCompositionTargets,
  type CompositionFastPathPlan,
  type CompositionSummary,
  type UIProjectInspection,
} from "../src/index.js";

const beforeHash = "a".repeat(64);
const afterHash = "b".repeat(64);
const temporaryProjects: string[] = [];

function composition(
  instances: CompositionSummary["instances"] = [
    {
      instanceId: "plugin-a-main",
      pluginId: "plugin-a",
      displayName: "Plugin A",
      semanticNames: ["Plugin A"],
      enabled: true,
      mountedSlotId: "workspace.main",
    },
  ],
  slots: string[] = ["workspace.main", "inspector.tool"],
): CompositionSummary {
  return { instances, slots: slots.map((slotId) => ({ slotId })) };
}

function inspection(summary: CompositionSummary, hash: string): UIProjectInspection {
  return {
    schemaVersion: 2,
    appUIModel: {
      hash,
      version: "2",
      layout: {},
      slots: summary.slots.map(({ slotId }) => ({
        slotId,
        nodeId: `${slotId}-node`,
        nodePath: `root.${slotId}`,
        mounts: summary.instances
          .filter((instance) => instance.mountedSlotId === slotId)
          .map((instance) => ({
            instanceId: instance.instanceId,
            pluginId: instance.pluginId,
            enabled: instance.enabled,
          })),
      })),
    },
    pluginInstances: summary.instances.map((instance) => ({
      id: instance.instanceId,
      pluginId: instance.pluginId,
      enabled: instance.enabled,
      ...(instance.mountedSlotId === undefined
        ? {}
        : {
            mount: { slotId: instance.mountedSlotId },
            mountedSlotId: instance.mountedSlotId,
          }),
    })),
    registry: {
      selectedPluginIds: [...new Set(summary.instances.map(({ pluginId }) => pluginId))],
      registeredPluginIds: [...new Set(summary.instances.map(({ pluginId }) => pluginId))],
      generatedFileFresh: true,
      issues: [],
    },
    pluginAssets: [...new Map(summary.instances.map((instance) => [
      instance.pluginId,
      {
        pluginId: instance.pluginId,
        name: instance.displayName ?? instance.pluginId,
        directory: instance.pluginId,
        manifestPath: `plugins/${instance.pluginId}/manifest.json`,
        definitionPath: `plugins/${instance.pluginId}/definition.ts`,
        capabilities: [],
        selected: true,
      },
    ])).values()],
    catalogs: [],
    uiStack: [],
  };
}

function testHarness(
  plan: CompositionFastPathPlan | Error,
  options: {
    conflict?: boolean;
    runtimePass?: boolean;
    activity?: CreatorActivityRecorder;
  } = {},
) {
  let current = composition();
  let currentHash = beforeHash;
  let plannerCalls = 0;
  let mutationCount = 0;
  let runtimeVerificationCount = 0;
  const adapter = {
    async request(operation: string, input: Record<string, unknown> = {}) {
      if (operation === "inspect_ui_project") {
        return inspection(current, currentHash);
      }
      if (operation !== "mutate_app_ui_model") throw new Error(operation);
      mutationCount += 1;
      if (options.conflict) {
        throw Object.assign(new Error("conflict"), {
          code: "APP_UI_MODEL_HASH_CONFLICT",
        });
      }
      const operations = input.operations as Array<Record<string, unknown>>;
      for (const operation of operations) {
        const instanceId = String(operation.instanceId);
        const instance = current.instances.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        if (instance === undefined) continue;
        if (operation.type === "unmount_instance") delete instance.mountedSlotId;
        if (operation.type === "remove_instance") {
          current = {
            ...current,
            instances: current.instances.filter(
              (candidate) => candidate.instanceId !== instanceId,
            ),
          };
        }
        if (operation.type === "set_instance_enabled") {
          instance.enabled = Boolean(operation.enabled);
        }
        if (operation.type === "mount_instance" || operation.type === "move_instance") {
          instance.mountedSlotId = String(operation.slotId);
        }
      }
      const previousHash = currentHash;
      currentHash = afterHash;
      return {
        changedPaths: ["app-ui/app-ui.json"],
        appUIModel: { beforeHash: previousHash, afterHash: currentHash },
      };
    },
  };
  const runtimeSnapshot = (hash: string) => ({
    currentAppUIModelHash: hash,
    runtimeAppUIModelHash: hash,
    runtimeStatus: "synced" as const,
    synchronized: options.runtimePass !== false,
    observedAt: new Date().toISOString(),
    instances:
      options.runtimePass === false
        ? []
        : current.instances.flatMap((instance) =>
            instance.enabled && instance.mountedSlotId !== undefined
              ? [{
                  instanceId: instance.instanceId,
                  pluginId: instance.pluginId,
                  slotId: instance.mountedSlotId,
                }]
              : [],
          ),
  });
  const runtimeDiagnostics = {
    async waitForComposition(hash: string) {
      runtimeVerificationCount += 1;
      return runtimeSnapshot(hash);
    },
    inspectComposition(hash: string) {
      return runtimeSnapshot(hash);
    },
    inspect(hash: string) {
      return {
        available: true as const,
        currentAppUIModelHash: hash,
        currentErrors: [],
        resolvedCurrent: [],
        stale: [],
        summary: {
          currentOpenCount: 0,
          resolvedCurrentCount: 0,
          staleOpenCount: 0,
          staleResolvedCount: 0,
          truncated: false,
        },
      };
    },
  };
  const planner = {
    async plan() {
      plannerCalls += 1;
      if (plan instanceof Error) throw plan;
      return plan;
    },
  };
  const fastPath = new CompositionFastPath({
    planner,
    adapter,
    activity: options.activity,
    runtimeDiagnostics,
  });
  return {
    fastPath,
    adapter,
    counts: () => ({ plannerCalls, mutationCount, runtimeVerificationCount }),
  };
}

async function createTemporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "composition-fast-path-"));
  temporaryProjects.push(root);
  await mkdir(path.join(root, "app-ui"));
  await writeFile(
    path.join(root, "app-ui", "app-ui.json"),
    `${JSON.stringify({ version: "2", root: { type: "slot", id: "root", slotId: "workspace.main" }, pluginInstances: {} }, null, 2)}\n`,
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("Composition Fast Path deterministic resolution and compilation", () => {
  it("compiles a mounted remove into one atomic unmount plus remove mutation", () => {
    const summary = composition();
    const resolved = resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "remove", target: "Plugin A" }] },
      summary,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(compileCompositionOperations(resolved.intents)).toEqual({
      ok: true,
      mutation: {
        operations: [
          { type: "unmount_instance", instanceId: "plugin-a-main" },
          { type: "remove_instance", instanceId: "plugin-a-main" },
        ],
        expectations: [{ instanceId: "plugin-a-main", mounted: false }],
      },
    });
  });

  it("compiles disable to set_instance_enabled(false)", () => {
    const resolved = resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "disable", target: "plugin-a" }] },
      composition(),
    );
    expect(resolved.ok && compileCompositionOperations(resolved.intents)).toMatchObject({
      mutation: {
        operations: [{ type: "set_instance_enabled", instanceId: "plugin-a-main", enabled: false }],
      },
    });
  });

  it("resolves an exact unique destination and compiles move_instance", () => {
    const resolved = resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "move", target: "Plugin A", destination: "inspector.tool" }] },
      composition(),
    );
    expect(resolved.ok && compileCompositionOperations(resolved.intents)).toMatchObject({
      mutation: {
        operations: [{ type: "move_instance", instanceId: "plugin-a-main", slotId: "inspector.tool" }],
      },
    });
  });

  it("falls back when the target does not exist", () => {
    expect(resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "remove", target: "Plugin Z" }] },
      composition(),
    )).toEqual({ ok: false, reason: "target_not_found" });
  });

  it("falls back instead of selecting the first duplicated semantic target", () => {
    const duplicate = composition([
      ...composition().instances,
      {
        instanceId: "plugin-a-secondary",
        pluginId: "plugin-a",
        displayName: "Plugin A",
        semanticNames: ["Plugin A"],
        enabled: true,
      },
    ]);
    expect(resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "remove", target: "Plugin A" }] },
      duplicate,
    )).toEqual({ ok: false, reason: "ambiguous_target" });
  });

  it("falls back when a slot leaf name is ambiguous", () => {
    expect(resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "move", target: "Plugin A", destination: "tool" }] },
      composition(undefined, ["workspace.tool", "inspector.tool"]),
    )).toEqual({ ok: false, reason: "ambiguous_slot" });
  });

  it("treats Activity like any other uniquely resolvable instance", () => {
    const resolved = resolveCompositionTargets(
      { mode: "composition", intents: [{ action: "remove", target: "Activity" }] },
      composition([
        {
          instanceId: "activity-main",
          pluginId: "activity",
          displayName: "Activity",
          semanticNames: ["Activity"],
          enabled: true,
          mountedSlotId: "workspace.main",
        },
      ]),
    );
    expect(resolved).toMatchObject({
      ok: true,
      intents: [{ instance: { instanceId: "activity-main" } }],
    });
  });
});

describe("Composition Fast Path candidate gate", () => {
  it("admits supported instance-level composition wording", () => {
    expect(isCompositionFastPathCandidate("把 Plugin A 移到 inspector.tool")).toBe(true);
    expect(isCompositionFastPathCandidate("disable plugin A")).toBe(true);
  });

  it("rejects obvious coding work before the Planner", () => {
    expect(isCompositionFastPathCandidate("把 Activity 标签的字体改成红色")).toBe(false);
    expect(isCompositionFastPathCandidate("删除 CSS 里的旧样式代码")).toBe(false);
  });
});

describe("Composition Fast Path routing", () => {
  it("handles Planner -> mutation -> Runtime verification without General Agent", async () => {
    const harness = testHarness({
      mode: "composition",
      intents: [{ action: "remove", target: "Plugin A" }],
    });
    let generalAgentCalls = 0;
    const result = await harness.fastPath.tryHandle("remove plugin A");
    if (!result.handled) generalAgentCalls += 1;

    expect(result).toMatchObject({
      handled: true,
      metrics: {
        planner: { modelCalls: 1 },
        generalAgentCalls: 0,
        mutationCount: 1,
        runtimeVerificationCount: 1,
      },
    });
    expect(generalAgentCalls).toBe(0);
    expect(harness.counts()).toEqual({
      plannerCalls: 1,
      mutationCount: 1,
      runtimeVerificationCount: 1,
    });
  });

  it("falls back losslessly after a Planner exception", async () => {
    const harness = testHarness(new Error("planner unavailable"));
    const result = await harness.fastPath.tryHandle("remove plugin A");
    expect(result).toMatchObject({ handled: false, reason: "planner_failure" });
    expect(harness.counts()).toEqual({
      plannerCalls: 1,
      mutationCount: 0,
      runtimeVerificationCount: 0,
    });
  });

  it("does not retry a mutation CAS conflict", async () => {
    const harness = testHarness(
      { mode: "composition", intents: [{ action: "disable", target: "Plugin A" }] },
      { conflict: true },
    );
    const result = await harness.fastPath.tryHandle("disable plugin A");
    expect(result).toMatchObject({ handled: false, reason: "mutation_conflict" });
    expect(harness.counts().mutationCount).toBe(1);
  });

  it("passes an applied-mutation diagnostic on Runtime verification failure", async () => {
    const harness = testHarness(
      { mode: "composition", intents: [{ action: "move", target: "Plugin A", destination: "inspector.tool" }] },
      { runtimePass: false },
    );
    const result = await harness.fastPath.tryHandle("move plugin A to inspector.tool");
    expect(result).toMatchObject({
      handled: false,
      reason: "runtime_verification_failed",
      diagnostic: {
        mutationApplied: true,
        beforeHash,
        afterHash,
        operations: [{ type: "move_instance", instanceId: "plugin-a-main", slotId: "inspector.tool" }],
      },
    });
  });

  it("skips the Planner for an obvious source change", async () => {
    const harness = testHarness({ mode: "fallback", reason: "requires_source_change" });
    const result = await harness.fastPath.tryHandle("把 Activity 标签的字体改成红色");
    expect(result).toMatchObject({
      handled: false,
      reason: "not_composition_request",
      metrics: { planner: { modelCalls: 0 } },
    });
    expect(harness.counts().plannerCalls).toBe(0);
    expect(harness.counts().mutationCount).toBe(0);
  });
});

describe("Composition Fast Path AG-UI integration", () => {
  it("emits the normal stream lifecycle and skips the General Agent on success", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel();
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
    });
    const harness = testHarness({
      mode: "composition",
      intents: [{ action: "disable", target: "Plugin A" }],
    });
    const adapter = new CreatorAgUiAdapter(
      agent,
      activity,
      undefined,
      undefined,
      harness.fastPath,
    );
    const input = RunAgentInputSchema.parse({
      threadId: "fast-path-thread",
      runId: "fast-path-run",
      messages: [{ id: "request", role: "user", content: "disable plugin A" }],
      tools: [],
      context: [],
      state: {},
    });
    const events = [];
    for await (const event of adapter.run(input)) events.push(event);

    expect(events.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(model.callCount).toBe(0);
  });

  it("forwards the original request to General Agent exactly once on fallback", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel().respond(new AIMessage("General Agent handled it."));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
    });
    const harness = testHarness({ mode: "fallback", reason: "requires_source_change" });
    const adapter = new CreatorAgUiAdapter(
      agent,
      activity,
      undefined,
      undefined,
      harness.fastPath,
    );
    const request = "把 Activity 标签的字体改成红色";
    const input = RunAgentInputSchema.parse({
      threadId: "fallback-thread",
      runId: "fallback-run",
      messages: [{ id: "request", role: "user", content: request }],
      tools: [],
      context: [],
      state: {},
    });
    for await (const _event of adapter.run(input)) void _event;

    expect(model.callCount).toBe(1);
    expect(model.calls[0]?.messages.some((message) => message.text === request)).toBe(true);
  });

  it("gives the fallback General Agent a post-mutation navigation snapshot", async () => {
    const projectRoot = await createTemporaryProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    activity.begin("fast-path-fallback-run");
    const harness = testHarness(
      {
        mode: "composition",
        intents: [{ action: "remove", target: "Plugin A" }],
      },
      { runtimePass: false, activity },
    );

    const fastPathResult = await harness.fastPath.tryHandle("remove plugin A");
    expect(fastPathResult).toMatchObject({ handled: false });
    expect(activity.revision).toBeGreaterThan(0);

    const promptContext = new CreatorProjectPromptContext(
      harness.adapter,
      activity,
    );
    const context = await promptContext.current();
    const prompt = `${context.navigationPrompt}\n\n${context.currentStatePrompt}`;
    expect(prompt).toContain(afterHash);
    expect(prompt).not.toContain(beforeHash);
    expect(prompt).not.toContain("plugin-a-main");
  });
});
