// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { switchToThread, threadListState } = vi.hoisted(() => ({
  switchToThread: vi.fn(async () => undefined),
  threadListState: {
    threads: {
      isLoading: false,
      threadIds: ["live", "history-disabled", "history-regular"],
      threadItems: [
        { id: "live", title: "Current", custom: undefined },
        {
          id: "history-disabled",
          title: "Disabled history",
          custom: { agentUiDisabled: true },
        },
        {
          id: "history-regular",
          title: "Regular history",
          custom: undefined,
        },
      ],
    },
  },
}));

vi.mock("@assistant-ui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@assistant-ui/react")>();
  const React = await import("react");
  const itemState = React.createContext({
    id: "",
    title: "",
    custom: undefined as Record<string, unknown> | undefined,
    isRunning: false,
  });
  const state = () => ({
    ...threadListState,
    threadListItem: React.useContext(itemState),
  });
  const ItemByIndex = ({
    index,
    components,
  }: {
    index: number;
    components: { ThreadListItem: React.ComponentType };
  }) => {
    const id = threadListState.threads.threadIds[index] ?? "";
    const item = threadListState.threads.threadItems.find(
      (candidate) => candidate.id === id,
    ) ?? { id, title: "", custom: undefined };
    return (
      <itemState.Provider
        value={{
          id: item.id,
          title: item.title ?? "",
          custom: item.custom,
          isRunning: false,
        }}
      >
        <components.ThreadListItem />
      </itemState.Provider>
    );
  };
  const asChild = ({ children, ...props }: { children: React.ReactElement; [key: string]: unknown }) =>
    React.cloneElement(children, props);
  const passthrough = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    <div {...props}>{children}</div>;
  return {
    ...actual,
    useAui: () => ({
      threads: {
        switchToThread,
      },
    }),
    useAuiState: (selector: (value: ReturnType<typeof state>) => unknown) =>
      selector(state()),
    AuiIf: ({
      condition,
      children,
    }: {
      condition: (value: ReturnType<typeof state>) => boolean;
      children: React.ReactNode;
    }) => condition(state()) ? children : null,
    ThreadListPrimitive: {
      Root: passthrough,
      New: asChild,
      ItemByIndex,
    },
    ThreadListItemPrimitive: {
      Root: passthrough,
      Trigger: React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
        ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>,
      ),
      Title: () => <>{React.useContext(itemState).title}</>,
      Archive: passthrough,
      Delete: passthrough,
    },
    ThreadListItemMorePrimitive: {
      Root: passthrough,
      Trigger: asChild,
      Content: passthrough,
      Item: passthrough,
    },
  };
});

import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { Button } from "@agent-ui/react";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import { AGENT_UI_THEME_SERVICE } from "../services/agent-ui-theme";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationService,
  type ConversationSnapshot,
  EMPTY_CONVERSATION_SNAPSHOT,
} from "../services/conversations";
import { conversationThreadListPlugin } from "../plugins/conversation-thread-list/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => typeof child === "string" ? child : textContent(child))
    .join("");
}

function conversationService(
  snapshot: ConversationSnapshot,
): ConversationService {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: vi.fn(async () => undefined),
    selectConversation: vi.fn(async () => undefined),
    showLiveConversation: vi.fn(),
    resetForNewConversation: vi.fn(),
  };
}

async function renderPlugin(
  snapshot: ConversationSnapshot,
  status: "idle" | "running" | "awaiting-input" = "idle",
): Promise<{ renderer: ReactTestRenderer; service: ConversationService }> {
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
  const model = parseAppUIRuntimeModel({
    root: { type: "slot", id: "thread-list-root", slotId: "navigation" },
    pluginInstances: {
      service: {
        id: "service",
        pluginId: servicePlugin.manifest.id,
        enabled: true,
      },
      "thread-list": {
        id: "thread-list",
        pluginId: "conversation-thread-list",
        enabled: true,
        mount: { slotId: "navigation" },
      },
    },
  });
  const registry = createPluginRegistry([servicePlugin, conversationThreadListPlugin]);
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

describe("ConversationThreadListPlugin", () => {
  it.each(["idle", "running", "awaiting-input"] as const)(
    "%s exposes the official New Thread control with the expected navigation state",
    async (status) => {
      const mounted = await renderPlugin(EMPTY_CONVERSATION_SNAPSHOT, status);
      try {
        const newThread = mounted.renderer.root.findAllByType(Button).find(
          (button) => textContent(button) === "New Thread",
        );
        expect(newThread).toBeDefined();
        expect(newThread?.props.disabled).toBe(status !== "idle");
      } finally {
        await act(async () => mounted.renderer.unmount());
      }
    },
  );

  it("projects disabled history as an inert row while leaving regular history active", async () => {
    const mounted = await renderPlugin(EMPTY_CONVERSATION_SNAPSHOT);
    try {
      const disabledRows = mounted.renderer.root.findAllByProps({
        "aria-disabled": true,
      });
      expect(disabledRows).toHaveLength(1);
      expect(disabledRows[0]?.props.inert).toBe(true);
      expect(textContent(disabledRows[0]!)).toContain("Disabled history");
      expect(
        mounted.renderer.root.findAllByProps({ "aria-disabled": true }).some(
          (row) => textContent(row).includes("Regular history"),
        ),
      ).toBe(false);
    } finally {
      await act(async () => mounted.renderer.unmount());
    }
  });

  it("scopes unsupported item actions to the product plugin", async () => {
    const css = await readFile(
      path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "../plugins/conversation-thread-list/styles.css",
      ),
      "utf8",
    );
    expect(css).toContain(
      ".conversation-thread-list-plugin\n  [data-slot=\"aui_thread-list-item-more\"]",
    );
    expect(css).toContain("display: none");
  });

  it("declares theme as optional while requiring conversation data", () => {
    expect(conversationThreadListPlugin.inject).toEqual([
      AGENT_UI_CONVERSATION_SERVICE,
    ]);
    expect(conversationThreadListPlugin.optionalInject).toEqual([
      AGENT_UI_THEME_SERVICE,
    ]);
  });

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
      expect(switchToThread).toHaveBeenCalledOnce();
      expect(switchToThread).toHaveBeenCalledWith(
        "history-broken",
      );
      expect(mounted.service.selectConversation).not.toHaveBeenCalled();
    } finally {
      await act(async () => mounted.renderer.unmount());
    }
  });

  it.each(["running", "awaiting-input"] as const)(
    "disables detail retry while %s navigation is locked",
    async (status) => {
      const mounted = await renderPlugin(
        {
          ...EMPTY_CONVERSATION_SNAPSHOT,
          detailStatus: "error",
          detailError: "offline",
          detailErrorConversationId: "history-broken",
        },
        status,
      );
      try {
        const retry = mounted.renderer.root.findAllByType(Button).find(
          (button) => textContent(button) === "重试",
        );
        expect(retry?.props.disabled).toBe(true);
      } finally {
        await act(async () => mounted.renderer.unmount());
      }
    },
  );
});
