import { describe, expect, it, vi } from "vitest";

import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { conversationServicePlugin } from "../plugins/conversation-service/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationService,
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
};

function model(navigation?: UIPluginDefinition) {
  return parseAppUIRuntimeModel({
    root: { type: "slot", id: "navigation-node", slotId: "navigation" },
    pluginInstances: {
      "conversation-data": {
        id: "conversation-data",
        pluginId: "test-conversation-data-source",
        enabled: true,
      },
      "conversation-service": {
        id: "conversation-service",
        pluginId: "conversation-service",
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

describe("conversationServicePlugin", () => {
  it("injects the DataSource, provides Conversation Service, and refreshes", async () => {
    const list = vi.fn(async () => []);
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list,
      get: async (id) => ({
        id,
        title: id,
        history: { format: "langchain", messages: [] },
      }),
    };
    const runtime = new PluginServiceRuntime();
    const startNewConversation = vi.fn(async () => {
      throw new Error("Conversation Service must not navigate Runtime");
    });
    runtime.reconcile(
      model(),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationServicePlugin]),
      { ...actions, startNewConversation },
    );
    await Promise.resolve();

    expect(conversationServicePlugin.inject).toEqual([
      AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
    ]);
    expect(conversationServicePlugin.provides).toEqual([
      AGENT_UI_CONVERSATION_SERVICE,
    ]);
    expect(list).toHaveBeenCalledOnce();

    const conversation = runtime.get<ConversationService>(
      AGENT_UI_CONVERSATION_SERVICE,
    );
    expect(conversation).toBeDefined();
    conversation?.resetForNewConversation();
    expect(startNewConversation).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("disposes the service and aborts pending refresh on removal", () => {
    let signal: AbortSignal | undefined;
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: (options) => {
        signal = options?.signal;
        return new Promise(() => undefined);
      },
      get: async (id) => ({
        id,
        title: id,
        history: { format: "langchain", messages: [] },
      }),
    };
    const runtime = new PluginServiceRuntime();
    runtime.reconcile(
      model(),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationServicePlugin]),
      actions,
    );

    expect(signal?.aborted).toBe(false);
    runtime.reconcile(
      parseAppUIRuntimeModel({
        root: { type: "slot", id: "navigation-node", slotId: "navigation" },
        pluginInstances: {},
      }),
      createPluginRegistry([dataSourcePlugin(dataSource), conversationServicePlugin]),
      actions,
    );

    expect(signal?.aborted).toBe(true);
    expect(runtime.get(AGENT_UI_CONVERSATION_SERVICE)).toBeUndefined();
    runtime.dispose();
  });

  it("keeps Conversation Service available without navigation and with a replacement UI", () => {
    const dataSource: ConversationDataSource = {
      delete: async () => { throw new Error("Delete is not configured in this fixture."); },
      list: async () => [],
      get: async (id) => ({
        id,
        title: id,
        history: { format: "langchain", messages: [] },
      }),
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
      conversationServicePlugin,
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
