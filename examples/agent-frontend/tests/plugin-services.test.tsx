import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginObservableService,
  UIPluginDefinition,
  UIPluginSetupContext,
} from "../framework/contracts/ui-plugin";
import {
  createAgentUIThemeService,
} from "../plugins/antd-x-theme-provider/theme-service";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { antdXRunTimelinePlugin } from "../plugins/antd-x-run-timeline/definition";
import {
  createPluginRegistry,
  PluginServiceConsumerContext,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  SlotRegistry,
  usePluginService,
  usePluginServiceSnapshot,
} from "../runtime/plugins";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function createDefinition(
  id: string,
  definition: Pick<
    UIPluginDefinition,
    "inject" | "optionalInject" | "setup" | "provides"
  > = {},
  childSlots?: readonly string[],
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} test plugin`,
      version: "1.0.0",
      ...(definition.setup === undefined ? {} : { capabilities: ["headless"] }),
      ...(childSlots === undefined ? {} : { slots: { children: childSlots } }),
    },
    ...definition,
    Component: () => null,
  };
}

function createServiceModel(providerEnabled = true) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "slot",
      id: "services-slot-node",
      slotId: "services-slot",
    },
    pluginInstances: {
      // Deliberately list the consumer first: dependency resolution must not
      // depend on AppUIModel object order or layout order.
      "consumer-main": {
        id: "consumer-main",
        pluginId: "consumer",
        enabled: true,
        mount: { slotId: "services-slot" },
      },
      "provider-main": {
        id: "provider-main",
        pluginId: "provider",
        enabled: providerEnabled,
      },
    },
  });
}

describe("PluginServiceRuntime", () => {
  it("rejects contributions to an undeclared Slot deterministically", () => {
    const slots = new SlotRegistry();

    expect(() =>
      slots.register({ instanceId: "one", slotId: "messages" }),
    ).toThrow('Cannot register contribution for undeclared Slot "messages"');
  });

  it("rejects multiple ordinary contributions from the same instance", () => {
    const slots = new SlotRegistry();
    slots.declare({
      slotId: "left",
      owner: { kind: "layout", nodeId: "left-node" },
    });
    slots.declare({
      slotId: "right",
      owner: { kind: "layout", nodeId: "right-node" },
    });
    slots.register({ instanceId: "one", slotId: "left" });

    expect(() =>
      slots.register({ instanceId: "one", slotId: "right" }),
    ).toThrow('Plugin instance "one" already has a Slot contribution');
  });

  it("does not activate an enabled visual instance without mount", () => {
    const model = createServiceModel();
    delete model.pluginInstances["consumer-main"]!.mount;
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(model, createPluginRegistry([createDefinition("consumer")]), runtimeActions);
    expect(runtime.getActivation("consumer-main")).toBeUndefined();
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);
  });

  it("activates the message list without the optional conversation service", () => {
    const model = parseAppUIModel({
      version: "2",
      root: {
        type: "column",
        id: "conversation-consumers",
        children: [
          {
            type: "slot",
            id: "messages-slot-node",
            slotId: "messages-slot",
          },
          {
            type: "slot",
            id: "timeline-slot-node",
            slotId: "timeline-slot",
          },
        ],
      },
      pluginInstances: {
        "messages-main": {
          id: "messages-main",
          pluginId: "antd-x-message-list",
          enabled: true,
          mount: { slotId: "messages-slot" },
        },
        "timeline-main": {
          id: "timeline-main",
          pluginId: "antd-x-run-timeline",
          enabled: true,
          mount: { slotId: "timeline-slot" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      model,
      createPluginRegistry([
        antdXMessageListPlugin,
        antdXRunTimelinePlugin,
      ]),
      runtimeActions,
    );

    expect(runtime.getActivation("messages-main")?.status).toBe("active");
    expect(runtime.getActivation("timeline-main")?.status).toBe("active");
  });

  it("activates hard consumers after their named service becomes available", () => {
    let greeting: string | undefined;
    const provider = createDefinition("provider", {
      provides: ["test.greeter"],
      setup: ({ services }) => {
        services.provide("test.greeter", {
          greet: (who: string) => `Hello, ${who}!`,
        });
      },
    });
    const consumer = createDefinition("consumer", {
      inject: ["test.greeter"],
      setup: ({ services }) => {
        greeting = services
          .get<{ greet(who: string): string }>("test.greeter")
          ?.greet("Agent");
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(),
      createPluginRegistry([consumer, provider]),
      runtimeActions,
    );

    expect(greeting).toBe("Hello, Agent!");
    expect(runtime.getActivation("provider-main")?.status).toBe("active");
    expect(runtime.getActivation("consumer-main")?.status).toBe("active");
  });

  it("soft-orders an available optional Provider before Consumer setup", () => {
    let observed: unknown;
    const provider = createDefinition("provider", {
      provides: ["test.optional"],
      setup: ({ services }) => {
        services.provide("test.optional", { available: true });
      },
    });
    const consumer = createDefinition("consumer", {
      optionalInject: ["test.optional"],
      setup: ({ services }) => {
        observed = services.get("test.optional");
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(),
      createPluginRegistry([consumer, provider]),
      runtimeActions,
    );

    expect(observed).toEqual({ available: true });
    expect(runtime.getActivation("consumer-main")?.status).toBe("active");
  });

  it("keeps a Consumer active when its optional Service is unavailable", () => {
    let observed: unknown = "not-called";
    const consumer = createDefinition("consumer", {
      optionalInject: ["test.optional"],
      setup: ({ services }) => {
        observed = services.get("test.optional");
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(false),
      createPluginRegistry([consumer]),
      runtimeActions,
    );

    expect(observed).toBeUndefined();
    expect(runtime.getActivation("consumer-main")?.status).toBe("active");
  });

  it("breaks optional cycles without blocking activation", () => {
    const first = createDefinition("first", {
      provides: ["test.first"],
      optionalInject: ["test.second"],
      setup: ({ services }) => {
        services.get("test.second");
        services.provide("test.first", {});
      },
    });
    const second = createDefinition("second", {
      provides: ["test.second"],
      optionalInject: ["test.first"],
      setup: ({ services }) => {
        services.get("test.first");
        services.provide("test.second", {});
      },
    });
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        first: { id: "first", pluginId: "first", enabled: true },
        second: { id: "second", pluginId: "second", enabled: true },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(model, createPluginRegistry([first, second]), runtimeActions);

    expect(runtime.getActivation("first")?.status).toBe("active");
    expect(runtime.getActivation("second")?.status).toBe("active");
  });

  it("breaks hard plus optional cycles without blocking activation", () => {
    const first = createDefinition("first", {
      provides: ["test.first"],
      optionalInject: ["test.second"],
      setup: ({ services }) => {
        services.get("test.second");
        services.provide("test.first", {});
      },
    });
    const second = createDefinition("second", {
      provides: ["test.second"],
      inject: ["test.first"],
      setup: ({ services }) => {
        services.get("test.first");
        services.provide("test.second", {});
      },
    });
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        first: { id: "first", pluginId: "first", enabled: true },
        second: { id: "second", pluginId: "second", enabled: true },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(model, createPluginRegistry([first, second]), runtimeActions);

    expect(runtime.getActivation("first")?.status).toBe("active");
    expect(runtime.getActivation("second")?.status).toBe("active");
  });

  it("fails setup that reads an undeclared Service", () => {
    const consumer = createDefinition("consumer", {
      setup: ({ services }) => {
        services.get("test.secret");
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(false),
      createPluginRegistry([consumer]),
      runtimeActions,
    );

    expect(runtime.getActivation("consumer-main")).toEqual({
      status: "failed",
      errorMessage:
        'Plugin "consumer" instance "consumer-main" accessed undeclared service "test.secret"',
    });
  });

  it("enforces component declarations but leaves application lookup unrestricted", () => {
    const runtime = new PluginServiceRuntime();
    function Probe() {
      usePluginService("test.secret");
      return null;
    }

    expect(() =>
      create(
        <PluginServiceRuntimeContext.Provider value={runtime}>
          <PluginServiceConsumerContext.Provider
            value={{
              pluginId: "consumer",
              instanceId: "consumer-main",
              provides: [],
              inject: [],
              optionalInject: [],
            }}
          >
            <Probe />
          </PluginServiceConsumerContext.Provider>
        </PluginServiceRuntimeContext.Provider>,
      ),
    ).toThrow(
      'Plugin "consumer" instance "consumer-main" accessed undeclared service "test.secret"',
    );

    expect(() =>
      create(
        <PluginServiceRuntimeContext.Provider value={runtime}>
          <PluginServiceConsumerContext.Provider
            value={{
              pluginId: "provider",
              instanceId: "provider-main",
              provides: ["test.secret"],
              inject: [],
              optionalInject: [],
            }}
          >
            <Probe />
          </PluginServiceConsumerContext.Provider>
        </PluginServiceRuntimeContext.Provider>,
      ),
    ).not.toThrow();

    expect(() =>
      create(
        <PluginServiceRuntimeContext.Provider value={runtime}>
          <Probe />
        </PluginServiceRuntimeContext.Provider>,
      ),
    ).not.toThrow();
  });

  it("emits a revision when a Provider disposes a Service outside reconcile", () => {
    let disposeService: (() => void) | undefined;
    const provider = createDefinition("provider", {
      provides: ["test.disposable"],
      setup: ({ services }) => {
        disposeService = services.provide("test.disposable", {});
      },
    });
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(
      createServiceModel(),
      createPluginRegistry([provider]),
      runtimeActions,
    );
    const revision = runtime.getRevision();

    disposeService?.();

    expect(runtime.get("test.disposable")).toBeUndefined();
    expect(runtime.getRevision()).toBe(revision + 1);
  });

  it("reactively enhances and restores an optional component fallback", () => {
    const provider = createDefinition("provider", {
      provides: ["test.optional"],
      setup: ({ services }) => {
        services.provide("test.optional", { enhanced: true });
      },
    });
    const registry = createPluginRegistry([provider]);
    const runtime = new PluginServiceRuntime();
    const providerModel = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "provider-main": {
          id: "provider-main",
          pluginId: "provider",
          enabled: true,
        },
      },
    });
    function Probe() {
      const service = usePluginService<{ enhanced: boolean }>("test.optional");
      return <span>{service?.enhanced === true ? "enhanced" : "fallback"}</span>;
    }
    const renderer = create(
      <PluginServiceRuntimeContext.Provider value={runtime}>
        <PluginServiceConsumerContext.Provider
          value={{
            pluginId: "consumer",
            instanceId: "consumer-main",
            provides: [],
            inject: [],
            optionalInject: ["test.optional"],
          }}
        >
          <Probe />
        </PluginServiceConsumerContext.Provider>
      </PluginServiceRuntimeContext.Provider>,
    );
    expect(renderer.toJSON()).toHaveProperty("children", ["fallback"]);

    act(() => {
      runtime.reconcile(providerModel, registry, runtimeActions);
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["enhanced"]);

    act(() => {
      const disabledProviderModel = structuredClone(providerModel);
      disabledProviderModel.pluginInstances["provider-main"]!.enabled = false;
      runtime.reconcile(disabledProviderModel, registry, runtimeActions);
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["fallback"]);
    renderer.unmount();
  });

  it("rejects duplicate service providers deterministically", () => {
    const first = createDefinition("first", {
      provides: ["test.shared"],
      setup: ({ services }) => {
        services.provide("test.shared", { owner: "first" });
      },
    });
    const second = createDefinition("second", {
      provides: ["test.shared"],
      setup: ({ services }) => {
        services.provide("test.shared", { owner: "second" });
      },
    });
    const model = parseAppUIModel({
      version: "2",
      root: {
        type: "slot",
        id: "duplicate-slot-node",
        slotId: "duplicate-slot",
      },
      pluginInstances: {
        "z-provider": {
          id: "z-provider",
          pluginId: "second",
          enabled: true,
        },
        "a-provider": {
          id: "a-provider",
          pluginId: "first",
          enabled: true,
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      model,
      createPluginRegistry([first, second]),
      runtimeActions,
    );

    expect(runtime.get<{ owner: string }>("test.shared")?.owner).toBe(
      "first",
    );
    expect(runtime.getActivation("a-provider")?.status).toBe("active");
    expect(runtime.getActivation("z-provider")).toEqual({
      status: "failed",
      errorMessage:
        'UI plugin service "test.shared" is already provided by instance "a-provider"',
    });
  });

  it("fails when a plugin calls provide for an undeclared service", () => {
    const provider = createDefinition("provider", {
      setup: ({ services }) => {
        services.provide("test.secret", {});
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(),
      createPluginRegistry([provider]),
      runtimeActions,
    );

    expect(runtime.getActivation("provider-main")).toEqual({
      status: "failed",
      errorMessage:
        'Plugin "provider" did not declare service "test.secret" in provides',
    });
    expect(runtime.get("test.secret")).toBeUndefined();
  });

  it("fails when declared services are not provided during activation", () => {
    const provider = createDefinition("provider", {
      provides: ["test.editor"],
      setup: vi.fn(),
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      createServiceModel(),
      createPluginRegistry([provider]),
      runtimeActions,
    );

    expect(runtime.getActivation("provider-main")).toEqual({
      status: "failed",
      errorMessage:
        'Plugin "provider" did not provide required service "test.editor" during activation',
    });
    expect(runtime.get("test.editor")).toBeUndefined();
  });

  it("updates snapshot consumers through service subscribe lifecycle", () => {
    interface TestSnapshot {
      value: number;
    }

    const listeners = new Set<() => void>();
    let snapshot: TestSnapshot = { value: 0 };

    const service: UIPluginObservableService<TestSnapshot> = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    function Counter({
      currentService,
    }: { currentService: UIPluginObservableService<TestSnapshot> | undefined }) {
      const current = usePluginServiceSnapshot(currentService, { value: -1 });
      return <span>{current.value}</span>;
    }

    const renderer = create(<Counter currentService={service} />);

    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);

    act(() => {
      snapshot = { value: 1 };
      listeners.forEach((listener) => listener());
    });

    expect(renderer.toJSON()).toHaveProperty("children", ["1"]);

    act(() => {
      snapshot = { value: 2 };
      listeners.forEach((listener) => listener());
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["2"]);

    renderer.unmount();
  });

  it("supports class-based observable services without losing this", () => {
    const EMPTY_SNAPSHOT = { value: 0 };
    class CounterService
      implements UIPluginObservableService<typeof EMPTY_SNAPSHOT>
    {
      private snapshot = EMPTY_SNAPSHOT;
      private readonly listeners = new Set<() => void>();

      getSnapshot() {
        return this.snapshot;
      }

      subscribe(listener: () => void) {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
      }

      increment() {
        this.snapshot = {
          value: this.snapshot.value + 1,
        };
        this.listeners.forEach((listener) => listener());
      }
    }

    const service = new CounterService();

    function Counter({
      service: pluginService,
    }: {
      service: CounterService | undefined;
    }) {
      const snapshot = usePluginServiceSnapshot(pluginService, EMPTY_SNAPSHOT);

      return <span>{snapshot.value}</span>;
    }

    const renderer = create(<Counter service={service} />);

    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);

    act(() => {
      service.increment();
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["1"]);

    act(() => {
      service.increment();
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["2"]);

    renderer.unmount();
  });

  it("unsubscribes class service listeners on unmount", () => {
    const EMPTY_SNAPSHOT = { value: 0 };
    class CounterService
      implements UIPluginObservableService<typeof EMPTY_SNAPSHOT>
    {
      private snapshot = EMPTY_SNAPSHOT;
      private readonly listeners = new Set<() => void>();

      getSnapshot() {
        return this.snapshot;
      }

      subscribe(listener: () => void) {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
      }

      get listenerCount() {
        return this.listeners.size;
      }
    }

    const service = new CounterService();

    function Counter({
      service: pluginService,
    }: {
      service: CounterService | undefined;
    }) {
      const snapshot = usePluginServiceSnapshot(pluginService, EMPTY_SNAPSHOT);

      return <span>{snapshot.value}</span>;
    }

    const renderer = create(<Counter service={service} />);

    expect(service.listenerCount).toBe(1);
    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);

    renderer.unmount();
    expect(service.listenerCount).toBe(0);
  });

  it("rebinds to a replacement observable service instance", () => {
    const EMPTY_SNAPSHOT = { value: 0 };
    class CounterService
      implements UIPluginObservableService<typeof EMPTY_SNAPSHOT>
    {
      private snapshot = EMPTY_SNAPSHOT;
      private readonly listeners = new Set<() => void>();

      getSnapshot() {
        return this.snapshot;
      }

      subscribe(listener: () => void) {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
      }

      increment() {
        this.snapshot = {
          value: this.snapshot.value + 1,
        };
        this.listeners.forEach((listener) => listener());
      }

      get listenerCount() {
        return this.listeners.size;
      }
    }

    const firstService = new CounterService();
    const secondService = new CounterService();

    function Counter({
      service: pluginService,
    }: {
      service: CounterService | undefined;
    }) {
      const snapshot = usePluginServiceSnapshot(pluginService, EMPTY_SNAPSHOT);

      return <span>{snapshot.value}</span>;
    }

    const renderer = create(<Counter service={firstService} />);

    expect(firstService.listenerCount).toBe(1);
    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);

    act(() => {
      firstService.increment();
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["1"]);

    act(() => {
      renderer.update(<Counter service={secondService} />);
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);
    expect(firstService.listenerCount).toBe(0);
    expect(secondService.listenerCount).toBe(1);

    act(() => {
      firstService.increment();
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["0"]);

    act(() => {
      secondService.increment();
    });
    expect(renderer.toJSON()).toHaveProperty("children", ["1"]);

    renderer.unmount();
    expect(secondService.listenerCount).toBe(0);
  });

  it("cleans provider and consumer lifetimes before a dependency disappears", () => {
    const providerCleanup = vi.fn();
    const consumerCleanup = vi.fn();
    let providerSequence = 0;
    const provider = createDefinition("provider", {
      provides: ["test.replaceable"],
      setup: ({ services }) => {
        const service = { sequence: ++providerSequence };
        services.provide("test.replaceable", service);
        return providerCleanup;
      },
    });
    const consumer = createDefinition("consumer", {
      inject: ["test.replaceable"],
      setup: () => consumerCleanup,
    });
    const registry = createPluginRegistry([provider, consumer]);
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(createServiceModel(), registry, runtimeActions);
    const firstService = runtime.get<{ sequence: number }>("test.replaceable");
    const firstActivation = runtime.getActivation("consumer-main");

    runtime.reconcile(createServiceModel(false), registry, runtimeActions);

    expect(providerCleanup).toHaveBeenCalledOnce();
    expect(consumerCleanup).toHaveBeenCalledOnce();
    expect(runtime.get("test.replaceable")).toBeUndefined();
    expect(runtime.getActivation("consumer-main")).toEqual({
      status: "pending",
      missingServices: ["test.replaceable"],
    });

    runtime.reconcile(createServiceModel(), registry, runtimeActions);
    const secondService = runtime.get<{ sequence: number }>("test.replaceable");
    const secondActivation = runtime.getActivation("consumer-main");

    expect(secondService).not.toBe(firstService);
    expect(secondService?.sequence).toBe(2);
    expect(firstActivation?.status).toBe("active");
    expect(secondActivation?.status).toBe("active");
    if (
      firstActivation?.status === "active" &&
      secondActivation?.status === "active"
    ) {
      expect(secondActivation.activationId).toBeGreaterThan(
        firstActivation.activationId,
      );
    }
  });

  it("keeps setup and services alive across Slot declaration lifetimes", () => {
    const service = { id: "stable-slot-service" };
    const setupCleanup = vi.fn();
    const setup = vi.fn(({ services }: UIPluginSetupContext) => {
      services.provide("test.slot-survival", service);
      return setupCleanup;
    });
    const visual = createDefinition("visual", {
      provides: ["test.slot-survival"],
      setup,
    });
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "test-slot-node", slotId: "test-slot" },
      pluginInstances: {
        "visual-main": {
          id: "visual-main",
          pluginId: "visual",
          enabled: true,
          mount: { slotId: "test-slot" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();
    const registry = createPluginRegistry([visual]);

    runtime.reconcile(model, registry, runtimeActions);
    const activation = runtime.getActivation("visual-main");

    expect(activation?.status).toBe("active");
    expect(setup).toHaveBeenCalledOnce();
    expect(runtime.get("test.slot-survival")).toBe(service);
    expect(runtime.slots.getContributions("test-slot")).toEqual([]);

    const disposeFirstDeclaration = runtime.slots.declare({
      slotId: "test-slot",
      owner: { kind: "layout", nodeId: "test-slot-node" },
    });

    expect(runtime.slots.getContributions("test-slot")).toEqual([
      { instanceId: "visual-main", slotId: "test-slot" },
    ]);
    expect(setup).toHaveBeenCalledOnce();
    expect(runtime.getActivation("visual-main")).toEqual(activation);

    disposeFirstDeclaration();

    expect(runtime.slots.getContributions("test-slot")).toEqual([]);
    expect(runtime.getActivation("visual-main")).toEqual(activation);
    expect(runtime.get("test.slot-survival")).toBe(service);
    expect(setupCleanup).not.toHaveBeenCalled();

    runtime.slots.declare({
      slotId: "test-slot",
      owner: { kind: "layout", nodeId: "replacement-test-slot-node" },
    });

    expect(runtime.slots.getContributions("test-slot")).toEqual([
      { instanceId: "visual-main", slotId: "test-slot" },
    ]);
    expect(setup).toHaveBeenCalledOnce();
    expect(runtime.get("test.slot-survival")).toBe(service);
    expect(runtime.getActivation("visual-main")).toEqual(activation);

    const disabled = structuredClone(model);
    disabled.pluginInstances["visual-main"]!.enabled = false;
    runtime.reconcile(disabled, registry, runtimeActions);

    expect(setupCleanup).toHaveBeenCalledOnce();
    expect(runtime.get("test.slot-survival")).toBeUndefined();
    expect(runtime.slots.getContributions("test-slot")).toEqual([]);
  });

  it("binds a mount contribution to Plugin activation and Slot declaration", () => {
    const runtime = new PluginServiceRuntime();
    const registry = createPluginRegistry([createDefinition("consumer")]);
    const mounted = createServiceModel();
    delete mounted.pluginInstances["provider-main"];

    runtime.reconcile(mounted, registry, runtimeActions);
    const activation = runtime.getActivation("consumer-main");
    expect(activation?.status).toBe("active");
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);

    const disposeDeclaration = runtime.slots.declare({
      slotId: "services-slot",
      owner: { kind: "layout", nodeId: "services-slot-node" },
    });
    expect(runtime.slots.getContributions("services-slot")).toEqual([
      { instanceId: "consumer-main", slotId: "services-slot" },
    ]);

    disposeDeclaration();
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);
    expect(runtime.getActivation("consumer-main")).toEqual(activation);

    const disposeReplacementDeclaration = runtime.slots.declare({
      slotId: "services-slot",
      owner: { kind: "layout", nodeId: "replacement-services-slot-node" },
    });
    expect(runtime.slots.getContributions("services-slot")).toEqual([
      { instanceId: "consumer-main", slotId: "services-slot" },
    ]);
    expect(runtime.getActivation("consumer-main")).toEqual(activation);

    const disabled = structuredClone(mounted);
    disabled.pluginInstances["consumer-main"]!.enabled = false;
    runtime.reconcile(disabled, registry, runtimeActions);
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);

    disposeReplacementDeclaration();
    runtime.slots.declare({
      slotId: "services-slot",
      owner: { kind: "layout", nodeId: "third-services-slot-node" },
    });
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);

    const removed = structuredClone(mounted);
    delete removed.pluginInstances["consumer-main"];
    runtime.reconcile(mounted, registry, runtimeActions);
    expect(runtime.slots.getContributions("services-slot")).toHaveLength(1);
    runtime.reconcile(removed, registry, runtimeActions);
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);

    runtime.reconcile(mounted, registry, runtimeActions);
    runtime.dispose();
    expect(runtime.slots.getContributions("services-slot")).toEqual([]);
  });

  it("binds child declarations to their owner contribution lifetime", () => {
    const setupCleanup = vi.fn();
    const setup = vi.fn(() => setupCleanup);
    const owner = createDefinition("owner", { setup }, ["owner.child"]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "owner-main": {
          id: "owner-main",
          pluginId: "owner",
          enabled: true,
          mount: { slotId: "root" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      model,
      createPluginRegistry([owner]),
      runtimeActions,
    );
    const activation = runtime.getActivation("owner-main");

    expect(activation?.status).toBe("active");
    expect(setup).toHaveBeenCalledOnce();
    expect(runtime.slots.getContributions("root")).toEqual([]);
    expect(runtime.slots.getDeclaration("owner.child")).toBeUndefined();

    const disposeRoot = runtime.slots.declare({
      slotId: "root",
      owner: { kind: "layout", nodeId: "root-node" },
    });

    expect(runtime.slots.getContributions("root")).toEqual([
      { instanceId: "owner-main", slotId: "root" },
    ]);
    expect(runtime.slots.getDeclaration("owner.child")).toEqual({
      slotId: "owner.child",
      owner: { kind: "plugin", instanceId: "owner-main" },
    });

    disposeRoot();

    expect(runtime.slots.getContributions("root")).toEqual([]);
    expect(runtime.slots.getDeclaration("owner.child")).toBeUndefined();
    expect(runtime.getActivation("owner-main")).toEqual(activation);
    expect(setup).toHaveBeenCalledOnce();
    expect(setupCleanup).not.toHaveBeenCalled();

    runtime.slots.declare({
      slotId: "root",
      owner: { kind: "layout", nodeId: "replacement-root-node" },
    });

    expect(runtime.slots.getContributions("root")).toEqual([
      { instanceId: "owner-main", slotId: "root" },
    ]);
    expect(runtime.slots.getDeclaration("owner.child")).toEqual({
      slotId: "owner.child",
      owner: { kind: "plugin", instanceId: "owner-main" },
    });
    expect(runtime.getActivation("owner-main")).toEqual(activation);
    expect(setup).toHaveBeenCalledOnce();
  });

  it("composes child mounts independently of activation order and Slot lifetime", () => {
    const ownerService = { id: "stable-owner-service" };
    const consumerService = { id: "stable-consumer-service" };
    const ownerSetup = vi.fn(({ services }: UIPluginSetupContext) => {
      services.provide("test.owner-lifetime", ownerService);
    });
    const consumerSetup = vi.fn(({ services }: UIPluginSetupContext) => {
      services.provide("test.consumer-lifetime", consumerService);
    });
    const owner = createDefinition(
      "owner",
      { provides: ["test.owner-lifetime"], setup: ownerSetup },
      ["owner.child"],
    );
    const consumer = createDefinition("consumer", {
      provides: ["test.consumer-lifetime"],
      setup: consumerSetup,
    });
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "a-consumer": {
          id: "a-consumer",
          pluginId: "consumer",
          enabled: true,
          mount: { slotId: "owner.child" },
        },
        "z-owner": {
          id: "z-owner",
          pluginId: "owner",
          enabled: true,
          mount: { slotId: "root" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      model,
      createPluginRegistry([consumer, owner]),
      runtimeActions,
    );
    const ownerActivation = runtime.getActivation("z-owner");
    const consumerActivation = runtime.getActivation("a-consumer");

    expect(ownerActivation?.status).toBe("active");
    expect(consumerActivation?.status).toBe("active");
    expect(runtime.slots.getContributions("root")).toEqual([]);
    expect(runtime.slots.getDeclaration("owner.child")).toBeUndefined();
    expect(runtime.slots.getContributions("owner.child")).toEqual([]);

    const disposeRoot = runtime.slots.declare({
      slotId: "root",
      owner: { kind: "layout", nodeId: "root-node" },
    });

    expect(runtime.slots.getContributions("root")).toEqual([
      { instanceId: "z-owner", slotId: "root" },
    ]);
    expect(runtime.slots.getContributions("owner.child")).toEqual([
      { instanceId: "a-consumer", slotId: "owner.child" },
    ]);

    disposeRoot();

    expect(runtime.slots.getContributions("root")).toEqual([]);
    expect(runtime.slots.getDeclaration("owner.child")).toBeUndefined();
    expect(runtime.slots.getContributions("owner.child")).toEqual([]);
    expect(runtime.getActivation("z-owner")).toEqual(ownerActivation);
    expect(runtime.getActivation("a-consumer")).toEqual(consumerActivation);
    expect(runtime.get("test.owner-lifetime")).toBe(ownerService);
    expect(runtime.get("test.consumer-lifetime")).toBe(consumerService);
    expect(ownerSetup).toHaveBeenCalledOnce();
    expect(consumerSetup).toHaveBeenCalledOnce();

    runtime.slots.declare({
      slotId: "root",
      owner: { kind: "layout", nodeId: "replacement-root-node" },
    });

    expect(runtime.slots.getContributions("root")).toEqual([
      { instanceId: "z-owner", slotId: "root" },
    ]);
    expect(runtime.slots.getContributions("owner.child")).toEqual([
      { instanceId: "a-consumer", slotId: "owner.child" },
    ]);
    expect(runtime.getActivation("z-owner")).toEqual(ownerActivation);
    expect(runtime.getActivation("a-consumer")).toEqual(consumerActivation);
    expect(ownerSetup).toHaveBeenCalledOnce();
    expect(consumerSetup).toHaveBeenCalledOnce();
  });

  it("declares and removes every child Slot as one contribution lifetime", () => {
    const owner = createDefinition("owner", {}, [
      "owner.header",
      "owner.body",
      "owner.footer",
    ]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "owner-main": {
          id: "owner-main",
          pluginId: "owner",
          enabled: true,
          mount: { slotId: "root" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(model, createPluginRegistry([owner]), runtimeActions);
    const disposeRoot = runtime.slots.declare({
      slotId: "root",
      owner: { kind: "layout", nodeId: "root-node" },
    });

    for (const slotId of ["owner.header", "owner.body", "owner.footer"]) {
      expect(runtime.slots.getDeclaration(slotId)).toEqual({
        slotId,
        owner: { kind: "plugin", instanceId: "owner-main" },
      });
    }

    disposeRoot();

    for (const slotId of ["owner.header", "owner.body", "owner.footer"]) {
      expect(runtime.slots.getDeclaration(slotId)).toBeUndefined();
    }
  });

  it("rolls back the contribution and all new child declarations on collision", () => {
    const owner = createDefinition("owner", {}, [
      "owner.header",
      "owner.body",
      "owner.footer",
    ]);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "owner-main": {
          id: "owner-main",
          pluginId: "owner",
          enabled: true,
          mount: { slotId: "root" },
        },
      },
    });
    const runtime = new PluginServiceRuntime();
    const existingBody = {
      slotId: "owner.body",
      owner: { kind: "layout" as const, nodeId: "existing-body-node" },
    };
    runtime.slots.declare(existingBody);
    runtime.reconcile(model, createPluginRegistry([owner]), runtimeActions);

    expect(() =>
      runtime.slots.declare({
        slotId: "root",
        owner: { kind: "layout", nodeId: "root-node" },
      }),
    ).toThrow('Slot "owner.body" already has a live declaration');

    expect(runtime.slots.getContributions("root")).toEqual([]);
    expect(runtime.slots.getDeclaration("owner.header")).toBeUndefined();
    expect(runtime.slots.getDeclaration("owner.footer")).toBeUndefined();
    expect(runtime.slots.getDeclaration("owner.body")).toEqual(existingBody);
    expect(runtime.getActivation("owner-main")?.status).toBe("active");
  });

  it("orders multiple contributions by order and then instanceId", () => {
    const runtime = new PluginServiceRuntime();
    const definition = createDefinition("visual");
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "list-node", slotId: "list" },
      pluginInstances: {
        "z-last": { id: "z-last", pluginId: "visual", enabled: true, mount: { slotId: "list", order: 5 } },
        "b-second": { id: "b-second", pluginId: "visual", enabled: true, mount: { slotId: "list", order: 1 } },
        "a-first": { id: "a-first", pluginId: "visual", enabled: true, mount: { slotId: "list", order: 1 } },
      },
    });
    runtime.slots.declare({
      slotId: "list",
      owner: { kind: "layout", nodeId: "list-node" },
    });

    runtime.reconcile(model, createPluginRegistry([definition]), runtimeActions);

    expect(
      runtime.slots.getContributions("list").map(({ instanceId }) => instanceId),
    ).toEqual(["a-first", "b-second", "z-last"]);
  });

  it("activates a headless Plugin without an ordinary mount", () => {
    const headless = createDefinition("headless", { setup: () => undefined });
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "unused-node", slotId: "unused" },
      pluginInstances: {
        background: {
          id: "background",
          pluginId: "headless",
          enabled: true,
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(model, createPluginRegistry([headless]), runtimeActions);

    expect(runtime.getActivation("background")?.status).toBe("active");
    expect(runtime.slots.getContributions("unused")).toEqual([]);
  });
});

describe("AgentUIThemeService", () => {
  it("exposes callable theme functions and notifies subscribers", () => {
    const onModeChange = vi.fn();
    const subscriber = vi.fn();
    const theme = createAgentUIThemeService("dark", onModeChange);
    const unsubscribe = theme.subscribe(subscriber);

    theme.setMode("light");
    theme.toggle();
    unsubscribe();
    theme.setMode("light");

    expect(onModeChange.mock.calls).toEqual([["light"], ["dark"], ["light"]]);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(theme.getMode()).toBe("light");
  });
});
