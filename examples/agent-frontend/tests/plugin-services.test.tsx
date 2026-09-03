import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  createAgentUIThemeService,
} from "../plugins/antd-x-theme-provider/theme-service";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { antdXRunTimelinePlugin } from "../plugins/antd-x-run-timeline/definition";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  SlotRegistry,
} from "../runtime/plugins";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function createDefinition(
  id: string,
  definition: Pick<UIPluginDefinition, "inject" | "setup"> = {},
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} test plugin`,
      version: "1.0.0",
      ...(definition.setup === undefined ? {} : { capabilities: ["headless"] }),
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
  it("rejects multiple ordinary contributions from the same instance", () => {
    const slots = new SlotRegistry();
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

  it("activates conversation-aware displays without an optional provider", () => {
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

  it("rejects duplicate service providers deterministically", () => {
    const first = createDefinition("first", {
      setup: ({ services }) => {
        services.provide("test.shared", { owner: "first" });
      },
    });
    const second = createDefinition("second", {
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

  it("cleans provider and consumer lifetimes before a dependency disappears", () => {
    const providerCleanup = vi.fn();
    const consumerCleanup = vi.fn();
    let providerSequence = 0;
    const provider = createDefinition("provider", {
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

  it("registers and removes Slot contributions with Plugin activation", () => {
    const runtime = new PluginServiceRuntime();
    const registry = createPluginRegistry([createDefinition("consumer")]);
    const mounted = createServiceModel();
    delete mounted.pluginInstances["provider-main"];

    runtime.reconcile(mounted, registry, runtimeActions);
    expect(runtime.slots.getContributions("services-slot")).toEqual([
      { instanceId: "consumer-main", slotId: "services-slot" },
    ]);

    const disabled = structuredClone(mounted);
    disabled.pluginInstances["consumer-main"]!.enabled = false;
    runtime.reconcile(disabled, registry, runtimeActions);
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
