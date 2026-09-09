import { Suggestion } from "@ant-design/x";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { AgentComposer } from "../agent-ui/components/composer";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { antdXSenderPlugin } from "../plugins/antd-x-sender/definition";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
} from "../services/conversations";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const historyService: AgentUIConversationService = {
  getSnapshot: () => ({
    ...EMPTY_CONVERSATION_SNAPSHOT,
    mode: "history",
    activeConversationId: "history",
    detailStatus: "ready",
  }),
  subscribe: () => () => undefined,
  refresh: async () => undefined,
  selectConversation: async () => undefined,
  showLiveConversation: () => undefined,
  startNewConversation: async () => undefined,
};

const historyProvider: UIPluginDefinition = {
  manifest: {
    id: "test-history-provider",
    name: "Test History Provider",
    description: "Provides a static history snapshot.",
    version: "1.0.0",
    capabilities: ["headless"],
  },
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ services }) => {
    services.provide(AGENT_UI_CONVERSATION_SERVICE, historyService);
  },
  Component: () => null,
};

describe("AntdXSenderPlugin history mode", () => {
  it("disables input and guards submission while history is visible", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "sender-node", slotId: "sender" },
      pluginInstances: {
        provider: {
          id: "provider",
          pluginId: "test-history-provider",
          enabled: true,
        },
        sender: {
          id: "sender",
          pluginId: "antd-x-sender",
          enabled: true,
          mount: { slotId: "sender" },
        },
      },
    });
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <PluginRuntimeFixture
          actions={{
            sendMessage,
            resumeInterrupts: async () => undefined,
            startNewConversation: async () => undefined,
            abortRun: () => undefined,
            updateInstanceProps: () => undefined,
          }}
          conversation={{ id: "live" }}
          executions={[]}
          interrupts={[]}
          messages={[]}
          model={model}
          registry={createPluginRegistry([historyProvider, antdXSenderPlugin])}
          run={{ status: "idle" }}
          state={{}}
        />,
      );
    });
    if (renderer === undefined) throw new Error("Renderer was not created");
    const composer = renderer.root.findByType(AgentComposer);
    expect(composer.props.disabled).toBe(true);
    expect(composer.props.placeholder).toContain("历史会话为只读");
    composer.props.onSubmit("must not send");
    expect(sendMessage).not.toHaveBeenCalled();
    renderer.root.findByType(Suggestion).props.onSelect("must stay read-only");
    expect(renderer.root.findByType(AgentComposer).props.value).toBe("");
  });
});
