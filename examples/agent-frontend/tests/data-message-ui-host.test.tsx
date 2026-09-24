import { defineDataMessageUI } from "@agent-ui/react";
import { describe, expect, it, vi } from "vitest";

import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { createPluginCompositionCatalog, createPluginRegistry } from "../runtime/plugins/PluginRegistry";
import { PluginServiceRuntime } from "../runtime/plugins/PluginServiceRuntime";
import { resolveDataMessageUIRegistrations } from "../runtime/plugins/PluginDataMessageUIHost";

const actions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

function definition(pluginId: string, name = "chart"): UIPluginDefinition {
  return {
    manifest: {
      id: pluginId,
      name: pluginId,
      description: "Data Message UI test plugin",
      version: "1.0.0",
      data: { messageUI: true },
    },
    dataMessageUIs: [defineDataMessageUI<{ value: number }>({
      name,
      render: ({ data }) => <span>{data.value}</span>,
    })],
    Component: () => null,
  };
}

function runtimeModel(instances: Record<string, { pluginId: string; enabled: boolean }>) {
  return parseAppUIRuntimeModel({
    root: { type: "slot", id: "root", slotId: "root-slot" },
    pluginInstances: Object.fromEntries(Object.entries(instances).map(([id, instance]) => [
      id,
      { id, ...instance },
    ])),
  });
}

describe("Data Message UI plugin activation", () => {
  it("compiles and activates an application plugin without a Layout mount", () => {
    const registry = createPluginRegistry([definition("chart-message")]);
    const model = compileAppUIModel({
      applicationPlugins: [{ id: "chart-main", pluginId: "chart-message", enabled: true }],
      root: { type: "slot", plugins: [] },
    }, createPluginCompositionCatalog(registry));
    expect(model.pluginInstances["chart-main"]?.mount).toBeUndefined();

    const runtime = new PluginServiceRuntime();
    runtime.reconcile(model, registry, actions);
    expect(runtime.getActivation("chart-main")?.status).toBe("active");
    expect(resolveDataMessageUIRegistrations(model, registry, runtime)).toHaveLength(1);
  });

  it("drops registrations when an instance is disabled or removed", () => {
    const registry = createPluginRegistry([definition("chart-message")]);
    const runtime = new PluginServiceRuntime();
    const enabled = runtimeModel({ "chart-main": { pluginId: "chart-message", enabled: true } });
    runtime.reconcile(enabled, registry, actions);
    expect(resolveDataMessageUIRegistrations(enabled, registry, runtime)).toHaveLength(1);

    const disabled = runtimeModel({ "chart-main": { pluginId: "chart-message", enabled: false } });
    runtime.reconcile(disabled, registry, actions);
    expect(resolveDataMessageUIRegistrations(disabled, registry, runtime)).toHaveLength(0);

    runtime.reconcile(enabled, registry, actions);
    const removed = runtimeModel({});
    runtime.reconcile(removed, registry, actions);
    expect(resolveDataMessageUIRegistrations(removed, registry, runtime)).toHaveLength(0);
  });

  it("reports duplicate active names with both plugin and instance identities", () => {
    const registry = createPluginRegistry([definition("first"), definition("second")]);
    const model = runtimeModel({
      "first-main": { pluginId: "first", enabled: true },
      "second-main": { pluginId: "second", enabled: true },
    });
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(model, registry, actions);
    expect(() => resolveDataMessageUIRegistrations(model, registry, runtime)).toThrow(
      /DATA_MESSAGE_UI_NAME_CONFLICT:.*chart.*second.*second-main.*first.*first-main/u,
    );
  });

  it("rejects blank or padded names", () => {
    for (const name of ["", " chart "]) {
      const registry = createPluginRegistry([definition("invalid", name)]);
      const model = runtimeModel({ main: { pluginId: "invalid", enabled: true } });
      const runtime = new PluginServiceRuntime();
      runtime.reconcile(model, registry, actions);
      expect(() => resolveDataMessageUIRegistrations(model, registry, runtime)).toThrow(
        /DATA_MESSAGE_UI_INVALID_NAME/u,
      );
    }
  });
});
