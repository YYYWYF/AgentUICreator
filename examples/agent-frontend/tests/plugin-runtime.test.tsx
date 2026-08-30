import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginContext,
  UIPluginDefinition,
  UIPluginRunState,
} from "../framework/contracts/ui-plugin";
import {
  antdXTemplatePlugins,
  antdXWelcomePlugin,
  pluginDefinitions,
} from "../plugins";
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
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

const idleRun: UIPluginRunState = {
  status: "idle",
  errorMessage: undefined,
};

describe("StaticPluginRegistry", () => {
  it("registers and lists statically imported plugin definitions", () => {
    const registry = createPluginRegistry(pluginDefinitions);

    expect(registry.get("antd-x-welcome")).toBe(antdXWelcomePlugin);
    expect(registry.list()).toEqual([...pluginDefinitions]);
  });

  it("rejects duplicate plugin ids", () => {
    const registry = new StaticPluginRegistry([antdXWelcomePlugin]);

    expect(() => registry.register(antdXWelcomePlugin)).toThrow(
      'UI plugin "antd-x-welcome" is already registered',
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
  it("assembles the Ant Design X template plugins through AppUIModel slots", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        run={idleRun}
        state={previewAgentState}
      />,
    );

    const welcomePosition = html.indexOf('data-ui-plugin="antd-x-welcome"');
    const messagesPosition = html.indexOf(
      'data-ui-plugin="antd-x-message-list"',
    );
    const promptsPosition = html.indexOf('data-ui-plugin="antd-x-prompts"');
    const senderPosition = html.indexOf('data-ui-plugin="antd-x-sender"');

    expect(welcomePosition).toBeGreaterThan(-1);
    expect(messagesPosition).toBeGreaterThan(welcomePosition);
    expect(promptsPosition).toBeGreaterThan(messagesPosition);
    expect(senderPosition).toBeGreaterThan(promptsPosition);
    expect(html).toContain("Agent Frontend");
    expect(html).toContain("Ant Design X 模板插件");
    expect(html).toContain("总结当前上下文");
    expect(html).toContain("给智能体发送消息，Enter 发送");
  });

  it("does not render disabled plugin instances", () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "agent-prompts-main": {
          ...appUIJson.pluginInstances["agent-prompts-main"],
          enabled: false,
        },
      },
    });
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        run={idleRun}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('data-ui-plugin="antd-x-message-list"');
    expect(html).not.toContain('data-ui-plugin="antd-x-prompts"');
  });

  it("honors Sender instance props", () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "agent-sender-main": {
          ...appUIJson.pluginInstances["agent-sender-main"],
          props: { placeholder: "输入一条自定义消息" },
        },
      },
    });
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        run={idleRun}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).toContain("输入一条自定义消息");
  });

  it("renders the shared Agent run state through the template plugins", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const running: UIPluginRunState = {
      status: "running",
      errorMessage: undefined,
    };

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        run={running}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('data-agent-run-status="running"');
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain("运行中");
  });

  it("binds run state and instance-aware actions into UIPluginContext", async () => {
    let capturedContext: UIPluginContext | undefined;
    const probePlugin: UIPluginDefinition = {
      manifest: {
        id: "probe",
        name: "Probe",
        description: "Captures runtime context for testing",
        version: "1.0.0",
      },
      Component: ({ context }) => {
        capturedContext = context;
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
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };
    const failedRun: UIPluginRunState = {
      status: "error",
      errorMessage: "Agent endpoint is unavailable",
    };

    renderToStaticMarkup(
      <UIPluginRuntime
        actions={actions}
        messages={[]}
        model={model}
        registry={createPluginRegistry([probePlugin])}
        run={failedRun}
        state={null}
      />,
    );

    if (capturedContext === undefined) {
      throw new Error("Plugin context was not injected");
    }

    expect(capturedContext.run).toBe(failedRun);
    await capturedContext.actions.sendMessage("hello");
    capturedContext.actions.abortRun();
    capturedContext.actions.updateInstanceProps({ compact: true });

    expect(actions.sendMessage).toHaveBeenCalledWith("hello");
    expect(actions.abortRun).toHaveBeenCalledOnce();
    expect(actions.updateInstanceProps).toHaveBeenCalledWith("probe-main", {
      compact: true,
    });
  });

  it("surfaces a deterministic error for an unregistered plugin", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins.slice(0, 3));

    const html = renderToStaticMarkup(
      <UIPluginRuntime
        actions={runtimeActions}
        messages={initialPreviewMessages}
        model={model}
        registry={registry}
        run={idleRun}
        state={previewAgentState}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'UI plugin &quot;antd-x-sender&quot; is not registered.',
    );
  });
});
