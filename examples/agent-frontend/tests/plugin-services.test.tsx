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
    slots: {
      "services-slot": {
        id: "services-slot",
        kind: "single",
        scope: "root",
        description: "Service consumer fixture",
        owner: { type: "layout", nodeId: "services-slot-node" },
        occupants: [{ instanceId: "consumer-main" }],
      },
    },
    pluginInstances: {
      // Deliberately list the consumer first: dependency resolution must not
      // depend on AppUIModel object order or layout order.
      "consumer-main": {
        id: "consumer-main",
        pluginId: "consumer",
        enabled: true,
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
  it("does not activate visual descendants beneath a disabled Slot owner", () => {
    const owner = createDefinition("owner");
    const child = createDefinition("child");
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root-slot" },
      slots: {
        "root-slot": {
          id: "root-slot",
          kind: "single",
          scope: "root",
          description: "Disabled owner fixture",
          owner: { type: "layout", nodeId: "root-node" },
          occupants: [{ instanceId: "owner-main" }],
        },
        "owner.child": {
          id: "owner.child",
          kind: "single",
          scope: "thread-maybe",
          description: "Nested child fixture",
          owner: {
            type: "plugin-instance",
            instanceId: "owner-main",
            outlet: "child",
          },
          occupants: [{ instanceId: "child-main" }],
        },
      },
      pluginInstances: {
        "owner-main": {
          id: "owner-main",
          pluginId: "owner",
          enabled: false,
        },
        "child-main": {
          id: "child-main",
          pluginId: "child",
          enabled: true,
        },
      },
    });
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(
      model,
      createPluginRegistry([owner, child]),
      runtimeActions,
    );

    expect(runtime.getActivation("owner-main")).toBeUndefined();
    expect(runtime.getActivation("child-main")).toBeUndefined();
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
      slots: {
        "messages-slot": {
          id: "messages-slot",
          kind: "single",
          scope: "root",
          description: "Messages fixture",
          owner: { type: "layout", nodeId: "messages-slot-node" },
          occupants: [{ instanceId: "messages-main" }],
        },
        "timeline-slot": {
          id: "timeline-slot",
          kind: "single",
          scope: "root",
          description: "Timeline fixture",
          owner: { type: "layout", nodeId: "timeline-slot-node" },
          occupants: [{ instanceId: "timeline-main" }],
        },
      },
      pluginInstances: {
        "messages-main": {
          id: "messages-main",
          pluginId: "antd-x-message-list",
          enabled: true,
        },
        "timeline-main": {
          id: "timeline-main",
          pluginId: "antd-x-run-timeline",
          enabled: true,
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
      slots: {
        "duplicate-slot": {
          id: "duplicate-slot",
          kind: "list",
          scope: "root",
          description: "Duplicate service provider fixtures",
          owner: { type: "layout", nodeId: "duplicate-slot-node" },
          occupants: [
            { id: "z-provider", instanceId: "z-provider" },
            { id: "a-provider", instanceId: "a-provider" },
          ],
        },
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
