// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  AgentConversationGroup,
  AgentConversationItem,
  AgentConversationList,
  AgentConversationState,
} from "../agent-ui/components/conversation-list";
import { Button } from "../agent-ui/primitives/button";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { agentConversationsPlugin } from "../plugins/agent-conversations/definition";
import { conversationControllerPlugin } from "../plugins/conversation-controller/definition";
import {
  AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE,
  type ConversationDataSource,
  type ConversationSummary,
} from "../services/conversations";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => typeof child === "string" ? child : textContent(child))
    .join("");
}

interface RenderOptions {
  conversations?: ConversationSummary[];
  list?: ConversationDataSource["list"];
  startNewConversation?: () => Promise<void>;
  status?: "idle" | "running";
}

async function renderPlugin({
  conversations = [
    { id: "A", title: "产品规划讨论", group: "产品" },
    { id: "B", title: "修复登录问题", group: "开发" },
    { id: "C", title: "UI 设计评审" },
    { id: "disabled", title: "不可用会话", disabled: true },
  ],
  list = async () => conversations,
  startNewConversation = async () => undefined,
  status = "idle",
}: RenderOptions = {}): Promise<{
  renderer: ReactTestRenderer;
  list: ReturnType<typeof vi.fn<ConversationDataSource["list"]>>;
  select: ReturnType<typeof vi.fn<ConversationDataSource["get"]>>;
  startNewConversation: ReturnType<typeof vi.fn<() => Promise<void>>>;
  dispose(): Promise<void>;
}> {
  const listSpy = vi.fn(list);
  const selectSpy = vi.fn(async (id: string) => ({
    id,
    title: id,
    messages: [],
  }));
  const startSpy = vi.fn(startNewConversation);
  const dataSource: ConversationDataSource = {
    list: listSpy,
    get: selectSpy,
  };
  const dataSourcePlugin: UIPluginDefinition = {
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
      "conversation-controller": {
        id: "conversation-controller",
        pluginId: "conversation-controller",
        enabled: true,
      },
      "conversations-main": {
        id: "conversations-main",
        pluginId: "agent-conversations",
        enabled: true,
        mount: { slotId: "conversations" },
      },
    },
  });
  const registry = createPluginRegistry([
    dataSourcePlugin,
    conversationControllerPlugin,
    agentConversationsPlugin,
  ]);
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={{
          sendMessage: async () => undefined,
          resumeInterrupts: async () => undefined,
          startNewConversation: startSpy,
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
    await Promise.resolve();
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return {
    renderer,
    list: listSpy,
    select: selectSpy,
    startNewConversation: startSpy,
    dispose: async () => {
      await act(async () => renderer?.unmount());
    },
  };
}

function item(renderer: ReactTestRenderer, title: string): ReactTestInstance {
  return renderer.root.findAllByType(AgentConversationItem).find(
    (candidate) => candidate.props.title === title,
  )!;
}

describe("AgentConversationsPlugin", () => {
  it("renders the canonical AgentConversationList with live active", async () => {
    const mounted = await renderPlugin();
    try {
      expect(mounted.renderer.root.findByType(AgentConversationList)).toBeDefined();
      expect(
        mounted.renderer.root.findByProps({ "data-ui-plugin": "agent-conversations" }),
      ).toBeDefined();
      expect(item(mounted.renderer, "当前会话").props.active).toBe(true);
      expect(item(mounted.renderer, "产品规划讨论").props.active).toBe(false);
    } finally {
      await mounted.dispose();
    }
  });

  it("selects history and returns to the live conversation", async () => {
    const mounted = await renderPlugin();
    try {
      await act(async () => {
        item(mounted.renderer, "修复登录问题").findByType("button").props.onClick();
        await Promise.resolve();
      });
      expect(mounted.select).toHaveBeenCalledWith("B", expect.any(Object));
      expect(item(mounted.renderer, "修复登录问题").props.active).toBe(true);
      expect(item(mounted.renderer, "当前会话").props.active).toBe(false);

      act(() => {
        item(mounted.renderer, "当前会话").findByType("button").props.onClick();
      });
      expect(item(mounted.renderer, "当前会话").props.active).toBe(true);
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps disabled history items inert", async () => {
    const mounted = await renderPlugin();
    try {
      const disabled = item(mounted.renderer, "不可用会话");
      expect(disabled.findByType("button").props.disabled).toBe(true);
      act(() => disabled.findByType("button").props.onClick());
      expect(mounted.select).not.toHaveBeenCalledWith("disabled", expect.anything());
    } finally {
      await mounted.dispose();
    }
  });

  it("starts a new conversation through Runtime and resets the Service after success", async () => {
    const idle = await renderPlugin();
    try {
      const createButton = idle.renderer.root.findAllByType(Button).find(
        (button) => button.props["aria-label"] === "新建会话",
      )!;
      await act(async () => {
        item(idle.renderer, "修复登录问题").findByType("button").props.onClick();
        await Promise.resolve();
      });
      expect(item(idle.renderer, "修复登录问题").props.active).toBe(true);
      await act(async () => {
        createButton.props.onClick();
        await Promise.resolve();
      });
      expect(idle.startNewConversation).toHaveBeenCalledOnce();
      expect(item(idle.renderer, "当前会话").props.active).toBe(true);
      expect(item(idle.renderer, "修复登录问题").props.active).toBe(false);
    } finally {
      await idle.dispose();
    }

    const failed = await renderPlugin({
      startNewConversation: async () => {
        throw new Error("failed to create conversation");
      },
    });
    try {
      await act(async () => {
        item(failed.renderer, "修复登录问题").findByType("button").props.onClick();
        await Promise.resolve();
      });
      const createButton = failed.renderer.root.findAllByType(Button).find(
        (button) => button.props["aria-label"] === "新建会话",
      )!;
      await act(async () => {
        createButton.props.onClick();
        await Promise.resolve();
      });
      expect(failed.startNewConversation).toHaveBeenCalledOnce();
      expect(item(failed.renderer, "修复登录问题").props.active).toBe(true);
      expect(item(failed.renderer, "当前会话").props.active).toBe(false);
    } finally {
      await failed.dispose();
    }

    const running = await renderPlugin({ status: "running" });
    try {
      const createButton = running.renderer.root.findAllByType(Button).find(
        (button) => button.props["aria-label"] === "新建会话",
      )!;
      expect(createButton.props.disabled).toBe(true);
      act(() => createButton.props.onClick());
      expect(running.startNewConversation).not.toHaveBeenCalled();
    } finally {
      await running.dispose();
    }
  });

  it("presents loading, error with retry, and ready empty history without hiding live", async () => {
    const loading = await renderPlugin({ list: () => new Promise(() => undefined) });
    try {
      expect(loading.renderer.root.findByType(AgentConversationState).props.kind)
        .toBe("loading");
      expect(item(loading.renderer, "当前会话")).toBeDefined();
    } finally {
      await loading.dispose();
    }

    const error = await renderPlugin({ list: async () => { throw new Error("offline"); } });
    try {
      const state = error.renderer.root.findByType(AgentConversationState);
      expect(state.props.kind).toBe("error");
      expect(textContent(state)).toContain("offline");
      await act(async () => {
        error.renderer.root.findAllByType(Button).find(
          (button) => textContent(button) === "重试",
        )!.props.onClick();
        await Promise.resolve();
      });
      expect(error.list.mock.calls.length).toBeGreaterThan(1);
    } finally {
      await error.dispose();
    }

    const empty = await renderPlugin({ conversations: [] });
    try {
      expect(item(empty.renderer, "当前会话")).toBeDefined();
      expect(empty.renderer.root.findByType(AgentConversationState).props.kind)
        .toBe("empty");
      expect(textContent(empty.renderer.root)).toContain("暂无历史会话");
    } finally {
      await empty.dispose();
    }
  });

  it("preserves input group order and the default history group", async () => {
    const mounted = await renderPlugin();
    try {
      expect(
        mounted.renderer.root.findAllByType(AgentConversationGroup)
          .map((group) => group.props.label),
      ).toEqual(["当前", "产品", "开发", "历史会话"]);
    } finally {
      await mounted.dispose();
    }
  });
});
