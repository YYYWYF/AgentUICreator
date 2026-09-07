import { renderToStaticMarkup } from "react-dom/server";
import { Think } from "@ant-design/x";
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
  AgentExecution,
  AgentMessage,
  AgentRunState,
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { pluginDefinitions } from "../plugins";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import { conversationDataSourcePlugin } from "../plugins/conversation-data-source/definition";
import {
  antdXTemplatePlugins,
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  antdXSourcesPlugin,
  antdXToolDetailPlugin,
  antdXToolMessagePlugin,
  antdXWelcomePlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
} from "../plugins/antd-x-template-library";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  StaticPluginRegistry,
} from "../runtime/plugins";
import {
  useAgentConversation,
  useAgentExecutions,
  useAgentInterrupts,
  useAgentMessages,
  useAgentRun,
  usePluginActions,
  usePluginEvents,
  usePluginInstance,
} from "../runtime/context";
import {
  PluginRuntimeFixture,
  type PluginRuntimeFixtureProps,
} from "./agent-runtime-fixture";
import {
  initialPreviewMessages,
  previewAgentState,
} from "../src/preview-data";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
  type ConversationDataSource,
} from "../services/conversations";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
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
  update(props: PluginRuntimeFixtureProps): Promise<void>;
  dispose(): Promise<void>;
}

