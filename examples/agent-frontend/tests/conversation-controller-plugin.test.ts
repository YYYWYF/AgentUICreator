import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { conversationControllerPlugin } from "../plugins/conversation-controller/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
  type ConversationDataSource,
} from "../services/conversations";
import { createPluginRegistry, PluginServiceRuntime } from "../runtime/plugins";

function dataSourcePlugin(dataSource: ConversationDataSource): UIPluginDefinition {
  return {
    manifest: {
      id: "test-conversation-data-source",
      name: "Test Conversation DataSource",
      description: "Provides deterministic conversation fixtures.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE],
    setup: ({ services }) => {
      services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, dataSource);
    },
    Component: () => null,
  };
}

const actions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function model(navigation?: UIPluginDefinition) {
  return parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "navigation-node", slotId: "navigation" },
    pluginInstances: {
      "conversation-data": {
        id: "conversation-data",
        pluginId: "test-conversation-data-source",
        enabled: true,
      },
      "conversation-controller": {
        id: "conversation-controller",
        pluginId: "conversation-controller",
        enabled: true,
      },
      ...(navigation === undefined ? {} : {
        "custom-navigation": {
          id: "custom-navigation",
          pluginId: navigation.manifest.id,
          enabled: true,
          mount: { slotId: "navigation" },
        },
      }),
    },
  });
}

describe("conversationControllerPlugin", () => {
  it("injects the DataSource, provides Conversation Service, and refreshes", async () => {
    const list = vi.fn(async () => []);
    const dataSource: ConversationDataSource = {
      list,
      get: async (id) => ({ id, title: id, messages: [] }),
    };
    const runtime = new PluginServiceRuntime();
    const startNewConversation = vi.fn(async () => {
      throw new Error("Conversation Service must not navigate Runtime");
    });
    runtime.reconcile(
      model(),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationControllerPlugin]),
      { ...actions, startNewConversation },
    );
    await Promise.resolve();

    expect(conversationControllerPlugin.inject).toEqual([
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
    ]);
    expect(conversationControllerPlugin.provides).toEqual([
      AGENT_UI_CONVERSATION_SERVICE,
    ]);
    expect(list).toHaveBeenCalledOnce();

    const conversation = runtime.get<AgentUIConversationService>(
      AGENT_UI_CONVERSATION_SERVICE,
    );
    expect(conversation).toBeDefined();
    conversation?.resetForNewConversation();
    expect(startNewConversation).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("disposes the controller and aborts pending refresh on removal", () => {
    let signal: AbortSignal | undefined;
    const dataSource: ConversationDataSource = {
      list: (options) => {
        signal = options?.signal;
        return new Promise(() => undefined);
      },
      get: async (id) => ({ id, title: id, messages: [] }),
    };
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(
      model(),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationControllerPlugin]),
      actions,
    );

    expect(signal?.aborted).toBe(false);
    runtime.reconcile(
      parseAppUIModel({
        version: "2",
        root: { type: "slot", id: "navigation-node", slotId: "navigation" },
        pluginInstances: {},
      }),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationControllerPlugin]),
      actions,
    );

    expect(signal?.aborted).toBe(true);
    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeUndefined();
    runtime.dispose();
  });

  it("keeps Conversation Service available without navigation and with a replacement UI", () => {
    const dataSource: ConversationDataSource = {
      list: async () => [],
      get: async (id) => ({ id, title: id, messages: [] }),
    };
    const customNavigation: UIPluginDefinition = {
      manifest: {
        id: "custom-navigation",
        name: "Custom Navigation",
        description: "Replacement conversation navigation fixture.",
        version: "1.0.0",
      },
      inject: [AGENT_UI_CONVERSATION_SERVICE],
      Component: () => null,
    };
    const registry = createPluginRegistry([
      dataSourcePlugin(dataSource),
      conversationControllerPlugin,
      customNavigation,
    ]);
    const runtime = new PluginServiceRuntime();

    runtime.reconcile(model(), registry, actions);
    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeDefined();

    runtime.reconcile(model(customNavigation), registry, actions);
    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeDefined();
    expect(runtime.getActivation("custom-navigation")?.status).toBe("active");
    runtime.dispose();
  });
});
