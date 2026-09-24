import { defineDataMessageUI } from "@agent-ui/react";
import { describe, expect, it, vi } from "vitest";

import { AppUICompilerError, compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { buildRuntimeComposition, createPluginCapabilityCatalog } from "../runtime/composition";
import { createPluginCompositionCatalog, createPluginRegistry } from "../runtime/plugins/PluginRegistry";
import { PluginServiceRuntime } from "../runtime/plugins/PluginServiceRuntime";
import { resolveDataMessageUIRegistrations } from "../runtime/plugins/data-message-ui-registrations";

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

function buildWithNames(
  names: Record<string, string>,
  instances: Record<string, { pluginId: string; enabled: boolean }>,
) {
  const definitions = Object.entries(names).map(([pluginId, name]) => definition(pluginId, name));
  const capabilityCatalog = createPluginCapabilityCatalog(definitions.map((plugin) => ({
    manifest: plugin.manifest,
    provides: [],
    inject: [],
    optionalInject: [],
    loadDefinition: async () => plugin,
  })));
  return buildRuntimeComposition({
    appUIModelSource: JSON.stringify({
      applicationPlugins: Object.entries(instances).map(([id, instance]) => ({ id, ...instance })),
      root: { type: "slot", plugins: [] },
    }),
    capabilityCatalog,
    capabilityCatalogRevision: "a".repeat(64),
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

  it("rejects a Data Message UI in a Layout Slot at the Compiler boundary", () => {
    const registry = createPluginRegistry([definition("chart-message")]);
    try {
      compileAppUIModel({
        root: { type: "slot", plugins: [
          { id: "chart-main", pluginId: "chart-message", enabled: true },
        ] },
      }, createPluginCompositionCatalog(registry));
      throw new Error("Expected a Compiler placement error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppUICompilerError);
      expect((error as AppUICompilerError).issues).toContainEqual(expect.objectContaining({
        code: "data-message-ui-must-be-application",
        instanceId: "chart-main",
      }));
    }
  });

  it("rejects a Data Message UI in a plugin child Slot at the Compiler boundary", () => {
    const parent: UIPluginDefinition = {
      manifest: {
        id: "parent", name: "parent", description: "Fixture", version: "1.0.0",
        slots: { children: { content: {
          description: "Content", cardinality: "many", optional: true,
        } } },
      },
      Component: () => null,
    };
    const registry = createPluginRegistry([parent, definition("chart-message")]);
    try {
      compileAppUIModel({
        root: { type: "slot", plugins: [{
          id: "parent-main", pluginId: "parent", enabled: true,
          slots: { content: [
            { id: "chart-main", pluginId: "chart-message", enabled: true },
          ] },
        }] },
      }, createPluginCompositionCatalog(registry));
      throw new Error("Expected a Compiler placement error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppUICompilerError);
      expect((error as AppUICompilerError).issues).toContainEqual(expect.objectContaining({
        code: "data-message-ui-must-be-application",
        instanceId: "chart-main",
      }));
    }
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

  it("rejects invalid names while building composition", async () => {
    for (const name of ["", " chart "]) {
      await expect(buildWithNames(
        { invalid: name },
        { main: { pluginId: "invalid", enabled: true } },
      )).rejects.toMatchObject({ code: "DATA_MESSAGE_UI_INVALID_NAME" });
    }
  });

  it("rejects enabled name conflicts before composition can publish", async () => {
    const names = { first: "chart", second: "chart" };
    const first = { pluginId: "first", enabled: true };
    await expect(buildWithNames(names, {
      "first-main": first,
      "second-main": { pluginId: "second", enabled: true },
    })).rejects.toMatchObject({ code: "DATA_MESSAGE_UI_NAME_CONFLICT" });

    await expect(buildWithNames(names, {
      "first-main": first,
      "second-main": { pluginId: "second", enabled: false },
    })).resolves.toMatchObject({
      runtimeModel: { pluginInstances: {
        "second-main": { enabled: false },
      } },
    });

    await expect(buildWithNames(names, {
      "first-main": first,
      "second-main": { pluginId: "second", enabled: true },
    })).rejects.toMatchObject({ code: "DATA_MESSAGE_UI_NAME_CONFLICT" });
  });
});
