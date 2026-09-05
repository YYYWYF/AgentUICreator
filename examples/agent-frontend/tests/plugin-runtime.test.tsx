import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "antd";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import {
  parseAppUIModel,
  type LayoutNode,
} from "../framework/contracts/app-ui-model";
import type {
  AgentMessage,
  AgentRunState,
  UIPluginComponentProps,
  UIPluginContext,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { pluginDefinitions } from "../plugins";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import {
  antdXTemplatePlugins,
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  antdXReasoningPlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  antdXSourcesPlugin,
  antdXToolDetailPlugin,
  antdXWelcomePlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
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

const idleRun: AgentRunState = {
  status: "idle",
};

const defaultConversationMessages: AgentMessage[] = initialPreviewMessages.map(
  (message) => ({
    ...message,
    metadata: { ...message.metadata, conversationId: "default" },
  }),
);

interface MountedPluginRuntime {
  renderer: ReactTestRenderer;
  serviceRuntime: PluginServiceRuntime;
  dispose(): Promise<void>;
}

async function mountPluginRuntime(
  props: UIPluginRuntimeProps,
): Promise<MountedPluginRuntime> {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(props.model, props.registry, props.actions);
  let renderer: ReactTestRenderer | undefined;

  try {
    await act(async () => {
      renderer = create(
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <UIPluginRuntime {...props} />
        </PluginServiceRuntimeContext.Provider>,
      );
    });
  } catch (error) {
    serviceRuntime.dispose();
    throw error;
  }

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Plugin Runtime test renderer was not created");
  }

  return {
    renderer,
    serviceRuntime,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
}

function declareLayoutSlots(
  node: LayoutNode,
  runtime: PluginServiceRuntime,
  cleanups: Array<() => void>,
): void {
  if (node.type === "slot") {
    cleanups.push(
      runtime.slots.declare({
        slotId: node.slotId,
        owner: { kind: "layout", nodeId: node.id },
      }),
    );
    return;
  }
  if (node.type === "panel") {
    declareLayoutSlots(node.child, runtime, cleanups);
    return;
  }
  node.children.forEach((child) =>
    declareLayoutSlots(child, runtime, cleanups),
  );
}

function renderPluginRuntime(props: UIPluginRuntimeProps): string {
  const serviceRuntime = new PluginServiceRuntime();
  const declarationCleanups: Array<() => void> = [];
  try {
    declareLayoutSlots(props.model.root, serviceRuntime, declarationCleanups);
    serviceRuntime.reconcile(props.model, props.registry, props.actions);
    return renderToStaticMarkup(
      <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
        <UIPluginRuntime {...props} />
      </PluginServiceRuntimeContext.Provider>,
    );
  } finally {
    serviceRuntime.dispose();
    declarationCleanups.reverse().forEach((cleanup) => cleanup());
  }
}

function getText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : getText(child)))
    .join("");
}

