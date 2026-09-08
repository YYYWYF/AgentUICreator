import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIApplicationGateService,
  UIApplicationGateSnapshot,
  UIPluginDefinition,
  UIPluginSetupContext,
} from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  UIPluginRuntime,
  usePluginService,
} from "../runtime/plugins";
import type {
  PluginDiagnosticContextValue,
  RuntimeDiagnosticEvent,
} from "../runtime/diagnostics";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

class TestGateService implements UIApplicationGateService {
  #snapshot: UIApplicationGateSnapshot;
  readonly #listeners = new Set<() => void>();

  constructor(status: UIApplicationGateSnapshot["status"]) {
    this.#snapshot = { status };
  }

  readonly getSnapshot = (): UIApplicationGateSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  set(status: UIApplicationGateSnapshot["status"], message?: string): void {
    this.#snapshot = { status, ...(message === undefined ? {} : { message }) };
    this.#listeners.forEach((listener) => listener());
  }
}

function definition(
  id: string,
  options: {
    gate?: { service: string; priority?: number };
    headless?: boolean;
    provides?: readonly string[];
    inject?: readonly string[];
    setup?: UIPluginDefinition["setup"];
    Component?: UIPluginDefinition["Component"];
  } = {},
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} fixture`,
      version: "1.0.0",
      ...(options.headless ? { capabilities: ["headless"] } : {}),
      ...(options.gate === undefined
        ? {}
        : { application: { gate: options.gate } }),
    },
    ...(options.provides === undefined ? {} : { provides: options.provides }),
    ...(options.inject === undefined ? {} : { inject: options.inject }),
    ...(options.setup === undefined ? {} : { setup: options.setup }),
    Component: options.Component ?? (() => null),
  };
}

function gateModel(workspaceProps: Record<string, unknown> = {}) {
  return parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "main-node", slotId: "main" },
    pluginInstances: {
      gate: { id: "gate", pluginId: "auth-gate", enabled: true },
      foundation: {
        id: "foundation",
        pluginId: "secure-storage",
        enabled: true,
      },
      workspace: {
        id: "workspace",
        pluginId: "workspace",
        enabled: true,
        mount: { slotId: "main" },
        props: workspaceProps,
      },
      telemetry: {
        id: "telemetry",
        pluginId: "telemetry",
        enabled: true,
      },
    },
  });
}

describe("Application Gate lifecycle", () => {
  it("reports blocked and ready phases with their actual Workspace composition", async () => {
    const gate = new TestGateService("blocked");
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
        setup: ({ services }) => services.provide("auth.gate", gate),
      }),
      definition("workspace", {
        Component: () => createElement("div", null, "Workspace"),
      }),
    ]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "main-node", slotId: "main" },
      pluginInstances: {
        gate: { id: "gate", pluginId: "auth-gate", enabled: true },
        workspace: {
          id: "workspace",
          pluginId: "workspace",
          enabled: true,
          mount: { slotId: "main" },
        },
      },
    });
    const snapshots: Array<{
      application?: { phase: string };
      instances: Array<{ instanceId: string }>;
    }> = [];
    let renderer: ReturnType<typeof create> | undefined;

    await act(async () => {
      renderer = create(createElement(UIPluginRuntime, {
        model,
        registry,
        actions: runtimeActions,
        appUIModelHash: "a".repeat(64),
        onRuntimeComposition: (snapshot) => snapshots.push(snapshot),
      }));
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toMatchObject({
      application: { phase: "blocked" },
      instances: [],
    });

    await act(async () => {
      gate.set("ready");
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toMatchObject({
      application: { phase: "ready" },
      instances: [{ instanceId: "workspace" }],
    });
    act(() => renderer?.unmount());
  });

  it("renders the Gate surface and Layout mutually exclusively", () => {
    const gate = new TestGateService("blocked");
    function GateComponent() {
      const ownGate = usePluginService<UIApplicationGateService>("auth.gate");
      return createElement(
        "div",
        { "data-test-gate": true },
        ownGate?.getSnapshot().status,
      );
    }
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
        setup: ({ services }) => services.provide("auth.gate", gate),
        Component: GateComponent,
      }),
      definition("workspace", {
        Component: () =>
          createElement("div", { "data-test-workspace": true }, "Workspace"),
      }),
    ]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "main-node", slotId: "main" },
      pluginInstances: {
        gate: { id: "gate", pluginId: "auth-gate", enabled: true },
        workspace: {
          id: "workspace",
          pluginId: "workspace",
          enabled: true,
          mount: { slotId: "main" },
        },
      },
    });
    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(createElement(UIPluginRuntime, {
        model,
        registry,
        actions: runtimeActions,
      }));
    });
    expect(
      renderer?.root.findAllByProps({ "data-test-gate": true }),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(0);

    act(() => gate.set("ready"));
    expect(
      renderer?.root.findAllByProps({ "data-test-gate": true }),
    ).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(1);

    act(() => gate.set("blocked"));
    expect(
      renderer?.root.findAllByProps({ "data-test-gate": true }),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(0);
    act(() => renderer?.unmount());
  });

  it("activates only the Gate foundation until all Gates are ready", () => {
    const gate = new TestGateService("checking");
    const workspaceCleanup = vi.fn();
    const telemetrySetup = vi.fn();
    const registry = createPluginRegistry([
      definition("secure-storage", {
        headless: true,
        provides: ["secure-storage"],
        setup: ({ services }) => services.provide("secure-storage", {}),
      }),
      definition("auth-gate", {
        gate: { service: "auth.gate", priority: 100 },
        inject: ["secure-storage"],
        provides: ["auth.gate"],
        setup: ({ services }) => services.provide("auth.gate", gate),
      }),
      definition("workspace", { setup: () => workspaceCleanup }),
      definition("telemetry", { headless: true, setup: telemetrySetup }),
    ]);
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(gateModel(), registry, runtimeActions);

    expect(runtime.getActivation("foundation")?.status).toBe("active");
    expect(runtime.getActivation("gate")?.status).toBe("active");
    expect(runtime.getActivation("workspace")).toBeUndefined();
    expect(runtime.getActivation("telemetry")).toBeUndefined();
    expect(runtime.applicationLifecycle.getSnapshot()).toMatchObject({
      phase: "resolving-gates",
      activeGateInstanceId: "gate",
    });

    gate.set("blocked");
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");

    gate.set("ready");
    expect(runtime.getActivation("workspace")?.status).toBe("active");
    expect(runtime.getActivation("telemetry")?.status).toBe("active");
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready");

    gate.set("blocked");
    expect(workspaceCleanup).toHaveBeenCalledOnce();
    expect(runtime.getActivation("workspace")).toBeUndefined();
    expect(runtime.getActivation("gate")?.status).toBe("active");
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
  });

  it("preserves the foundation activation across Workspace-only model changes", () => {
    const gate = new TestGateService("ready");
    const gateSetup = vi.fn(({ services }: UIPluginSetupContext) =>
      services.provide("auth.gate", gate),
    );
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
        setup: gateSetup,
      }),
      definition("workspace"),
      definition("secure-storage", { headless: true }),
      definition("telemetry", { headless: true }),
    ]);
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(gateModel({ version: 1 }), registry, runtimeActions);
    const activationId = runtime.getActivation("gate");

    runtime.reconcile(gateModel({ version: 2 }), registry, runtimeActions);

    expect(runtime.getActivation("gate")).toEqual(activationId);
    expect(gateSetup).toHaveBeenCalledOnce();
  });

  it("uses priority for the visible Gate and requires every Gate to be ready", () => {
    const high = new TestGateService("ready");
    const low = new TestGateService("blocked");
    const registry = createPluginRegistry([
      definition("high-gate", {
        gate: { service: "high.gate", priority: 100 },
        provides: ["high.gate"],
        setup: ({ services }) => services.provide("high.gate", high),
      }),
      definition("low-gate", {
        gate: { service: "low.gate", priority: 20 },
        provides: ["low.gate"],
        setup: ({ services }) => services.provide("low.gate", low),
      }),
      definition("workspace"),
    ]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "main-node", slotId: "main" },
      pluginInstances: {
        high: { id: "high", pluginId: "high-gate", enabled: true },
        low: { id: "low", pluginId: "low-gate", enabled: true },
        workspace: {
          id: "workspace",
          pluginId: "workspace",
          enabled: true,
          mount: { slotId: "main" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(model, registry, runtimeActions);

    expect(runtime.applicationLifecycle.getSnapshot().activeGateInstanceId).toBe("low");
    expect(runtime.getActivation("workspace")).toBeUndefined();
    low.set("ready");
    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready");
    expect(runtime.getActivation("workspace")?.status).toBe("active");
  });

  it("fails closed when a Gate reports an error", () => {
    const gate = new TestGateService("error");
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
        setup: ({ services }) => services.provide("auth.gate", gate),
      }),
      definition("workspace"),
      definition("secure-storage", { headless: true }),
      definition("telemetry", { headless: true }),
    ]);
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(gateModel(), registry, runtimeActions);

    expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("error");
    expect(runtime.getActivation("workspace")).toBeUndefined();
  });

  it("reports a persistent Gate failure once for each AppUIModel hash", () => {
    const gate = new TestGateService("error");
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
        setup: ({ services }) => services.provide("auth.gate", gate),
      }),
      definition("workspace"),
      definition("secure-storage", { headless: true }),
      definition("telemetry", { headless: true }),
    ]);
    const events: Array<{ hash: string; event: RuntimeDiagnosticEvent }> = [];
    const diagnosticsFor = (hash: string): PluginDiagnosticContextValue => ({
      appUIModelHash: hash,
      locationFor: () => undefined,
      registerMountedInstance: () => () => undefined,
      updateApplicationLifecycle: () => undefined,
      report: (event) => events.push({ hash, event }),
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      gateModel({ workspaceRevision: 1 }),
      registry,
      runtimeActions,
      diagnosticsFor("a".repeat(64)),
    );
    runtime.reconcile(
      gateModel({ workspaceRevision: 2 }),
      registry,
      runtimeActions,
      diagnosticsFor("b".repeat(64)),
    );

    expect(
      events
        .filter(({ event }) => event.status === "error")
        .map(({ hash }) => hash),
    ).toEqual(["a".repeat(64), "b".repeat(64)]);

    gate.set("ready");
    expect(events.at(-1)).toMatchObject({
      hash: "b".repeat(64),
      event: {
        kind: "application-gate",
        status: "resolved",
        instanceId: "gate",
        pluginId: "auth-gate",
      },
    });
  });

  it("fails closed when activation does not synchronously provide the Gate service", () => {
    const registry = createPluginRegistry([
      definition("auth-gate", {
        gate: { service: "auth.gate" },
        provides: ["auth.gate"],
      }),
      definition("workspace"),
      definition("secure-storage", { headless: true }),
      definition("telemetry", { headless: true }),
    ]);
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(gateModel(), registry, runtimeActions);

    expect(runtime.getActivation("gate")?.status).toBe("failed");
    expect(runtime.applicationLifecycle.getSnapshot()).toMatchObject({
      phase: "error",
      failure: { instanceId: "gate", pluginId: "auth-gate" },
    });
    expect(runtime.getActivation("workspace")).toBeUndefined();
  });
});
