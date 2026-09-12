// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { Button } from "../agent-ui/primitives/button";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
  type ConversationSnapshot,
  EMPTY_CONVERSATION_SNAPSHOT,
} from "../services/conversations";
import { assistantUiThreadListPlugin } from "../plugins/assistant-ui-thread-list/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

vi.mock(
  "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx",
  () => ({
    ThreadList: () => <div data-slot="aui_thread-list-root" />,
  }),
);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => typeof child === "string" ? child : textContent(child))
    .join("");
}

function conversationService(
  snapshot: ConversationSnapshot,
): AgentUIConversationService {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: vi.fn(async () => undefined),
    selectConversation: vi.fn(async () => undefined),
    showLiveConversation: vi.fn(),
    startNewConversation: vi.fn(async () => undefined),
  };
}

async function renderPlugin(
  snapshot: ConversationSnapshot,
  status: "idle" | "running" | "awaiting-input" = "idle",
): Promise<{ renderer: ReactTestRenderer; service: AgentUIConversationService }> {
  const service = conversationService(snapshot);
  const servicePlugin: UIPluginDefinition = {
    manifest: {
      id: "test-assistant-ui-conversation-service",
      name: "Test Assistant UI Conversation Service",
      description: "Provides a deterministic conversation snapshot.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_SERVICE],
    setup: ({ services }) => {
      services.provide(AGENT_UI_CONVERSATION_SERVICE, service);
    },
    Component: () => null,
  };
  const model = parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "thread-list-root", slotId: "navigation" },
    pluginInstances: {
      service: {
        id: "service",
        pluginId: servicePlugin.manifest.id,
        enabled: true,
      },
      "thread-list": {
        id: "thread-list",
        pluginId: "assistant-ui-thread-list",
        enabled: true,
        mount: { slotId: "navigation" },
      },
    },
  });
  const registry = createPluginRegistry([servicePlugin, assistantUiThreadListPlugin]);
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={{
          sendMessage: async () => undefined,
          resumeInterrupts: async () => undefined,
          startNewConversation: async () => undefined,
          abortRun: () => undefined,
          updateInstanceProps: vi.fn(),
        }}
        conversation={{ id: "live" }}
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
    await Promise.resolve();
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return { renderer, service };
}

describe("AssistantUiThreadListPlugin", () => {
  it("renders list and detail errors independently and retries the failed conversation", async () => {
    const snapshot: ConversationSnapshot = {
      ...EMPTY_CONVERSATION_SNAPSHOT,
      listStatus: "error",
      listError: "list failed",
      detailStatus: "error",
      detailError: "Conversation API request failed (500)",
      detailErrorConversationId: "history-broken",
    };
    const mounted = await renderPlugin(snapshot);
    try {
      const alerts = mounted.renderer.root.findAllByProps({ role: "alert" });
      expect(alerts).toHaveLength(2);
      expect(textContent(alerts[0]!)).toContain("加载会话失败");
      expect(textContent(alerts[1]!)).toContain("历史会话加载失败");
      expect(textContent(alerts[1]!)).toContain(
        "Conversation API request failed (500)",
      );
      expect(
        mounted.renderer.root.findByProps({
          "data-slot": "agent-ui-thread-detail-error",
        }),
      ).toBeDefined();

      const retry = alerts[1]?.findAllByType(Button)[0];
      if (retry === undefined) throw new Error("Detail retry button was not found");
      await act(async () => {
        retry.props.onClick();
        await Promise.resolve();
      });
      expect(mounted.service.selectConversation).toHaveBeenCalledOnce();
      expect(mounted.service.selectConversation).toHaveBeenCalledWith(
        "history-broken",
      );
    } finally {
      await act(async () => mounted.renderer.unmount());
    }
  });

  it("disables detail retry while navigation is locked", async () => {
    const mounted = await renderPlugin(
      {
        ...EMPTY_CONVERSATION_SNAPSHOT,
        detailStatus: "error",
        detailError: "offline",
        detailErrorConversationId: "history-broken",
      },
      "awaiting-input",
    );
    try {
      const retry = mounted.renderer.root.findAllByType(Button).find(
        (button) => textContent(button) === "重试",
      );
      expect(retry?.props.disabled).toBe(true);
    } finally {
      await act(async () => mounted.renderer.unmount());
    }
  });
});
