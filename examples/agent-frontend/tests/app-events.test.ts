import { MockAgentTransport } from "@agent-ui/runtime-core/testing";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  AppEventRegistry,
  AppEventRuntime,
} from "../runtime/events";
import {
  createPluginRegistry,
  PluginServiceRuntime,
} from "../runtime/plugins";

const eventSchemas = {
  "workspace.patch.applied": z.strictObject({
    changeId: z.string(),
    files: z.array(z.string()),
  }),
} as const;

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function event(
  changeId: string,
  files: string[] = ["src/App.tsx"],
) {
  return {
    name: "workspace.patch.applied",
    payload: { changeId, files },
    producer: { type: "root" as const },
  };
}

function headlessModel(aEnabled = true) {
  return parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "root-node", slotId: "root" },
    pluginInstances: {
      "a-main": {
        id: "a-main",
        pluginId: "plugin-a",
        enabled: aEnabled,
      },
      "b-main": {
        id: "b-main",
        pluginId: "plugin-b",
        enabled: true,
      },
    },
  });
}

function headlessDefinition(
  id: string,
  setup: NonNullable<UIPluginDefinition["setup"]>,
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} event fixture`,
      version: "1.0.0",
      capabilities: ["headless"],
      data: { events: ["workspace.patch.applied"] },
    },
    setup,
    Component: () => null,
  };
}

describe("AppEventRegistry", () => {
  it("decodes known payloads and rejects unknown or invalid input without payload diagnostics", () => {
    const registry = new AppEventRegistry(eventSchemas);

    expect(registry.decode(event("change-1"))).toEqual({
      ok: true,
      event: event("change-1"),
    });
    expect(registry.decode({
      name: "unknown.event",
      payload: { secret: "not logged" },
      producer: { type: "root" },
    })).toEqual({
      ok: false,
      reason: "unknown-event",
      eventName: "unknown.event",
    });
    expect(registry.decode({
      name: "workspace.patch.applied",
      payload: { changeId: 123, files: [] },
      producer: { type: "root" },
    })).toEqual({
      ok: false,
      reason: "invalid-payload",
      eventName: "workspace.patch.applied",
      issuePaths: ["changeId"],
    });
  });

  it("rejects malformed names and standard lifecycle aliases", () => {
    expect(() => new AppEventRegistry({ PatchApplied: z.string() }))
      .toThrow("must be lowercase dot-separated text");
    expect(() => new AppEventRegistry({ "run.finished": z.string() }))
      .toThrow("duplicates a standard Agent Runtime semantic");
  });
});

describe("AppEventRuntime", () => {
  it("drops unknown and invalid events, reports bounded diagnostics, and delivers every valid occurrence", () => {
    const source = new MockAgentTransport();
    const runtime = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    runtime.connect(source);
    const diagnostics = vi.fn();
    const listener = vi.fn();
    runtime.setDiagnosticReporter(diagnostics);
    runtime.createPluginEvents({
      pluginId: "plugin-a",
      instanceId: "a-main",
      declaredEventNames: ["workspace.patch.applied"],
    }).subscribe("workspace.patch.applied", listener);

    source.emitApplicationEvent({
      name: "unknown.event",
      payload: { secret: "must-not-appear" },
      producer: { type: "root" },
    });
    source.emitApplicationEvent({
      name: "workspace.patch.applied",
      payload: { changeId: 123, files: [] },
      producer: { type: "root" },
    });
    source.emitApplicationEvent(event("change-1"));
    source.emitApplicationEvent(event("change-1"));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(diagnostics).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: "application-event-unknown",
      eventName: "unknown.event",
    }));
    expect(diagnostics).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: "application-event-invalid-payload",
      eventName: "workspace.patch.applied",
      issuePaths: ["changeId"],
    }));
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain("must-not-appear");
  });

  it("does not replay an event that arrived before the plugin subscribed", () => {
    const source = new MockAgentTransport();
    const runtime = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    runtime.connect(source);
    source.emitApplicationEvent(event("before"));
    const listener = vi.fn();
    runtime.createPluginEvents({
      pluginId: "plugin-a",
      instanceId: "a-main",
      declaredEventNames: ["workspace.patch.applied"],
    }).subscribe("workspace.patch.applied", listener);

    source.emitApplicationEvent(event("after"));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0].payload.changeId).toBe("after");
  });

  it("rejects undeclared subscriptions with a diagnostic", () => {
    const runtime = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    const diagnostics = vi.fn();
    const listener = vi.fn();
    runtime.setDiagnosticReporter(diagnostics);
    const events = runtime.createPluginEvents({
      pluginId: "plugin-a",
      instanceId: "a-main",
      declaredEventNames: [],
    });

    events.subscribe("workspace.patch.applied", listener);

    expect(listener).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledWith({
      kind: "plugin-event-undeclared-subscription",
      status: "error",
      eventName: "workspace.patch.applied",
      pluginId: "plugin-a",
      instanceId: "a-main",
      errorMessage:
        'Plugin "plugin-a" did not declare application event "workspace.patch.applied"',
    });
  });

  it("does not apply async listener backpressure and isolates rejections", async () => {
    const source = new MockAgentTransport();
    const runtime = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    runtime.connect(source);
    const diagnostics = vi.fn();
    const secondListener = vi.fn();
    runtime.setDiagnosticReporter(diagnostics);
    const firstEvents = runtime.createPluginEvents({
      pluginId: "plugin-a",
      instanceId: "a-main",
      declaredEventNames: ["workspace.patch.applied"],
    });
    const secondEvents = runtime.createPluginEvents({
      pluginId: "plugin-b",
      instanceId: "b-main",
      declaredEventNames: ["workspace.patch.applied"],
    });
    firstEvents.subscribe("workspace.patch.applied", async () => {
      await Promise.resolve();
      throw new Error("async handler failed");
    });
    secondEvents.subscribe("workspace.patch.applied", secondListener);

    source.emitApplicationEvent(event("change-1"));

    expect(secondListener).toHaveBeenCalledOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      kind: "plugin-event-handler-error",
      pluginId: "plugin-a",
      instanceId: "a-main",
      errorMessage: "async handler failed",
    }));
  });

  it("isolates listener payloads, handler failures, and plugin activation lifetimes", () => {
    const source = new MockAgentTransport();
    const appEvents = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    appEvents.connect(source);
    const diagnostics = vi.fn();
    appEvents.setDiagnosticReporter(diagnostics);
    const pluginAEvents: string[][] = [];
    const pluginBEvents: string[][] = [];
    const pluginA = headlessDefinition("plugin-a", ({ events }) =>
      events.subscribe<{ changeId: string; files: string[] }>(
        "workspace.patch.applied",
        ({ payload }) => {
          payload.files.push("plugin-a-only.ts");
          pluginAEvents.push(payload.files);
          throw new Error("plugin A failed");
        },
      ));
    const pluginB = headlessDefinition("plugin-b", ({ events }) =>
      events.subscribe<{ changeId: string; files: string[] }>(
        "workspace.patch.applied",
        ({ payload }) => {
          pluginBEvents.push(payload.files);
        },
      ));
    const pluginRuntime = new PluginServiceRuntime(appEvents);
    const registry = createPluginRegistry([pluginA, pluginB]);
    pluginRuntime.reconcile(headlessModel(), registry, runtimeActions);

    source.emitApplicationEvent(event("change-1"));

    expect(pluginAEvents).toEqual([["src/App.tsx", "plugin-a-only.ts"]]);
    expect(pluginBEvents).toEqual([["src/App.tsx"]]);
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      kind: "plugin-event-handler-error",
      pluginId: "plugin-a",
      instanceId: "a-main",
    }));

    pluginRuntime.reconcile(headlessModel(false), registry, runtimeActions);
    source.emitApplicationEvent(event("change-2", ["src/next.tsx"]));

    expect(pluginAEvents).toHaveLength(1);
    expect(pluginBEvents).toEqual([
      ["src/App.tsx"],
      ["src/next.tsx"],
    ]);

    pluginRuntime.reconcile(headlessModel(), registry, runtimeActions);
    source.emitApplicationEvent(event("change-3", ["src/reactivated.tsx"]));
    expect(pluginAEvents).toEqual([
      ["src/App.tsx", "plugin-a-only.ts"],
      ["src/reactivated.tsx", "plugin-a-only.ts"],
    ]);
    expect(pluginBEvents.at(-1)).toEqual(["src/reactivated.tsx"]);
    pluginRuntime.dispose();
  });

  it("fails activation when a manifest declares an unknown application event", () => {
    const appEvents = new AppEventRuntime(new AppEventRegistry(eventSchemas));
    const pluginRuntime = new PluginServiceRuntime(appEvents);
    const definition: UIPluginDefinition = {
      manifest: {
        id: "plugin-a",
        name: "plugin-a",
        description: "Unknown event fixture",
        version: "1.0.0",
        capabilities: ["headless"],
        data: { events: ["workspace.patch.missing"] },
      },
      Component: () => null,
    };

    pluginRuntime.reconcile(
      parseAppUIModel({
        version: "2",
        root: { type: "slot", id: "root-node", slotId: "root" },
        pluginInstances: {
          "a-main": {
            id: "a-main",
            pluginId: "plugin-a",
            enabled: true,
          },
        },
      }),
      createPluginRegistry([definition]),
      runtimeActions,
    );

    expect(pluginRuntime.getActivation("a-main")).toEqual({
      status: "failed",
      errorMessage:
        'Unknown application event declaration "workspace.patch.missing" in plugin "plugin-a"',
    });
  });
});
