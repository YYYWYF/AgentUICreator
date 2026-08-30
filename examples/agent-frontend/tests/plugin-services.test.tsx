import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  createAgentUIThemeService,
} from "../plugins/antd-x-theme-provider/theme-service";
import {
  createPluginRegistry,
  PluginServiceRuntime,
} from "../runtime/plugins";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
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
    },
    ...definition,
    Component: () => null,
  };
}

function createServiceModel(providerEnabled = true) {
  return parseAppUIModel({
    version: "1",
    root: {
      type: "slot",
      id: "services-slot-node",
      slotId: "services-slot",
      pluginInstanceIds: ["consumer-main"],
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
      version: "1",
      root: {
        type: "slot",
        id: "duplicate-slot-node",
        slotId: "duplicate-slot",
        pluginInstanceIds: ["z-provider", "a-provider"],
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
