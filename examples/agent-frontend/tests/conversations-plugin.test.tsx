// @vitest-environment jsdom

import { Conversations } from "@ant-design/x";
import { Button } from "antd";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { antdXConversationsPlugin } from "../plugins/antd-x-conversations/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  type ConversationDataSource,
} from "../services/conversations";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const dataSource: ConversationDataSource = {
  list: async () => [{ id: "history", title: "历史会话", group: "今天" }],
  get: async (id) => ({
    id,
    title: "历史会话",
    messages: [{
      id: "history-message",
      producer: { type: "root" },
      role: "assistant",
      content: "只读历史",
    }],
  }),
};

const testDataSourcePlugin: UIPluginDefinition = {
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

const model = parseAppUIModel({
  version: "2",
  root: { type: "slot", id: "conversations-node", slotId: "conversations" },
  pluginInstances: {
    "conversation-data": {
      id: "conversation-data",
      pluginId: "test-conversation-data-source",
      enabled: true,
    },
    "conversations-main": {
      id: "conversations-main",
      pluginId: "antd-x-conversations",
      enabled: true,
      mount: { slotId: "conversations" },
    },
  },
});
const registry = createPluginRegistry([
  testDataSourcePlugin,
  antdXConversationsPlugin,
]);

async function renderPlugin({
  startNewConversation = async () => undefined,
  status = "idle",
}: {
  startNewConversation?: () => Promise<void>;
  status?: "idle" | "running";
} = {}): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={{
          sendMessage: async () => undefined,
          resumeInterrupts: async () => undefined,
          startNewConversation,
          abortRun: () => undefined,
          updateInstanceProps: vi.fn(),
        }}
        conversation={{ id: "current" }}
        executions={[]}
        interrupts={[]}
        messages={[]}
        model={model}
        registry={registry}
        run={{ status }}
        state={{}}
      />,
    );
    await Promise.resolve();
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return renderer;
}

describe("AntdXConversationsPlugin", () => {
  it("loads history and selects it through the controller", async () => {
    const renderer = await renderPlugin();
    const conversations = renderer.root.findByType(Conversations);
    expect(conversations.props.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "history", label: "历史会话" }),
    ]));

    await act(async () => {
      conversations.props.onActiveChange("history");
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ "data-conversation-mode": "history" }))
      .toBeDefined();
  });

  it("delegates new conversation creation and returns to live", async () => {
    const startNewConversation = vi.fn(async () => undefined);
    const renderer = await renderPlugin({ startNewConversation });
    await act(async () => {
      renderer.root.findByType(Conversations).props.onActiveChange("history");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByType(Button).props.onClick();
      await Promise.resolve();
    });
    expect(startNewConversation).toHaveBeenCalledOnce();
    expect(renderer.root.findByProps({ "data-conversation-mode": "live" }))
      .toBeDefined();
  });

  it("disables new conversation creation while the Runtime is running", async () => {
    const renderer = await renderPlugin({ status: "running" });
    expect(renderer.root.findByType(Button).props.disabled).toBe(true);
  });
});
