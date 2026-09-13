import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { assistantUiThreadListPlugin } from "../plugins/assistant-ui-thread-list/definition";
import { conversationServicePlugin } from "../plugins/conversation-service/definition";
import { conversationSurfacePlugin } from "../plugins/conversation-surface/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationDataSource,
} from "../services/conversations";
import { createPluginRegistry, PluginServiceRuntime } from "../runtime/plugins";

const model = parseAppUIModel({
  version: "2",
  root: {
    type: "row",
    id: "conversation-layout",
    children: [
      {
        type: "slot",
        id: "conversation-history-node",
        slotId: "conversation.navigation",
      },
      {
        type: "slot",
        id: "conversation-surface-node",
        slotId: "conversation.surface",
      },
    ],
  },
  pluginInstances: {
    "agent-conversation-data-main": {
      id: "agent-conversation-data-main",
      pluginId: "conversation-data-source",
      enabled: true,
    },
    "agent-conversation-service-main": {
      id: "agent-conversation-service-main",
      pluginId: "conversation-service",
      enabled: true,
    },
    "assistant-ui-thread-list-main": {
      id: "assistant-ui-thread-list-main",
      pluginId: "assistant-ui-thread-list",
      enabled: true,
        mount: { slotId: "conversation.navigation" },
    },
    "agent-conversation-surface-main": {
      id: "agent-conversation-surface-main",
      pluginId: "conversation-surface",
      enabled: true,
        mount: { slotId: "conversation.surface" },
    },
  },
});

const conversationDataSource: ConversationDataSource = {
  list: async () => [],
  get: async (id) => ({ id, title: id, messages: [] }),
};

const conversationDataSourceFixture: UIPluginDefinition = {
  manifest: {
    id: "conversation-data-source",
    name: "Conversation Data Source Fixture",
    description: "Provides deterministic conversation data for lifecycle tests.",
    version: "1.0.0",
    capabilities: ["headless"],
  },
  provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
  setup: ({ services }) => {
    services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, conversationDataSource);
  },
  Component: () => null,
};

describe("basic chat without legacy navigation", () => {
  it("keeps Conversation Service active with the canonical navigation owner", () => {
    const registry = createPluginRegistry([
      conversationDataSourceFixture,
      conversationServicePlugin,
      assistantUiThreadListPlugin,
      conversationSurfacePlugin,
    ]);
    const runtime = new PluginServiceRuntime();
    const actions = {
      sendMessage: vi.fn(async () => undefined),
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
      updateInstanceProps: vi.fn(),
    };

    runtime.reconcile(model, registry, actions);

    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeDefined();
    expect(runtime.getActivation("agent-conversation-service-main")?.status).toBe(
      "active",
    );
    expect(runtime.getActivation("assistant-ui-thread-list-main")?.status).toBe(
      "active",
    );
    expect(runtime.getActivation("agent-conversation-surface-main")?.status).toBe(
      "active",
    );
    expect(runtime.getActivation("agent-conversations-main")).toBeUndefined();

    runtime.dispose();
  });
});
