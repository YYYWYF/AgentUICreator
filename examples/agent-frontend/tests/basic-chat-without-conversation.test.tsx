import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentComposer } from "../agent-ui/components/composer";
import { AgentUIRootContext } from "../agent-ui/foundation/context";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentMessage,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { agentComposerPlugin } from "../plugins/antd-x-sender/definition";
import { conversationSurfacePlugin } from "../plugins/conversation-surface/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationDataSource,
} from "../services/conversations";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const basicChatModel = parseAppUIModel({
  version: "2",
  root: {
    type: "slot",
    id: "conversation-surface-node",
    slotId: "workspace.conversation",
  },
  pluginInstances: {
    "agent-conversation-surface-main": {
      id: "agent-conversation-surface-main",
      pluginId: "conversation-surface",
      enabled: true,
      mount: { slotId: "workspace.conversation" },
    },
    "agent-messages-main": {
      id: "agent-messages-main",
      pluginId: "antd-x-message-list",
      enabled: true,
      mount: { slotId: "conversation.timeline" },
    },
    "agent-sender-main": {
      id: "agent-sender-main",
      pluginId: "antd-x-sender",
      enabled: true,
      mount: { slotId: "conversation.composer" },
    },
  },
});

const basicChatRegistry = createPluginRegistry([
  conversationSurfacePlugin,
  antdXMessageListPlugin,
  agentComposerPlugin,
]);

const liveMessages: AgentMessage[] = [
  {
    id: "user-1",
    producer: { type: "root" },
    role: "user",
    content: "你好",
  },
  {
    id: "assistant-1",
    producer: { type: "root" },
    role: "assistant",
    content: "你好，有什么可以帮你？",
  },
];

function getText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : getText(child)))
    .join("");
}

async function mountBasicChat(messages: AgentMessage[]) {
  const sendMessage = vi.fn(async () => undefined);
  const actions = {
    sendMessage,
    resumeInterrupts: vi.fn(async () => undefined),
    startNewConversation: vi.fn(async () => undefined),
    abortRun: vi.fn(),
    updateInstanceProps: vi.fn(),
  };
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(basicChatModel, basicChatRegistry, actions);
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <AgentUIRootContext.Provider value={{ portalContainer: null }}>
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginRuntimeFixture
            actions={actions}
            conversation={{ id: "live" }}
            executions={[]}
            interrupts={[]}
            messages={messages}
            model={basicChatModel}
            registry={basicChatRegistry}
            run={{ status: "idle" }}
            state={{}}
          />
        </PluginServiceRuntimeContext.Provider>
      </AgentUIRootContext.Provider>,
    );
  });

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Renderer was not created");
  }

  return {
    renderer,
    sendMessage,
    serviceRuntime,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
}

const conversationDataSource: ConversationDataSource = {
  list: async () => [],
  get: async (id) => ({ id, title: id, messages: [] }),
};

const conversationDataSourcePlugin: UIPluginDefinition = {
  manifest: {
    id: "conversation-data-source",
    name: "Conversation Data Source Fixture",
    description: "Provides deterministic conversation data for removal tests.",
    version: "1.0.0",
    capabilities: ["headless"],
  },
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: ({ services }) => {
    services.provide(
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
      conversationDataSource,
    );
  },
  Component: () => null,
};

function createConversationModel(includeHistory: boolean) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "row",
      id: "conversation-layout",
      children: [
        {
          type: "slot",
          id: "conversation-history-node",
          slotId: "workspace.conversation-history",
        },
        {
          type: "slot",
          id: "conversation-surface-node",
          slotId: "workspace.conversation",
        },
      ],
    },
    pluginInstances: {
      ...(includeHistory
        ? {
            "agent-conversation-data-main": {
              id: "agent-conversation-data-main",
              pluginId: "conversation-data-source",
              enabled: true,
            },
            "agent-conversations-main": {
              id: "agent-conversations-main",
              pluginId: "antd-x-conversations",
              enabled: true,
              mount: { slotId: "workspace.conversation-history" },
            },
          }
        : {}),
      ...basicChatModel.pluginInstances,
    },
  });
}

describe("basic chat without Conversation Service", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("keeps the basic chat active, renders live messages, and sends input", async () => {
    const mounted = await mountBasicChat(liveMessages);

    try {
      expect(
        mounted.serviceRuntime.get(AGENT_UI_CONVERSATION_SERVICE),
      ).toBeUndefined();
      for (const instanceId of [
        "agent-conversation-surface-main",
        "agent-messages-main",
        "agent-sender-main",
      ]) {
        expect(mounted.serviceRuntime.getActivation(instanceId)?.status).toBe(
          "active",
        );
      }
      expect(
        mounted.renderer.root.findAllByProps({ "data-plugin-state": "pending" }),
      ).toHaveLength(0);

      const surface = mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      });
      expect(surface.props["data-conversation-mode"]).toBe("live");
      expect(surface.props["data-conversation-state"]).toBe("timeline");

      const messageList = mounted.renderer.root.findByProps({
        "data-ui-plugin": "antd-x-message-list",
      });
      expect(getText(messageList)).toContain("你好");
      expect(getText(messageList)).toContain("你好，有什么可以帮你？");

      const sender = mounted.renderer.root.findByType(AgentComposer);
      expect(sender.props.disabled).toBe(false);
      await act(async () => {
        sender.props.onSubmit("hello");
        await Promise.resolve();
      });
      expect(mounted.sendMessage).toHaveBeenCalledWith("hello");
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps the live-only surface empty until Runtime messages exist", async () => {
    const mounted = await mountBasicChat([]);

    try {
      const surface = mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      });
      expect(surface.props["data-conversation-mode"]).toBe("live");
      expect(surface.props["data-conversation-state"]).toBe("empty");
      expect(
        mounted.serviceRuntime.getActivation("agent-messages-main")?.status,
      ).toBe("active");
      expect(
        mounted.renderer.root.findAllByProps({
          "data-ui-plugin": "antd-x-message-list",
        }),
      ).toHaveLength(0);
      expect(mounted.renderer.root.findByType(AgentComposer).props.disabled).toBe(
        false,
      );
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps basic chat active after the history plugins are removed", () => {
    const actions = {
      sendMessage: vi.fn(async () => undefined),
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };
    const registry = createPluginRegistry([
      conversationDataSourcePlugin,
      antdXConversationsPlugin,
      conversationSurfacePlugin,
      antdXMessageListPlugin,
      agentComposerPlugin,
    ]);
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(createConversationModel(true), registry, actions);
    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeDefined();

    runtime.reconcile(createConversationModel(false), registry, actions);

    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeUndefined();
    expect(runtime.getActivation("agent-conversation-data-main")).toBeUndefined();
    expect(runtime.getActivation("agent-conversations-main")).toBeUndefined();
    for (const instanceId of [
      "agent-conversation-surface-main",
      "agent-messages-main",
      "agent-sender-main",
    ]) {
      expect(runtime.getActivation(instanceId)?.status).toBe("active");
    }

    runtime.dispose();
  });
});
