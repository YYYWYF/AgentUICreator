import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginContext,
  UIPluginDefinition,
  UIPluginRunState,
} from "../framework/contracts/ui-plugin";
import { pluginDefinitions } from "../plugins";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import {
  antdXTemplatePlugins,
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  antdXNewConversationPlugin,
  antdXReasoningPlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  antdXSourcesPlugin,
  antdXToolDetailPlugin,
  antdXWelcomePlugin,
} from "../plugins/antd-x-template-library";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  StaticPluginRegistry,
  UIPluginRuntime,
  type UIPluginRuntimeProps,
} from "../runtime/plugins";
import {
  initialPreviewMessages,
  previewAgentState,
} from "../src/preview-data";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

const idleRun: UIPluginRunState = {
  status: "idle",
  errorMessage: undefined,
};

function renderPluginRuntime(props: UIPluginRuntimeProps): string {
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(props.model, props.registry, props.actions);

  try {
    return renderToStaticMarkup(
      <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
        <UIPluginRuntime {...props} />
      </PluginServiceRuntimeContext.Provider>,
    );
  } finally {
    serviceRuntime.dispose();
  }
}

describe("StaticPluginRegistry", () => {
  it("registers and lists statically imported plugin definitions", () => {
    const registry = createPluginRegistry(pluginDefinitions);

    expect(registry.get("antd-x-welcome")).toBe(antdXWelcomePlugin);
    expect(registry.get("antd-x-new-conversation")).toBe(
      antdXNewConversationPlugin,
    );
    expect(registry.get("antd-x-conversations")).toBe(
      antdXConversationsPlugin,
    );
    expect(registry.get("antd-x-run-timeline")).toBe(
      antdXRunTimelinePlugin,
    );
    expect(registry.get("antd-x-tool-detail")).toBe(antdXToolDetailPlugin);
    expect(registry.get("antd-x-resources")).toBe(antdXResourcesPlugin);
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

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    const newConversationPosition = html.indexOf(
      'data-ui-plugin="antd-x-new-conversation"',
    );
    const welcomePosition = html.indexOf('data-ui-plugin="antd-x-welcome"');
    const messagesPosition = html.indexOf(
      'data-ui-plugin="antd-x-message-list"',
    );
    const promptsPosition = html.indexOf('data-ui-plugin="antd-x-prompts"');
    const senderPosition = html.indexOf('data-ui-plugin="antd-x-sender"');
    const timelinePosition = html.indexOf(
      'data-ui-plugin="antd-x-run-timeline"',
    );
    const toolDetailPosition = html.indexOf(
      'data-ui-plugin="antd-x-tool-detail"',
    );
    const resourcesPosition = html.indexOf(
      'data-ui-plugin="antd-x-resources"',
    );

    expect(welcomePosition).toBeGreaterThan(-1);
    expect(newConversationPosition).toBeGreaterThan(welcomePosition);
    expect(messagesPosition).toBeGreaterThan(welcomePosition);
    expect(promptsPosition).toBeGreaterThan(messagesPosition);
    expect(senderPosition).toBeGreaterThan(promptsPosition);
    expect(timelinePosition).toBeGreaterThan(senderPosition);
    expect(toolDetailPosition).toBeGreaterThan(timelinePosition);
    expect(resourcesPosition).toBeGreaterThan(toolDetailPosition);
    expect(html).toContain("Agent Frontend");
    expect(html).toContain("新建会话");
    expect(html).toContain('data-ui-plugin="antd-x-conversations"');
    expect(html).toContain("Files");
    expect(html).toContain("总结当前上下文");
    expect(html).toContain("给智能体发送消息，输入 / 唤出快捷指令");
  });

  it("renders plugin-declared child Slots with owner props and owner fallback", () => {
    const ownerPlugin: UIPluginDefinition = {
      manifest: {
        id: "slot-owner",
        name: "Slot owner",
        description: "Declares a nested action outlet",
        version: "1.0.0",
      },
      slots: {
        actions: {
          kind: "list",
          scope: "thread",
          description: "Actions for the current message",
          ownerProps: [
            {
              name: "messageId",
              type: "string",
              description: "Current message id",
              required: true,
            },
          ],
          fallback: "owner",
        },
      },
      Component: ({ context }) => (
        <article>
          {context.slots.render(
            "actions",
            { messageId: "message-7" },
            { fallback: <span>Owner action</span> },
          )}
        </article>
      ),
    };
    const actionPlugin: UIPluginDefinition = {
      manifest: {
        id: "slot-action",
        name: "Slot action",
        description: "Consumes a nested Slot occurrence",
        version: "1.0.0",
      },
      Component: ({ context }) => (
        <button>
          {String(
            (context.slot.ownerProps as { messageId?: unknown }).messageId,
          )}
        </button>
      ),
    };
    const createNestedModel = (withOccupant: boolean) => parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-slot-node", slotId: "root-slot" },
      slots: {
        "root-slot": {
          id: "root-slot",
          kind: "single",
          scope: "root",
          description: "Root owner fixture",
          owner: { type: "layout", nodeId: "root-slot-node" },
          occupants: [{ instanceId: "owner-main" }],
        },
        "message-actions": {
          id: "message-actions",
          kind: "list",
          scope: "thread",
          description: "Actions for the current message",
          owner: {
            type: "plugin-instance",
            instanceId: "owner-main",
            outlet: "actions",
          },
          ownerProps: [
            {
              name: "messageId",
              type: "string",
              description: "Current message id",
              required: true,
            },
          ],
          fallback: "owner",
          occupants: withOccupant
            ? [{ id: "action", instanceId: "action-main" }]
            : [],
        },
      },
      pluginInstances: {
        "owner-main": {
          id: "owner-main",
          pluginId: "slot-owner",
          enabled: true,
        },
        "action-main": {
          id: "action-main",
          pluginId: "slot-action",
          enabled: withOccupant,
        },
      },
    });
    const registry = createPluginRegistry([ownerPlugin, actionPlugin]);
    const render = (withOccupant: boolean) => renderPluginRuntime({
      actions: runtimeActions,
      messages: [],
      model: createNestedModel(withOccupant),
      registry,
      run: idleRun,
      state: null,
    });

    expect(render(true)).toContain(
      '<div class="app-ui-plugin-slot-content" data-slot-id="message-actions"',
    );
    expect(render(true)).toContain("message-7");
    expect(render(false)).toContain("Owner action");

    const mismatched = createNestedModel(true);
    mismatched.slots["message-actions"]!.description = "Different contract";
    expect(() =>
      renderPluginRuntime({
        actions: runtimeActions,
        messages: [],
        model: mismatched,
        registry,
        run: idleRun,
        state: null,
      }),
    ).toThrow("contract does not match");
  });

  it("renders the granular inspection plugins as independent slot capabilities", () => {
    const model = parseAppUIModel({
      version: "2",
      root: {
        type: "column",
        id: "inspection-layout",
        children: [
          {
            type: "slot",
            id: "tool-slot-node",
            slotId: "tool-slot",
          },
          {
            type: "slot",
            id: "reasoning-slot-node",
            slotId: "reasoning-slot",
          },
          {
            type: "slot",
            id: "activity-slot-node",
            slotId: "activity-slot",
          },
          {
            type: "slot",
            id: "sources-slot-node",
            slotId: "sources-slot",
          },
          {
            type: "slot",
            id: "attachments-slot-node",
            slotId: "attachments-slot",
          },
        ],
      },
      slots: Object.fromEntries(
        [
          ["tool-slot", "tool-slot-node", "tool-main"],
          ["reasoning-slot", "reasoning-slot-node", "reasoning-main"],
          ["activity-slot", "activity-slot-node", "activity-main"],
          ["sources-slot", "sources-slot-node", "sources-main"],
          ["attachments-slot", "attachments-slot-node", "attachments-main"],
        ].map(([slotId, nodeId, instanceId]) => [
          slotId,
          {
            id: slotId,
            kind: "single",
            scope: "root",
            description: `${slotId} fixture`,
            owner: { type: "layout", nodeId },
            occupants: [{ instanceId }],
          },
        ]),
      ),
      pluginInstances: {
        "tool-main": {
          id: "tool-main",
          pluginId: "antd-x-tool-detail",
          enabled: true,
        },
        "reasoning-main": {
          id: "reasoning-main",
          pluginId: "antd-x-reasoning",
          enabled: true,
        },
        "activity-main": {
          id: "activity-main",
          pluginId: "antd-x-activity-feed",
          enabled: true,
        },
        "sources-main": {
          id: "sources-main",
          pluginId: "antd-x-sources",
          enabled: true,
        },
        "attachments-main": {
          id: "attachments-main",
          pluginId: "antd-x-attachments",
          enabled: true,
        },
      },
    });
    const registry = createPluginRegistry([
      antdXToolDetailPlugin,
      antdXReasoningPlugin,
      antdXActivityFeedPlugin,
      antdXSourcesPlugin,
      antdXAttachmentsPlugin,
    ]);

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-ui-plugin="antd-x-tool-detail"');
    expect(html).toContain('data-ui-plugin="antd-x-reasoning"');
    expect(html).toContain('data-ui-plugin="antd-x-activity-feed"');
    expect(html).toContain('data-ui-plugin="antd-x-sources"');
    expect(html).toContain('data-ui-plugin="antd-x-attachments"');
    expect(html).toContain("render_ui_diagram");
    expect(html).toContain("插件组合检查完成");
    expect(html).toContain("Ant Design X 组件总览");
    expect(html).toContain("只读 · 2");
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

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

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

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

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

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: running,
      state: previewAgentState,
    });

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
      version: "2",
      root: {
        type: "slot",
        id: "probe-slot-node",
        slotId: "probe-slot",
      },
      slots: {
        "probe-slot": {
          id: "probe-slot",
          kind: "single",
          scope: "root",
          description: "Runtime context probe",
          owner: { type: "layout", nodeId: "probe-slot-node" },
          occupants: [{ instanceId: "probe-main" }],
        },
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
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };
    const failedRun: UIPluginRunState = {
      status: "error",
      errorMessage: "Agent endpoint is unavailable",
    };

    renderPluginRuntime({
      actions,
      messages: [],
      model,
      registry: createPluginRegistry([probePlugin]),
      run: failedRun,
      state: null,
    });

    if (capturedContext === undefined) {
      throw new Error("Plugin context was not injected");
    }

    expect(capturedContext.run).toBe(failedRun);
    await capturedContext.actions.sendMessage("hello");
    await capturedContext.actions.startNewConversation();
    capturedContext.actions.abortRun();
    capturedContext.actions.updateInstanceProps({ compact: true });

    expect(actions.sendMessage).toHaveBeenCalledWith("hello");
    expect(actions.startNewConversation).toHaveBeenCalledOnce();
    expect(actions.abortRun).toHaveBeenCalledOnce();
    expect(actions.updateInstanceProps).toHaveBeenCalledWith("probe-main", {
      compact: true,
    });
  });

  it("surfaces a deterministic error for an unregistered plugin", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins.slice(0, 3));

    const html = renderPluginRuntime({
      actions: runtimeActions,
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'UI plugin &quot;antd-x-sender&quot; is not registered.',
    );
  });
});