async function mountPluginRuntime(
  props: PluginRuntimeFixtureProps,
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
          <PluginRuntimeFixture {...props} />
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
    update: async (nextProps) => {
      await act(async () => {
        renderer?.update(
          <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
            <PluginRuntimeFixture {...nextProps} />
          </PluginServiceRuntimeContext.Provider>,
        );
      });
    },
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

function renderPluginRuntime(props: PluginRuntimeFixtureProps): string {
  const serviceRuntime = new PluginServiceRuntime();
  const declarationCleanups: Array<() => void> = [];
  try {
    declareLayoutSlots(props.model.root, serviceRuntime, declarationCleanups);
    serviceRuntime.reconcile(props.model, props.registry, props.actions);
    return renderToStaticMarkup(
      <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
        <PluginRuntimeFixture {...props} />
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

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
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
  model: PluginRuntimeFixtureProps["model"],
  definitions: readonly UIPluginDefinition[],
): PluginRuntimeFixtureProps {
  return {
    actions: runtimeActions,
    conversation: { id: "default" },
    executions: [],
    interrupts: [],
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
    expect(registry.get("conversation-data-source")).toBe(
      conversationDataSourcePlugin,
    );
    expect(registry.get("antd-x-run-timeline")).toBe(
      antdXRunTimelinePlugin,
    );
    expect(registry.get("antd-x-tool-detail")).toBe(antdXToolDetailPlugin);
    expect(registry.get("antd-x-tool-message")).toBe(antdXToolMessagePlugin);
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

  it("validates duplicate service declarations", () => {
    const invalidPlugin: UIPluginDefinition = {
      manifest: {
        id: "bad",
        name: "Bad Plugin",
        description: "Invalid service declaration fixture",
        version: "1.0.0",
      },
      provides: ["test.shared", "test.shared"],
      Component: () => null,
    };

    expect(() => new StaticPluginRegistry([invalidPlugin])).toThrow();
  });

  it("rejects plugins that inject and provide the same service", () => {
    const invalidPlugin: UIPluginDefinition = {
      manifest: {
        id: "misrouted",
        name: "Misrouted Plugin",
        description: "Invalid service declaration fixture",
        version: "1.0.0",
      },
      provides: ["editor"],
      inject: ["editor"],
      Component: () => null,
    };

    expect(() => new StaticPluginRegistry([invalidPlugin])).toThrow(
      'UI plugin "misrouted" cannot both provide and inject "editor"',
    );
  });
});

describe("UIPluginRuntime", () => {
  it("renders the message timeline and composer through ConversationSurface", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
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

  it("renders one assistant bubble for a turn that crosses a tool call", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "user-turn",
        producer: { type: "root" },
        role: "user",
        content: "你能做什么",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-tool-call",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [
          {
            id: "inspect-call",
            type: "function",
            function: { name: "inspect", arguments: "{}" },
          },
        ],
        metadata: { conversationId: "default" },
      },
      {
        id: "inspect-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "inspect-call",
        content: "done",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-final",
        producer: { type: "root" },
        role: "assistant",
        content: "检查完成，我找到了 AG-UI Transport 和生命周期投影相关实现。",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, "antd-x-message-list-bubble--user")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-bubble--agent")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-avatar--agent")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-role-dot")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-actions")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-turn-segment ")).toBe(2);
    expect(html).toContain('data-ui-plugin="antd-x-tool-message"');
    expect(html).toContain("inspect");
    expect(html).toContain("已完成");
    expect(html).toContain("done");
    expect(html).toContain("检查完成，我找到了 AG-UI Transport");
    expect(html.indexOf("inspect")).toBeLessThan(html.indexOf("done"));
    expect(html.indexOf("done")).toBeLessThan(
      html.indexOf("检查完成，我找到了 AG-UI Transport"),
    );
  });

  it("keeps multiple streaming assistant messages in one running turn bubble", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "streaming-user-turn",
        producer: { type: "root" },
        role: "user",
        content: "检查项目",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-stream-1",
        producer: { type: "root" },
        role: "assistant",
        content: "检查项目...",
        streamStatus: "completed",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-stream-2",
        producer: { type: "root" },
        role: "assistant",
        content: "发现相关实现...",
        streamStatus: "streaming",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: { status: "running" },
      state: previewAgentState,
    });

    expect(countOccurrences(html, "antd-x-message-list-bubble--agent")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-turn-segment")).toBe(2);
    expect(countOccurrences(html, 'data-agent-turn-id="streaming-user-turn"')).toBe(2);
    expect(html).toContain("检查项目...");
    expect(html).toContain("发现相关实现...");
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain("智能体正在处理");
  });

  it("hides leading internal context while rendering chat messages", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "leading-system",
        producer: { type: "root" },
        role: "system",
        content: "Hidden system context",
        metadata: { conversationId: "default" },
      },
      {
        id: "leading-developer",
        producer: { type: "root" },
        role: "developer",
        content: "Hidden developer context",
        metadata: { conversationId: "default" },
      },
      {
        id: "visible-user",
        producer: { type: "root" },
        role: "user",
        content: "Visible question",
        metadata: { conversationId: "default" },
      },
      {
        id: "visible-assistant",
        producer: { type: "root" },
        role: "assistant",
        content: "Visible answer",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, "antd-x-message-list-bubble--user")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-bubble--agent")).toBe(1);
    expect(html).toContain("Visible question");
    expect(html).toContain("Visible answer");
    expect(html).not.toContain("Hidden system context");
    expect(html).not.toContain("Hidden developer context");
  });

  it("renders every response message in source order inside one turn bubble", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "context-turn-user",
        producer: { type: "root" },
        role: "user",
        content: "Visible turn question",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-tool-call",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [
          {
            id: "inspect-project-call",
            type: "function",
            function: { name: "inspect_project", arguments: "{}" },
          },
        ],
        metadata: { conversationId: "default" },
      },
      {
        id: "inspect-project-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "inspect-project-call",
        content: "project inspected",
        metadata: { conversationId: "default" },
      },
      {
        id: "turn-reasoning",
        producer: { type: "root" },
        role: "reasoning",
        content: "analyzing project",
        metadata: { conversationId: "default" },
      },
      {
        id: "turn-activity",
        producer: { type: "root" },
        role: "activity",
        activityType: "project.scan",
        content: {
          title: "Scanning",
          description: "Reading frontend files",
        },
        metadata: { conversationId: "default" },
      },
      {
        id: "turn-system",
        producer: { type: "root" },
        role: "system",
        content: "system message inside turn",
        metadata: { conversationId: "default" },
      },
      {
        id: "turn-developer",
        producer: { type: "root" },
        role: "developer",
        content: "developer message inside turn",
        metadata: { conversationId: "default" },
      },
      {
        id: "assistant-final",
        producer: { type: "root" },
        role: "assistant",
        content: "检查完成",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, "antd-x-message-list-bubble--user")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-bubble--agent")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-avatar--agent")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-actions")).toBe(1);
    expect(countOccurrences(html, "antd-x-message-list-turn-segment ")).toBe(6);

    const expectedContent = [
      "inspect_project",
      "project inspected",
      "analyzing project",
      "Scanning",
      "system message inside turn",
      "developer message inside turn",
      "检查完成",
    ];
    expectedContent.forEach((content) => expect(html).toContain(content));
    expectedContent.slice(1).forEach((content, index) => {
      expect(html.indexOf(expectedContent[index])).toBeLessThan(
        html.indexOf(content),
      );
    });
  });

  it("renders a leading assistant message without a user turn", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "leading-assistant",
        producer: { type: "root" },
        role: "assistant",
        content: "Welcome from assistant",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, "antd-x-message-list-bubble--agent")).toBe(1);
    expect(html).toContain("Welcome from assistant");
  });

  it("renders only the active Inspector child while keeping every contribution active", async () => {
    const model = parseAppUIModel(appUIJson);
    const mounted = await mountPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
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
      executions: [],
      interrupts: [],
      messages: [
        {
          id: "other-conversation-message",
          producer: { type: "root" },
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
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-call-only",
        content: "工具结果",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-only",
        producer: { type: "root" },
        role: "reasoning",
        content: "思考过程",
        metadata: { conversationId: "default" },
      },
      {
        id: "activity-only",
        producer: { type: "root" },
        role: "activity",
        activityType: "progress",
        content: { title: "处理中" },
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
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

  it("renders the running turn after the initiating user message arrives", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const running: AgentRunState = {
      status: "running",
    };

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages: [
        {
          id: "running-user-turn",
          producer: { type: "root" },
          role: "user",
          content: "开始检查",
          metadata: { conversationId: "default" },
        },
      ],
      model,
      registry,
      run: running,
      state: previewAgentState,
    });

    expect(html).toContain('data-conversation-state="timeline"');
    expect(html).toContain('data-ui-plugin="antd-x-message-list"');
    expect(html).toContain('data-agent-run-status="running"');
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain("智能体正在处理");
    expect(html).toContain('data-ui-plugin="antd-x-sender"');
    expect(html).not.toContain('data-ui-plugin="antd-x-welcome"');
    expect(html).not.toContain('data-ui-plugin="antd-x-prompts"');
  });

  it("renders the granular Inspector plugins as independent slot capabilities", async () => {
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
      antdXActivityFeedPlugin,
      antdXSourcesPlugin,
      antdXAttachmentsPlugin,
    ]);

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages: initialPreviewMessages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain('data-ui-plugin="antd-x-tool-detail"');
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
      executions: [],
      interrupts: [],
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
      executions: [],
      interrupts: [],
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
      executions: [{
        type: "reasoning",
        id: "reasoning-running",
        producer: { type: "root" },
        messageIds: ["preview-reasoning-1"],
        status: "running",
      }],
      interrupts: [],
      messages: defaultConversationMessages,
      model,
      registry,
      run: running,
      state: previewAgentState,
    });

    expect(html).toContain('data-agent-run-status="running"');
    expect(html).toContain("ant-bubble-loading");
    expect(html).toContain("正在思考");
    expect(html).toContain('data-reasoning-status="running"');
  });

  it("collapses reasoning after the same occurrence completes", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "reasoning-transition-user",
        producer: { type: "root" },
        role: "user",
        content: "分析项目",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-transition",
        producer: { type: "root" },
        role: "reasoning",
        content: "读取项目结构",
        metadata: { conversationId: "default" },
      },
    ];
    const execution: Extract<AgentExecution, { type: "reasoning" }> = {
      type: "reasoning",
      id: "reasoning-transition-execution",
      producer: { type: "root" },
      messageIds: ["reasoning-transition"],
      status: "running",
    };
    const runningProps: PluginRuntimeFixtureProps = {
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [execution],
      interrupts: [],
      messages,
      model,
      registry,
      run: { status: "running" },
      state: previewAgentState,
    };
    const mounted = await mountPluginRuntime(runningProps);

    try {
      let reasoning = mounted.renderer.root.findByType(Think);
      expect(reasoning.props["data-reasoning-status"]).toBe("running");
      expect(reasoning.props.loading).toBe(true);
      expect(reasoning.props.expanded).toBe(true);

      await mounted.update({
        ...runningProps,
        executions: [{ ...execution, status: "completed" }],
        run: idleRun,
      });

      reasoning = mounted.renderer.root.findByType(Think);
      expect(reasoning.props["data-reasoning-status"]).toBe("completed");
      expect(reasoning.props.loading).toBe(false);
      expect(reasoning.props.expanded).toBe(false);

      await act(async () => reasoning.props.onExpand(true));
      await mounted.update({
        ...runningProps,
        executions: [{ ...execution, status: "completed" }],
        run: idleRun,
        state: { updated: true },
      });

      reasoning = mounted.renderer.root.findByType(Think);
      expect(reasoning.props.expanded).toBe(true);
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps completed reasoning expanded when collapseOnComplete is disabled", async () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "agent-reasoning-main": {
          ...appUIJson.pluginInstances["agent-reasoning-main"],
          props: { collapseOnComplete: false },
        },
      },
    });
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "reasoning-config-user",
        producer: { type: "root" },
        role: "user",
        content: "分析项目",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-config",
        producer: { type: "root" },
        role: "reasoning",
        content: "读取项目结构",
        metadata: { conversationId: "default" },
      },
    ];
    const execution: Extract<AgentExecution, { type: "reasoning" }> = {
      type: "reasoning",
      id: "reasoning-config-execution",
      producer: { type: "root" },
      messageIds: ["reasoning-config"],
      status: "running",
    };
    const runningProps: PluginRuntimeFixtureProps = {
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [execution],
      interrupts: [],
      messages,
      model,
      registry,
      run: { status: "running" },
      state: previewAgentState,
    };
    const mounted = await mountPluginRuntime(runningProps);

    try {
      await mounted.update({
        ...runningProps,
        executions: [{ ...execution, status: "completed" }],
        run: idleRun,
      });

      const reasoning = mounted.renderer.root.findByType(Think);
      expect(reasoning.props["data-reasoning-status"]).toBe("completed");
      expect(reasoning.props.loading).toBe(false);
      expect(reasoning.props.expanded).toBe(true);
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps interrupted reasoning expanded after it stops loading", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "reasoning-interrupted-user",
        producer: { type: "root" },
        role: "user",
        content: "分析项目",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-interrupted",
        producer: { type: "root" },
        role: "reasoning",
        content: "读取项目结构",
        metadata: { conversationId: "default" },
      },
    ];
    const execution: Extract<AgentExecution, { type: "reasoning" }> = {
      type: "reasoning",
      id: "reasoning-interrupted-execution",
      producer: { type: "root" },
      messageIds: ["reasoning-interrupted"],
      status: "running",
    };
    const runningProps: PluginRuntimeFixtureProps = {
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [execution],
      interrupts: [],
      messages,
      model,
      registry,
      run: { status: "running" },
      state: previewAgentState,
    };
    const mounted = await mountPluginRuntime(runningProps);

    try {
      await mounted.update({
        ...runningProps,
        executions: [{ ...execution, status: "interrupted" }],
        run: idleRun,
      });

      const reasoning = mounted.renderer.root.findByType(Think);
      expect(reasoning.props["data-reasoning-status"]).toBe("interrupted");
      expect(reasoning.props.loading).toBe(false);
      expect(reasoning.props.expanded).toBe(true);
      expect(reasoning.props.title).toBe("思考已停止");
    } finally {
      await mounted.dispose();
    }
  });

  it("uses one configured renderer instance for multiple reasoning messages", async () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(antdXTemplatePlugins);
    const messages: AgentMessage[] = [
      {
        id: "reasoning-user",
        producer: { type: "root" },
        role: "user",
        content: "分析两步",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-a",
        producer: { type: "root" },
        role: "reasoning",
        content: "第一步",
        metadata: { conversationId: "default" },
      },
      {
        id: "reasoning-b",
        producer: { type: "root" },
        role: "reasoning",
        content: "第二步",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, 'data-plugin-instance-id="agent-reasoning-main"')).toBe(2);
    expect(countOccurrences(html, 'data-ui-plugin="antd-x-reasoning"')).toBe(2);
    expect(html.indexOf("第一步")).toBeLessThan(html.indexOf("第二步"));
  });

  it("keeps reasoning, merged tool blocks, and final text in projected order", async () => {
    const model = parseAppUIModel(appUIJson);
    const messages: AgentMessage[] = [
      {
        id: "interleave-user",
        producer: { type: "root" },
        role: "user",
        content: "按步骤执行",
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-reasoning-a",
        producer: { type: "root" },
        role: "reasoning",
        content: "reasoning A",
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-tool-a-call",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-a",
          type: "function",
          function: { name: "tool_A", arguments: "{}" },
        }],
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-tool-a-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-a",
        content: "result A",
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-reasoning-b",
        producer: { type: "root" },
        role: "reasoning",
        content: "reasoning B",
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-tool-b-call",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-b",
          type: "function",
          function: { name: "tool_B", arguments: "{}" },
        }],
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-tool-b-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-b",
        content: "result B",
        metadata: { conversationId: "default" },
      },
      {
        id: "interleave-final",
        producer: { type: "root" },
        role: "assistant",
        content: "assistant final",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages,
      model,
      registry: createPluginRegistry(antdXTemplatePlugins),
      run: idleRun,
      state: previewAgentState,
    });
    const orderedContent = [
      "reasoning A",
      "tool_A",
      "result A",
      "reasoning B",
      "tool_B",
      "result B",
      "assistant final",
    ];

    expect(countOccurrences(html, 'data-ui-plugin="antd-x-reasoning"')).toBe(2);
    expect(countOccurrences(html, 'data-ui-plugin="antd-x-tool-message"')).toBe(2);
    expect(countOccurrences(html, "result A")).toBe(1);
    expect(countOccurrences(html, "result B")).toBe(1);
    orderedContent.slice(1).forEach((content, index) => {
      expect(html.indexOf(orderedContent[index]!)).toBeLessThan(
        html.indexOf(content),
      );
    });
  });

  it("reuses reasoning and tool child renderers for history without executions", async () => {
    const historyMessages: AgentMessage[] = [
      {
        id: "history-user",
        producer: { type: "root" },
        role: "user",
        content: "分析项目",
        metadata: { conversationId: "history" },
      },
      {
        id: "history-reasoning",
        producer: { type: "root" },
        role: "reasoning",
        content: "读取项目结构",
        metadata: { conversationId: "history" },
      },
      {
        id: "history-tool-call-message",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "history-tool-call",
          type: "function",
          function: { name: "inspect_ui_project", arguments: "{}" },
        }],
        metadata: { conversationId: "history" },
      },
      {
        id: "history-tool-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "history-tool-call",
        content: "project inspected",
        metadata: { conversationId: "history" },
      },
      {
        id: "history-final",
        producer: { type: "root" },
        role: "assistant",
        content: "分析完成",
        metadata: { conversationId: "history" },
      },
    ];
    const dataSource: ConversationDataSource = {
      list: async () => [{ id: "history", title: "历史会话" }],
      get: async () => ({
        id: "history",
        title: "历史会话",
        messages: historyMessages,
      }),
    };
    const historyDataSourcePlugin: UIPluginDefinition = {
      manifest: {
        id: "conversation-data-source",
        name: "History Conversation DataSource Fixture",
        description: "Provides deterministic history renderer fixtures.",
        version: "1.0.0",
        capabilities: ["headless"],
      },
      provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
      setup: ({ services }) => {
        services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, dataSource);
      },
      Component: () => null,
    };
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(
      antdXTemplatePlugins.map((definition) =>
        definition.manifest.id === "conversation-data-source"
          ? historyDataSourcePlugin
          : definition,
      ),
    );
    const mounted = await mountPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [],
      interrupts: [],
      messages: [],
      model,
      registry,
      run: idleRun,
      state: previewAgentState,
    });

    try {
      const conversation = mounted.serviceRuntime.get<AgentUIConversationService>(
        AGENT_UI_CONVERSATION_SERVICE,
      );
      if (conversation === undefined) {
        throw new Error("Conversation Service fixture was not activated");
      }
      await act(async () => {
        await conversation.selectConversation("history");
      });

      const messageList = mounted.renderer.root.findByProps({
        "data-ui-plugin": "antd-x-message-list",
      });
      const reasoning = mounted.renderer.root.findByType(Think);
      const tool = mounted.renderer.root.find(
        (node) =>
          node.props["data-ui-plugin"] === "antd-x-tool-message" &&
          node.props["data-tool-call-id"] === "history-tool-call",
      );
      const content = getText(messageList);
      const orderedContent = [
        "读取项目结构",
        "inspect_ui_project",
        "project inspected",
        "分析完成",
      ];

      expect(messageList.props["data-conversation-mode"]).toBe("history");
      expect(reasoning.props["data-ui-plugin"]).toBe("antd-x-reasoning");
      expect(reasoning.props["data-reasoning-status"]).toBe("completed");
      expect(reasoning.props.loading).toBe(false);
      expect(reasoning.props.expanded).toBe(true);
      expect(tool.props["data-tool-status"]).toBe("success");
      expect(countOccurrences(content, "project inspected")).toBe(1);
      orderedContent.slice(1).forEach((item, index) => {
        expect(content.indexOf(orderedContent[index]!)).toBeLessThan(
          content.indexOf(item),
        );
      });
    } finally {
      await mounted.dispose();
    }
  });

  it("updates the same tool block to an error state", async () => {
    const model = parseAppUIModel(appUIJson);
    const messages: AgentMessage[] = [
      {
        id: "tool-error-user",
        producer: { type: "root" },
        role: "user",
        content: "执行失败工具",
        metadata: { conversationId: "default" },
      },
      {
        id: "tool-error-call-message",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-error-call",
          type: "function",
          function: { name: "failing_tool", arguments: "{}" },
        }],
        metadata: { conversationId: "default" },
      },
      {
        id: "tool-error-result",
        producer: { type: "root" },
        role: "tool",
        toolCallId: "tool-error-call",
        content: "failed",
        error: "permission denied",
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [{
        type: "tool",
        id: "tool-error-call",
        producer: { type: "root" },
        name: "failing_tool",
        status: "error",
        arguments: "{}",
        error: { message: "permission denied" },
      }],
      interrupts: [],
      messages,
      model,
      registry: createPluginRegistry(antdXTemplatePlugins),
      run: idleRun,
      state: previewAgentState,
    });

    expect(countOccurrences(html, 'data-tool-call-id="tool-error-call"')).toBe(1);
    expect(html).toContain('data-tool-status="error"');
    expect(countOccurrences(html, "permission denied")).toBe(1);
  });

  it("renders an unfinished tool call as one loading tool block", async () => {
    const model = parseAppUIModel(appUIJson);
    const messages: AgentMessage[] = [
      {
        id: "tool-loading-user",
        producer: { type: "root" },
        role: "user",
        content: "执行工具",
        metadata: { conversationId: "default" },
      },
      {
        id: "tool-loading-call-message",
        producer: { type: "root" },
        role: "assistant",
        toolCalls: [{
          id: "tool-loading-call",
          type: "function",
          function: { name: "loading_tool", arguments: "{\"query\":\"x\"}" },
        }],
        metadata: { conversationId: "default" },
      },
    ];

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "default" },
      executions: [{
        type: "tool",
        id: "tool-loading-call",
        producer: { type: "root" },
        name: "loading_tool",
        status: "awaiting-result",
        arguments: "{\"query\":\"x\"}",
      }],
      interrupts: [],
      messages,
      model,
      registry: createPluginRegistry(antdXTemplatePlugins),
      run: { status: "running" },
      state: previewAgentState,
    });

    expect(countOccurrences(html, 'data-tool-call-id="tool-loading-call"')).toBe(1);
    expect(html).toContain('data-tool-status="loading"');
    expect(html).toContain("执行中");
  });

  it("falls back without losing reasoning or tool content when child renderers are disabled", async () => {
    const model = parseAppUIModel({
      ...appUIJson,
      pluginInstances: {
        ...appUIJson.pluginInstances,
        "agent-reasoning-main": {
          ...appUIJson.pluginInstances["agent-reasoning-main"],
          enabled: false,
        },
        "agent-tool-message-main": {
          ...appUIJson.pluginInstances["agent-tool-message-main"],
          enabled: false,
        },
      },
    });

    const html = await renderPluginRuntime({
      actions: runtimeActions,
      conversation: { id: "current" },
      executions: [],
      interrupts: [],
      messages: initialPreviewMessages,
      model,
      registry: createPluginRegistry(antdXTemplatePlugins),
      run: idleRun,
      state: previewAgentState,
    });

    expect(html).toContain("先读取 AppUIModel 与插件注册表");
    expect(html).toContain("list_ui_plugins");
    expect(html).toContain("runtimeCount");
    expect(html).not.toContain('data-ui-plugin="antd-x-reasoning"');
    expect(html).not.toContain('data-ui-plugin="antd-x-tool-message"');
  });

  it("binds runtime hooks and instance-aware actions into their providers", async () => {
    let captured:
      | {
          conversation: ReturnType<typeof useAgentConversation>;
          executions: ReturnType<typeof useAgentExecutions>;
          interrupts: ReturnType<typeof useAgentInterrupts>;
          run: ReturnType<typeof useAgentRun>;
          actions: ReturnType<typeof usePluginActions>;
        }
      | undefined;
    const probePlugin: UIPluginDefinition = {
      manifest: {
        id: "probe",
        name: "Probe",
        description: "Captures runtime context for testing",
        version: "1.0.0",
      },
      Component: () => {
        captured = {
          conversation: useAgentConversation(),
          executions: useAgentExecutions(),
          interrupts: useAgentInterrupts(),
          run: useAgentRun(),
          actions: usePluginActions(),
        };
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
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };
    const failedRun: AgentRunState = {
      status: "error",
      error: { message: "Agent endpoint is unavailable" },
    };
    const executions: AgentExecution[] = [{
      type: "step",
      id: "step-probe",
      producer: { type: "root" },
      name: "probe",
      status: "completed",
    }];

    await renderPluginRuntime({
      actions,
      conversation: { id: "default" },
      executions,
      interrupts: [{
        id: "approval",
        reason: "tool-approval",
        producer: { type: "root" },
      }],
      messages: [],
      model,
      registry: createPluginRegistry([probePlugin]),
      run: failedRun,
      state: null,
    });

    if (captured === undefined) {
      throw new Error("Plugin providers were not injected");
    }

    expect(captured.run).toBe(failedRun);
    expect(captured.executions).toBe(executions);
    expect(captured.interrupts).toEqual([{
      id: "approval",
      reason: "tool-approval",
      producer: { type: "root" },
    }]);
    expect(captured.conversation).toEqual({ id: "default" });
    await captured.actions.sendMessage("hello");
    await captured.actions.resumeInterrupts([{
      interruptId: "approval",
      status: "resolved",
      payload: { approved: true },
    }]);
    await captured.actions.startNewConversation();
    captured.actions.abortRun();
    captured.actions.updateInstanceProps({ compact: true });

    expect(actions.sendMessage).toHaveBeenCalledWith("hello");
    expect(actions.resumeInterrupts).toHaveBeenCalledWith([{
      interruptId: "approval",
      status: "resolved",
      payload: { approved: true },
    }]);
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
      executions: [],
      interrupts: [],
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
    let consumerContext:
      | {
          instanceId: string;
          messages: AgentMessage[];
          run: AgentRunState;
          events: ReturnType<typeof usePluginEvents>;
        }
      | undefined;
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">
        OWNER
        {renderSlot("owner.child")}
      </section>
    );
    const Consumer = () => {
      consumerContext = {
        instanceId: usePluginInstance().id,
        messages: useAgentMessages(),
        run: useAgentRun(),
        events: usePluginEvents(),
      };
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
      expect(consumerContext?.instanceId).toBe("consumer-main");
      expect(consumerContext?.messages).toEqual([]);
      expect(consumerContext?.run).toBe(idleRun);
      expect(consumerContext?.events).toBeDefined();
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
    const Child = () => <span>{usePluginInstance().id}</span>;
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

  it("renders an owner fallback for an empty declared child Slot", async () => {
    const Owner = ({ renderSlot }: UIPluginComponentProps) => (
      <section data-fixture="owner">
        {renderSlot("owner.empty", <span data-fixture="fallback">fallback</span>)}
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
      expect(
        getText(mounted.renderer.root.findByProps({ "data-fixture": "fallback" })),
      ).toBe("fallback");
    } finally {
      await mounted.dispose();
    }
  });
});
