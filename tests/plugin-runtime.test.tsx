import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginActions,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { chatPlugin, filePreviewPlugin } from "../plugins";
import {
  createPluginRegistry,
  StaticPluginRegistry,
  UIPluginRuntime,
} from "../runtime/plugins";
import {
  initialPreviewMessages,
  previewAgentState,
} from "../src/preview-data";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  updateInstanceProps: vi.fn(),
};

describe("StaticPluginRegistry", () => {
  it("registers and lists statically imported plugin definitions", () => {
    const registry = createPluginRegistry([chatPlugin, filePreviewPlugin]);

    expect(registry.get("chat")).toBe(chatPlugin);
    expect(registry.get("file-preview")).toBe(filePreviewPlugin);
    expect(registry.list()).toEqual([chatPlugin, filePreviewPlugin]);
  });

  it("rejects duplicate plugin ids", () => {
    const registry = new StaticPluginRegistry([chatPlugin]);

    expect(() => registry.register(chatPlugin)).toThrow(
      'UI plugin "chat" is already registered',
    );
  });

  it("validates manifests during registration", () => {
    const invalidPlugin: UIPluginDefinition = {
      manifest: {
        id: "",
        name: "Invalid",
        description: "Invalid manifest fixture",
        version: "1.0.0",
      },
      Component: () => null,
    };

    expect(() => new StaticPluginRegistry([invalidPlugin])).toThrow();
  });
});

describe("UIPluginRuntime", () => {
  it("renders Chat and File Preview into their AppUIModel slots", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry([chatPlugin, filePreviewPlugin]);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        state={previewAgentState}
      />,
    );

    const chatSlotPosition = html.indexOf('data-slot-id="chat"');
    const chatPluginPosition = html.indexOf('data-ui-plugin="chat"');
    const fileSlotPosition = html.indexOf('data-slot-id="file-preview"');
    const filePluginPosition = html.indexOf('data-ui-plugin="file-preview"');

    expect(chatSlotPosition).toBeGreaterThan(-1);
    expect(chatPluginPosition).toBeGreaterThan(chatSlotPosition);
    expect(fileSlotPosition).toBeGreaterThan(chatPluginPosition);
    expect(filePluginPosition).toBeGreaterThan(fileSlotPosition);
    expect(html).toContain("The Plugin Runtime is ready.");
    expect(html).toContain("src/App.tsx");
  });

  it("does not render disabled plugin instances", () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "file-preview-right": {
          ...appUIJson.pluginInstances["file-preview-right"],
          enabled: false,
        },
      },
    });
    const registry = createPluginRegistry([chatPlugin, filePreviewPlugin]);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('data-ui-plugin="chat"');
    expect(html).not.toContain('data-ui-plugin="file-preview"');
  });

  it("honors File Preview instance props", () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "file-preview-right": {
          ...appUIJson.pluginInstances["file-preview-right"],
          props: { showHeader: false },
        },
      },
    });
    const registry = createPluginRegistry([chatPlugin, filePreviewPlugin]);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('data-show-header="false"');
    expect(html).not.toContain("file-preview-plugin-header");
    expect(html).toContain("UIPluginRuntime");
  });

  it("binds instance-aware actions into UIPluginContext", async () => {
    let capturedActions: UIPluginActions | undefined;
    const probePlugin: UIPluginDefinition = {
      manifest: {
        id: "probe",
        name: "Probe",
        description: "Captures runtime context for testing",
        version: "1.0.0",
      },
      Component: ({ context }) => {
        capturedActions = context.actions;
        return <div>Probe</div>;
      },
    };
    const model = parseAppUIModel({
      version: "1",
      root: {
        type: "slot",
        id: "probe-slot-node",
        slotId: "probe-slot",
        pluginInstanceIds: ["probe-main"],
      },
      pluginInstances: {
        "probe-main": {
          id: "probe-main",
          pluginId: "probe",
          enabled: true,
        },
      },
    });
    const actions = {
      sendMessage: vi.fn(async () => undefined),
      updateInstanceProps: vi.fn(),
    };

    renderToStaticMarkup(
      <UIPluginRuntime
        actions={actions}
        messages={[]}
        model={model}
        registry={createPluginRegistry([probePlugin])}
        state={null}
      />,
    );

    if (capturedActions === undefined) {
      throw new Error("Plugin context actions were not injected");
    }

    await capturedActions.sendMessage("hello");
    capturedActions.updateInstanceProps({ compact: true });

    expect(actions.sendMessage).toHaveBeenCalledWith("hello");
    expect(actions.updateInstanceProps).toHaveBeenCalledWith("probe-main", {
      compact: true,
    });
  });

  it("surfaces a deterministic error for an unregistered plugin", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry([chatPlugin]);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'UI plugin &quot;file-preview&quot; is not registered.',
    );
  });
});