function createFixtureDefinition(
  id: string,
  Component: UIPluginDefinition["Component"],
  childSlots: readonly string[] = [],
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} composition fixture`,
      version: "1.0.0",
      ...(childSlots.length === 0
        ? {}
        : { slots: { children: [...childSlots] } }),
    },
    Component,
  };
}

function fixtureRuntimeProps(
  model: UIPluginRuntimeProps["model"],
  definitions: readonly UIPluginDefinition[],
): UIPluginRuntimeProps {
  return {
    actions: runtimeActions,
    conversation: { id: "default" },
    messages: [],
    model,
    registry: createPluginRegistry(definitions),
    run: idleRun,
    state: null,
  };
}

describe("StaticPluginRegistry", () => {
  it("registers and lists statically imported plugin definitions", () => {
    const registry = createPluginRegistry(pluginDefinitions);

    expect(registry.get("antd-x-welcome")).toBe(antdXWelcomePlugin);
    expect(registry.get("antd-x-conversations")).toBe(
      antdXConversationsPlugin,
    );
    expect(registry.get("antd-x-run-timeline")).toBe(
      antdXRunTimelinePlugin,
    );
    expect(registry.get("antd-x-tool-detail")).toBe(antdXToolDetailPlugin);
    expect(registry.get("antd-x-resources")).toBe(antdXResourcesPlugin);
    expect(registry.get("conversation-surface")).toBe(
      conversationSurfacePlugin,
    );
    expect(registry.get("workspace-inspector")).toBe(
      workspaceInspectorPlugin,
    );
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
  it("renders the message timeline and composer through ConversationSurface", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: defaultConversationMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    const conversationsPosition = html.indexOf(
      'data-ui-plugin="antd-x-conversations"',
    );
    const welcomePosition = html.indexOf('data-ui-plugin="antd-x-welcome"');
    const surfacePosition = html.indexOf(
      'data-ui-plugin="conversation-surface"',
    );
    const inspectorPosition = html.indexOf(
      'data-ui-plugin="workspace-inspector"',
    );
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

    expect(conversationsPosition).toBeGreaterThan(-1);
    expect(surfacePosition).toBeGreaterThan(conversationsPosition);
    expect(messagesPosition).toBeGreaterThan(surfacePosition);
    expect(senderPosition).toBeGreaterThan(messagesPosition);
    expect(inspectorPosition).toBeGreaterThan(senderPosition);
    expect(timelinePosition).toBeGreaterThan(inspectorPosition);
    expect(toolDetailPosition).toBe(-1);
    expect(resourcesPosition).toBe(-1);
    expect(welcomePosition).toBe(-1);
    expect(promptsPosition).toBe(-1);
    expect(html).toContain("新建会话");
    expect(html).toContain('data-ui-plugin="antd-x-conversations"');
    expect(html).toContain("Activity");
    expect(html).toContain("Tool");
    expect(html).toContain("Resources");
    expect(html).toContain("给智能体发送消息，输入 / 唤出快捷指令");
  });

  it("renders only the active Inspector child while keeping every contribution active", async () => {
    const model = parseAppUIModel(appUIJson);
    const mounted = await mountPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: defaultConversationMessages,
      model,
      registry: createPluginRegistry(antdXTemplatePlugins),
      run: idleRun,
      state: previewAgentState,
    });

    const renderedPluginIds = () =>
      mounted.renderer.root
        .findAll(
          (node) =>
            typeof node.props["data-ui-plugin"] === "string",
        )
        .map((node) => node.props["data-ui-plugin"] as string);
    const contributionInstanceIds = (slotId: string) =>
      mounted.serviceRuntime.slots
        .getContributions(slotId)
        .map((contribution) => contribution.instanceId);
    const inspectorActivation = mounted.serviceRuntime.getActivation(
      "agent-inspector-main",
    );
    const leafActivations = [
      "agent-run-timeline-main",
      "agent-tool-detail-main",
      "agent-resources-main",
    ].map((instanceId) => mounted.serviceRuntime.getActivation(instanceId));

    try {
      expect(renderedPluginIds()).toContain("workspace-inspector");
      expect(renderedPluginIds()).toContain("antd-x-run-timeline");
      expect(renderedPluginIds()).not.toContain("antd-x-tool-detail");
      expect(renderedPluginIds()).not.toContain("antd-x-resources");
      expect(contributionInstanceIds("inspector.activity")).toEqual([
        "agent-run-timeline-main",
      ]);
      expect(contributionInstanceIds("inspector.tool")).toEqual([
        "agent-tool-detail-main",
      ]);
      expect(contributionInstanceIds("inspector.resources")).toEqual([
        "agent-resources-main",
      ]);

      const inspector = mounted.renderer.root.findByProps({
        "data-ui-plugin": "workspace-inspector",
      });
      const tabs = inspector.findByType(Tabs);
      await act(async () => tabs.props.onChange("tool"));

      expect(renderedPluginIds()).not.toContain("antd-x-run-timeline");
      expect(renderedPluginIds()).toContain("antd-x-tool-detail");
      expect(renderedPluginIds()).not.toContain("antd-x-resources");

      await act(async () => tabs.props.onChange("resources"));

      expect(renderedPluginIds()).not.toContain("antd-x-run-timeline");
      expect(renderedPluginIds()).not.toContain("antd-x-tool-detail");
      expect(renderedPluginIds()).toContain("antd-x-resources");
      expect(
        mounted.serviceRuntime.getActivation("agent-inspector-main"),
      ).toBe(inspectorActivation);
      expect(
        [
          "agent-run-timeline-main",
          "agent-tool-detail-main",
          "agent-resources-main",
        ].map((instanceId) => mounted.serviceRuntime.getActivation(instanceId)),
      ).toEqual(leafActivations);
      expect(contributionInstanceIds("inspector.activity")).toEqual([
        "agent-run-timeline-main",
      ]);
      expect(contributionInstanceIds("inspector.tool")).toEqual([
        "agent-tool-detail-main",
      ]);
      expect(contributionInstanceIds("inspector.resources")).toEqual([
        "agent-resources-main",
      ]);
    } finally {
      await mounted.dispose();
    }
  });

  it("renders the empty conversation when only another conversation has messages", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: [
        {
          id: "other-conversation-message",
          role: "assistant",
          content: "另一会话的消息",
          metadata: { conversationId: "other" },
        },
      ],
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-ui-plugin="conversation-surface"');
    expect(html).toContain('data-conversation-state="empty"');
    expect(html).toContain('data-ui-plugin="antd-x-welcome"');
    expect(html).toContain('data-ui-plugin="antd-x-prompts"');
    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).not.toContain('data-ui-plugin="antd-x-message-list"');
    expect(html).toContain("Agent Frontend");
    expect(html).toContain("总结当前上下文");
  });

  it("keeps non-chat messages from turning the current conversation into a timeline", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "tool-only",
        role: "tool",
        toolCallId: "tool-call-only",
        content: "工具结果",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-only",
        role: "reasoning",
        content: "思考过程",
        metadata: { conversationId: "default" },
      },
      {
        id: "activity-only",
        role: "activity",
        activityType: "progress",
        content: { title: "处理中" },
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-conversation-state="empty"');
    expect(html).toContain('data-ui-plugin="antd-x-welcome"');
    expect(html).toContain('data-ui-plugin="antd-x-prompts"');
    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).not.toContain('data-ui-plugin="antd-x-message-list"');
  });

  it("renders the running timeline when the current conversation has no chat messages", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const running: AgentRunState = {
      status: "running",
    };

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: [],
      model,
      registry,
      run: running,
      state: previewAgentState,
    });

    expect(html).toContain('data-conversation-state="timeline"');
    expect(html).toContain('data-ui-plugin="antd-x-message-list"');
    expect(html).toContain('data-agent-run-status="running"');
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).not.toContain('data-ui-plugin="antd-x-welcome"');
    expect(html).not.toContain('data-ui-plugin="antd-x-prompts"');
  });

  it("renders the granular inspection plugins as independent slot capabilities", async () => {
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
      pluginInstances: {
        "tool-main": {
          id: "tool-main",
          mount: { slotId: "tool-slot" },
          pluginId: "antd-x-tool-detail",
          enabled: true,
        },
        "reasoning-main": {
          id: "reasoning-main",
          mount: { slotId: "reasoning-slot" },
          pluginId: "antd-x-reasoning",
          enabled: true,
        },
        "activity-main": {
          id: "activity-main",
          mount: { slotId: "activity-slot" },
          pluginId: "antd-x-activity-feed",
          enabled: true,
        },
        "sources-main": {
          id: "sources-main",
          mount: { slotId: "sources-slot" },
          pluginId: "antd-x-sources",
          enabled: true,
        },
        "attachments-main": {
          id: "attachments-main",
          mount: { slotId: "attachments-slot" },
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

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
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

  it("does not render disabled plugin instances", async () => {
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

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: defaultConversationMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-ui-plugin="antd-x-message-list"');
    expect(html).not.toContain('data-ui-plugin="antd-x-prompts"');
  });

  it("honors Sender instance props", async () => {
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

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).toContain("输入一条自定义消息");
  });

  it("renders the shared Agent run state through the template plugins", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const running: AgentRunState = {
      status: "running",
    };

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      messages: defaultConversationMessages,
      model,
      registry,
      run: running,
      state: previewAgentState,
    });

    expect(html).toContain('data-agent-run-status="running"');
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain("正在思考");
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
      pluginInstances: {
        "probe-main": {
          id: "probe-main",
          pluginId: "probe",
          enabled: true,
          mount: { slotId: "probe-slot" },
        },
      },
    });
    const actions = {
      sendMessage: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };
    const failedRun: AgentRunState = {
      status: "error",
      error: { message: "Agent endpoint is unavailable" },
    };

    await renderPluginRuntime({
      actions,
      conversation: { id: "default" },
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
    expect(capturedContext.conversation).toEqual({ id: "default" });
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

  it("surfaces a deterministic error for an unregistered plugin", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(
      antdXTemplatePlugins.filter(
        (definition) => definition.manifest.id !== "antd-x-sender",
      ),
    );

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
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

describe("recursive React Plugin composition", () => {
  it("renders a child contribution inside its owner Plugin subtree", async () => {
    let consumerContext: UIPluginContext | undefined;
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">
        OWNER
        {renderSlot("owner.child")}
      </section>
    );
    const Consumer = ({ context }: UIPluginComponentProps) => {
      consumerContext = context;
      return <span data-fixture="consumer">CONSUMER</span>;
    };
    const definitions = [
      createFixtureDefinition("owner", Owner, ["owner.child"]),
      createFixtureDefinition("consumer", Consumer),
    ];
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
        "consumer-main": {
          id: "consumer-main",
          pluginId: "consumer",
          enabled: true,
          mount: { slotId: "owner.child" },
        },
      },
    });
    const mounted = await mountPluginRuntime(
      fixtureRuntimeProps(model, definitions),
    );

    try {
      const owner = mounted.renderer.root.findByProps({
        "data-fixture": "owner",
      });
      const consumer = owner.findByProps({ "data-fixture": "consumer" });
      expect(getText(owner)).toContain("OWNER");
      expect(getText(consumer)).toBe("CONSUMER");
      expect(consumerContext?.instance.id).toBe("consumer-main");
      expect(consumerContext?.messages).toEqual([]);
      expect(consumerContext?.run).toBe(idleRun);
      expect(consumerContext?.services).toBeDefined();
    } finally {
      await mounted.dispose();
    }
  });

  it("recursively renders A to B to C as nested Plugin subtrees", async () => {
    const A = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="a">A{renderSlot("a.child")}</section>
    );
    const B = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="b">B{renderSlot("b.child")}</section>
    );
    const C = () => <span data-fixture="c">C</span>;
    const definitions = [
      createFixtureDefinition("a", A, ["a.child"]),
      createFixtureDefinition("b", B, ["b.child"]),
      createFixtureDefinition("c", C),
    ];
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "root-node", slotId: "root" },
      pluginInstances: {
        "a-main": {
          id: "a-main",
          pluginId: "a",
          enabled: true,
          mount: { slotId: "root" },
        },
        "b-main": {
          id: "b-main",
          pluginId: "b",
          enabled: true,
          mount: { slotId: "a.child" },
        },
        "c-main": {
          id: "c-main",
          pluginId: "c",
          enabled: true,
          mount: { slotId: "b.child" },
        },
      },
    });
    const mounted = await mountPluginRuntime(
      fixtureRuntimeProps(model, definitions),
    );

    try {
      const a = mounted.renderer.root.findByProps({ "data-fixture": "a" });
      const b = a.findByProps({ "data-fixture": "b" });
      const c = b.findByProps({ "data-fixture": "c" });
      expect(getText(a)).toContain("ABC");
      expect(getText(b)).toContain("BC");
      expect(getText(c)).toBe("C");
    } finally {
      await mounted.dispose();
    }
  });

  it("captures an unauthorized renderSlot call in the owner boundary", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section>{renderSlot("owner.forbidden")}</section>
    );
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
    let mounted: MountedPluginRuntime | undefined;

    try {
      mounted = await mountPluginRuntime(
        fixtureRuntimeProps(model, [
          createFixtureDefinition("owner", Owner, ["owner.allowed"]),
        ]),
      );
      const [failure] = mounted.renderer.root.findAll(
        (node) => node.props["data-plugin-state"] === "error",
      );
      expect(failure).toBeDefined();
      expect(failure?.props["data-plugin-instance-id"]).toBe("owner-main");
      expect(getText(failure!)).toContain("owner-main");
      expect(getText(failure!)).toContain("owner.forbidden");
      expect(mounted.renderer.root).toBeDefined();
    } finally {
      await mounted?.dispose();
      consoleError.mockRestore();
    }
  });

  it("isolates a broken child without removing its owner or sibling", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">
        OWNER
        {renderSlot("owner.child")}
      </section>
    );
    const Broken = () => {
      throw new Error("child exploded");
    };
    const Healthy = () => <span data-fixture="healthy">healthy child</span>;
    const definitions = [
      createFixtureDefinition("owner", Owner, ["owner.child"]),
      createFixtureDefinition("broken", Broken),
      createFixtureDefinition("healthy", Healthy),
    ];
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
        "broken-main": {
          id: "broken-main",
          pluginId: "broken",
          enabled: true,
          mount: { slotId: "owner.child" },
        },
        "healthy-main": {
          id: "healthy-main",
          pluginId: "healthy",
          enabled: true,
          mount: { slotId: "owner.child" },
        },
      },
    });
    let mounted: MountedPluginRuntime | undefined;

    try {
      mounted = await mountPluginRuntime(
        fixtureRuntimeProps(model, definitions),
      );
      const owner = mounted.renderer.root.findByProps({
        "data-fixture": "owner",
      });
      expect(getText(owner)).toContain("OWNER");
      expect(getText(owner.findByProps({ "data-fixture": "healthy" }))).toBe(
        "healthy child",
      );
      expect(
        owner.findAllByProps({ "data-plugin-instance-id": "broken-main" }),
      ).toHaveLength(0);
      const [failure] = mounted.renderer.root.findAll(
        (node) => node.props["data-plugin-state"] === "error",
      );
      expect(failure?.props["data-plugin-instance-id"]).toBe("broken-main");
      expect(getText(failure!)).toContain("child exploded");
    } finally {
      await mounted?.dispose();
      consoleError.mockRestore();
    }
  });

  it("renders child contributions in Registry order", async () => {
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">{renderSlot("owner.child")}</section>
    );
    const Child = ({ context }: UIPluginComponentProps) => (
      <span>{context.instance.id}</span>
    );
    const definitions = [
      createFixtureDefinition("owner", Owner, ["owner.child"]),
      createFixtureDefinition("child", Child),
    ];
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
        "z-child": {
          id: "z-child",
          pluginId: "child",
          enabled: true,
          mount: { slotId: "owner.child", order: 5 },
        },
        "b-child": {
          id: "b-child",
          pluginId: "child",
          enabled: true,
          mount: { slotId: "owner.child", order: 1 },
        },
        "a-child": {
          id: "a-child",
          pluginId: "child",
          enabled: true,
          mount: { slotId: "owner.child", order: 1 },
        },
      },
    });
    const mounted = await mountPluginRuntime(
      fixtureRuntimeProps(model, definitions),
    );

    try {
      const owner = mounted.renderer.root.findByProps({
        "data-fixture": "owner",
      });
      const childSlot = owner.findByProps({ "data-slot-id": "owner.child" });
      const instanceIds = childSlot
        .findAll(
          (node) => node.props.className === "app-ui-plugin-instance",
        )
        .map((node) => node.props["data-plugin-instance-id"]);
      expect(instanceIds).toEqual(["a-child", "b-child", "z-child"]);
    } finally {
      await mounted.dispose();
    }
  });

  it("allows an owner to render an empty declared child Slot", async () => {
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">
        OWNER
        {renderSlot("owner.empty")}
      </section>
    );
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
    const mounted = await mountPluginRuntime(
      fixtureRuntimeProps(model, [
        createFixtureDefinition("owner", Owner, ["owner.empty"]),
      ]),
    );

    try {
      const owner = mounted.renderer.root.findByProps({
        "data-fixture": "owner",
      });
      expect(getText(owner)).toBe("OWNER");
      expect(
        owner.findAllByProps({ "data-slot-id": "owner.empty" }),
      ).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });
});
