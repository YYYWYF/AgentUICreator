import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentMessage as AgentMessageSurface } from "../agent-ui/components/message";
import { AgentThread as AgentThreadSurface } from "../agent-ui/components/thread";
import { AgentUIRootContext } from "../agent-ui/foundation/context";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentMessage,
  AgentRunState,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { agentMessageListPlugin } from "../plugins/agent-message-list/definition";
import { agentMessageAttachmentsPlugin } from "../plugins/agent-message-attachments/definition";
import { agentMessageSourcesPlugin } from "../plugins/agent-message-sources/definition";
import {
  useMessageAttachmentsRenderContext,
  useMessageSourcesRenderContext,
  useReasoningRenderContext,
  useToolActivityRenderContext,
} from "../runtime/message-rendering";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
  type ConversationSnapshot,
} from "../services/conversations";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const idleRun: AgentRunState = { status: "idle" };

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function ReasoningFixture() {
  const context = useReasoningRenderContext();
  return (
    <span
      data-testid="reasoning-fixture"
      data-kind={context.kind}
      data-running={context.running}
      data-turn-id={context.turnId}
    >
      {context.message.content}
    </span>
  );
}

function ToolActivityFixture() {
  const context = useToolActivityRenderContext();
  return (
    <span
      data-testid="tool-activity-fixture"
      data-active-tool-count={context.activeToolCallIds.length}
      data-item-count={context.items.length}
      data-kind={context.kind}
      data-presentation={context.presentation}
      data-status={context.status}
      data-turn-id={context.turnId}
    >
      tool activity
    </span>
  );
}

function CustomAttachmentsFixture() {
  const context = useMessageAttachmentsRenderContext();
  return <span data-testid="custom-attachments">custom:{context.items[0]?.name}</span>;
}

function CustomSourcesFixture() {
  const context = useMessageSourcesRenderContext();
  return <span data-testid="custom-sources">custom:{context.items[0]?.title}</span>;
}

const reasoningFixturePlugin: UIPluginDefinition = {
  manifest: {
    id: "reasoning-fixture",
    name: "Reasoning Fixture",
    description: "Renders the reasoning message context for integration tests.",
    version: "1.0.0",
  },
  Component: ReasoningFixture,
};

const toolActivityFixturePlugin: UIPluginDefinition = {
  manifest: {
    id: "tool-activity-fixture",
    name: "Tool Activity Fixture",
    description: "Renders the tool activity context for integration tests.",
    version: "1.0.0",
  },
  Component: ToolActivityFixture,
};

const customAttachmentsFixturePlugin: UIPluginDefinition = {
  manifest: {
    id: "custom-attachments-fixture",
    name: "Custom Attachments Fixture",
    description: "Replaces only the attachments Message Part.",
    version: "1.0.0",
  },
  Component: CustomAttachmentsFixture,
};

const customSourcesFixturePlugin: UIPluginDefinition = {
  manifest: {
    id: "custom-sources-fixture",
    name: "Custom Sources Fixture",
    description: "Replaces only the sources Message Part.",
    version: "1.0.0",
  },
  Component: CustomSourcesFixture,
};

type PartRendererSelection = "default" | "custom" | "disabled" | "missing";

function createMessageModel(
  includeHistoryService = false,
  includeReasoningRenderer = true,
  includeToolActivityRenderer = true,
  attachmentRenderer: PartRendererSelection = "default",
  sourcesRenderer: PartRendererSelection = "default",
) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "slot",
      id: "message-list-node",
      slotId: "conversation.timeline",
    },
    pluginInstances: {
      ...(includeHistoryService
        ? {
            "history-service-main": {
              id: "history-service-main",
              pluginId: "history-service-fixture",
              enabled: true,
            },
          }
        : {}),
      "agent-messages-main": {
        id: "agent-messages-main",
        pluginId: "agent-message-list",
        enabled: true,
        mount: { slotId: "conversation.timeline" },
      },
      ...(includeReasoningRenderer
        ? {
            "reasoning-fixture-main": {
              id: "reasoning-fixture-main",
              pluginId: "reasoning-fixture",
              enabled: true,
              mount: { slotId: "conversation.message.reasoning" },
            },
          }
        : {}),
      ...(includeToolActivityRenderer
        ? {
            "tool-activity-fixture-main": {
              id: "tool-activity-fixture-main",
              pluginId: "tool-activity-fixture",
              enabled: true,
              mount: { slotId: "conversation.message.tool-activity" },
            },
          }
        : {}),
      ...(attachmentRenderer === "missing"
        ? {}
        : {
            "message-attachments-main": {
              id: "message-attachments-main",
              pluginId:
                attachmentRenderer === "custom"
                  ? "custom-attachments-fixture"
                  : "agent-message-attachments",
              enabled: attachmentRenderer !== "disabled",
              mount: { slotId: "conversation.message.attachments" },
            },
          }),
      ...(sourcesRenderer === "missing"
        ? {}
        : {
            "message-sources-main": {
              id: "message-sources-main",
              pluginId:
                sourcesRenderer === "custom"
                  ? "custom-sources-fixture"
                  : "agent-message-sources",
              enabled: sourcesRenderer !== "disabled",
              mount: { slotId: "conversation.message.sources" },
            },
          }),
    },
  });
}

function historyServicePlugin(
  historyMessages: readonly AgentMessage[],
  detailStatus: ConversationSnapshot["detailStatus"] = "ready",
  detailError?: string,
): UIPluginDefinition {
  const snapshot: ConversationSnapshot = {
    mode: "history",
    conversations: [{ id: "history", title: "History" }],
    activeConversationId: "history",
    historyMessages: [...historyMessages],
    listStatus: "ready",
    detailStatus,
    ...(detailError === undefined ? {} : { detailError }),
  };
  const service: AgentUIConversationService = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    selectConversation: async () => undefined,
    showLiveConversation: () => undefined,
    startNewConversation: async () => undefined,
  };

  return {
    manifest: {
      id: "history-service-fixture",
      name: "History Service Fixture",
      description: "Provides a fixed history snapshot for integration tests.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_SERVICE],
    setup: ({ services }) => {
      services.provide(AGENT_UI_CONVERSATION_SERVICE, service);
    },
    Component: () => null,
  };
}

interface MountedMessageList {
  renderer: ReactTestRenderer;
  dispose(): Promise<void>;
}

async function mountMessageList({
  historyDetailError,
  historyDetailStatus,
  historyMessages,
  includeReasoningRenderer = true,
  includeToolActivityRenderer = true,
  attachmentRenderer = "default",
  sourcesRenderer = "default",
  messages,
  run = idleRun,
}: {
  historyDetailError?: string | undefined;
  historyDetailStatus?: ConversationSnapshot["detailStatus"] | undefined;
  historyMessages?: readonly AgentMessage[] | undefined;
  includeReasoningRenderer?: boolean | undefined;
  includeToolActivityRenderer?: boolean | undefined;
  attachmentRenderer?: PartRendererSelection | undefined;
  sourcesRenderer?: PartRendererSelection | undefined;
  messages: readonly AgentMessage[];
  run?: AgentRunState | undefined;
}): Promise<MountedMessageList> {
  const includeHistoryService = historyMessages !== undefined;
  const model = createMessageModel(
    includeHistoryService,
    includeReasoningRenderer,
    includeToolActivityRenderer,
    attachmentRenderer,
    sourcesRenderer,
  );
  const definitions: UIPluginDefinition[] = [
    agentMessageListPlugin,
    reasoningFixturePlugin,
    toolActivityFixturePlugin,
    agentMessageAttachmentsPlugin,
    agentMessageSourcesPlugin,
    customAttachmentsFixturePlugin,
    customSourcesFixturePlugin,
    ...(historyMessages === undefined
      ? []
      : [
          historyServicePlugin(
            historyMessages,
            historyDetailStatus,
            historyDetailError,
          ),
        ]),
  ];
  const registry = createPluginRegistry(definitions);
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(model, registry, runtimeActions);
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <AgentUIRootContext.Provider value={{ portalContainer: null }}>
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginRuntimeFixture
            actions={runtimeActions}
            conversation={{ id: "live" }}
            executions={[]}
            interrupts={[]}
            messages={[...messages]}
            model={model}
            registry={registry}
            run={run}
            state={{}}
          />
        </PluginServiceRuntimeContext.Provider>
      </AgentUIRootContext.Provider>,
    );
  });

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Message list renderer was not created");
  }

  return {
    renderer,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
}

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
}

function closestAgentMessage(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current !== null) {
    if (current.type === AgentMessageSurface) return current;
    current = current.parent;
  }
  throw new Error("Fixture was not rendered inside AgentMessage");
}

describe("Agent Message runtime binding", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("renders live user and assistant text through AgentMessage", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "user-live",
          producer: { type: "root" },
          role: "user",
          content: "你好",
        },
        {
          id: "assistant-live",
          producer: { type: "root" },
          role: "assistant",
          content: "你好，有什么可以帮你？\n第二行",
        },
        {
          id: "assistant-live-follow-up",
          producer: { type: "root" },
          role: "assistant",
          content: "补充说明",
        },
      ],
    });

    try {
      expect(
        mounted.renderer.root.findAllByType(AgentThreadSurface),
      ).toHaveLength(1);
      const messages = mounted.renderer.root.findAllByType(AgentMessageSurface);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.props.role).toBe("user");
      expect(messages[0]?.props.status).toBeUndefined();
      expect(textContent(messages[0]!)).toContain("你好");
      expect(messages[1]?.props.role).toBe("assistant");
      expect(messages[1]?.props.status).toBe("complete");
      expect(messages[1]?.props.actions).toBeDefined();
      expect(messages[1]?.props.actions.props.text).toBe(
        "你好，有什么可以帮你？\n第二行\n\n补充说明",
      );
      expect(textContent(messages[1]!)).toContain("智能体");
      expect(textContent(messages[1]!)).toContain(
        "你好，有什么可以帮你？\n第二行",
      );
      expect(
        messages[1]?.findAllByProps({
          className: "agent-message-list-text",
        }),
      ).toHaveLength(2);
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-attachments",
      })).toHaveLength(0);
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-sources",
      })).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });

  it("marks only the last live assistant turn as streaming", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "user-complete",
          producer: { type: "root" },
          role: "user",
          content: "第一轮",
        },
        {
          id: "assistant-complete",
          producer: { type: "root" },
          role: "assistant",
          content: "第一轮完成",
        },
        {
          id: "user-running",
          producer: { type: "root" },
          role: "user",
          content: "第二轮",
        },
        {
          id: "assistant-running",
          producer: { type: "root" },
          role: "assistant",
          content: "正在回答",
        },
      ],
      run: { status: "running" },
    });

    try {
      const assistants = mounted.renderer.root
        .findAllByType(AgentMessageSurface)
        .filter((message) => message.props.role === "assistant");
      expect(assistants).toHaveLength(2);
      expect(assistants[0]?.props.status).toBe("complete");
      expect(assistants[1]?.props.status).toBe("streaming");
      expect(textContent(assistants[1]!)).toContain("智能体正在处理…");
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps a streaming assistant surface before the first response token", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "user-before-token",
          producer: { type: "root" },
          role: "user",
          content: "开始处理",
        },
      ],
      run: { status: "running" },
    });

    try {
      const messages = mounted.renderer.root.findAllByType(AgentMessageSurface);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.props.role).toBe("user");
      expect(messages[1]?.props.role).toBe("assistant");
      expect(messages[1]?.props.status).toBe("streaming");
      expect(textContent(messages[1]!)).toContain("智能体正在处理…");
    } finally {
      await mounted.dispose();
    }
  });

  it("never marks history messages as streaming", async () => {
    const historyMessages: AgentMessage[] = [
      {
        id: "history-user",
        producer: { type: "root" },
        role: "user",
        content: [
          { type: "text", text: "历史问题" },
          { type: "file", filename: "history.pdf" },
        ],
      },
      {
        id: "history-assistant",
        producer: { type: "root" },
        role: "assistant",
        content: "历史回答",
        metadata: { sources: [{ title: "History source" }] },
      },
    ];
    const mounted = await mountMessageList({
      historyMessages,
      messages: [],
      run: { status: "running" },
    });

    try {
      const assistant = mounted.renderer.root
        .findAllByType(AgentMessageSurface)
        .find((message) => message.props.role === "assistant");
      expect(assistant?.props.status).toBe("complete");
      expect(textContent(assistant!)).toContain("历史回答");
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-attachments",
      })).toHaveLength(1);
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-sources",
      })).toHaveLength(1);
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps leading system and developer context out of ordinary chat", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "internal-system",
          producer: { type: "root" },
          role: "system",
          content: "SYSTEM SECRET CONTEXT",
        },
        {
          id: "internal-developer",
          producer: { type: "root" },
          role: "developer",
          content: "DEVELOPER SECRET CONTEXT",
        },
        {
          id: "visible-user",
          producer: { type: "root" },
          role: "user",
          content: "用户问题",
        },
        {
          id: "visible-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "智能体回答",
        },
      ],
    });

    try {
      const messages = mounted.renderer.root.findAllByType(AgentMessageSurface);
      const output = textContent(mounted.renderer.root);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.props.role).toBe("user");
      expect(messages[1]?.props.role).toBe("assistant");
      expect(textContent(messages[0]!)).toContain("用户问题");
      expect(textContent(messages[1]!)).toContain("智能体回答");
      expect(output).not.toContain("SYSTEM SECRET CONTEXT");
      expect(output).not.toContain("DEVELOPER SECRET CONTEXT");
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps leading internal context hidden in history mode", async () => {
    const historyMessages: AgentMessage[] = [
      {
        id: "history-internal-system",
        producer: { type: "root" },
        role: "system",
        content: "HISTORY SYSTEM SECRET CONTEXT",
      },
      {
        id: "history-internal-developer",
        producer: { type: "root" },
        role: "developer",
        content: "HISTORY DEVELOPER SECRET CONTEXT",
      },
      {
        id: "history-visible-user",
        producer: { type: "root" },
        role: "user",
        content: "历史用户问题",
      },
      {
        id: "history-visible-assistant",
        producer: { type: "root" },
        role: "assistant",
        content: "历史智能体回答",
      },
    ];
    const mounted = await mountMessageList({
      historyMessages,
      messages: [],
      run: { status: "running" },
    });

    try {
      const messages = mounted.renderer.root.findAllByType(AgentMessageSurface);
      const output = textContent(mounted.renderer.root);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.props.role).toBe("user");
      expect(messages[1]?.props.role).toBe("assistant");
      expect(textContent(messages[0]!)).toContain("历史用户问题");
      expect(textContent(messages[1]!)).toContain("历史智能体回答");
      expect(output).not.toContain("HISTORY SYSTEM SECRET CONTEXT");
      expect(output).not.toContain("HISTORY DEVELOPER SECRET CONTEXT");
    } finally {
      await mounted.dispose();
    }
  });

  it("renders Runtime user attachments once through the default Message Part plugin", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "user-with-attachment",
          producer: { type: "root" },
          role: "user",
          content: [
            { type: "text", text: "查看附件" },
            {
              type: "image",
              filename: "runtime-screenshot.png",
              source: {
                type: "url",
                value: "https://example.com/runtime-screenshot.png",
              },
            },
          ],
        },
      ],
    });

    try {
      const attachments = mounted.renderer.root.findByProps({
        "data-ui-plugin": "agent-message-attachments",
      });
      expect(textContent(attachments)).toContain("runtime-screenshot.png");
      expect(
        attachments.findByProps({
          "data-slot": "agent-attachment",
        }).props["data-kind"],
      ).toBe("image");
      expect(mounted.renderer.root.findAllByProps({
        "data-slot": "agent-attachment",
      })).toHaveLength(1);
      expect(mounted.renderer.root.findAllByProps({
        "data-slot": "agent-message-attachments-fallback",
      })).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });

  it("renders Runtime assistant sources once through the default Message Part plugin", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "assistant-with-sources",
          producer: { type: "root" },
          role: "assistant",
          content: "参考以下资料",
          metadata: {
            sources: [
              {
                title: "AG-UI",
                url: "https://example.com/protocol",
                description: "Protocol reference",
              },
            ],
          },
        },
      ],
    });

    try {
      const sources = mounted.renderer.root.findByProps({
        "data-ui-plugin": "agent-message-sources",
      });
      expect(textContent(sources)).toContain("来源 · 1");
      expect(textContent(sources)).toContain("AG-UI");
      expect(textContent(sources)).toContain("Protocol reference");
      expect(mounted.renderer.root.findAllByProps({
        "data-slot": "agent-source",
      })).toHaveLength(1);
      expect(mounted.renderer.root.findAllByProps({
        "data-slot": "agent-message-sources-fallback",
      })).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });

  it("replaces attachments independently while keeping default sources", async () => {
    const mounted = await mountMessageList({
      attachmentRenderer: "custom",
      messages: [
        {
          id: "custom-attachment-user",
          producer: { type: "root" },
          role: "user",
          content: [
            { type: "text", text: "Attachment" },
            { type: "image", filename: "custom.png" },
          ],
        },
        {
          id: "default-source-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "Source",
          metadata: { sources: [{ title: "Default source" }] },
        },
      ],
    });

    try {
      expect(textContent(mounted.renderer.root.findByProps({
        "data-testid": "custom-attachments",
      }))).toContain("custom:custom.png");
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-attachments",
      })).toHaveLength(0);
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-sources",
      })).toHaveLength(1);
    } finally {
      await mounted.dispose();
    }
  });

  it("sanitizes attachment and source URLs before child renderers receive them", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "unsafe-attachment-user",
          producer: { type: "root" },
          role: "user",
          content: [{ type: "image", filename: "unsafe.png", url: "data:image/png;base64,abc" }],
        },
        {
          id: "unsafe-source-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "Unsafe source",
          metadata: { sources: [{ title: "Unsafe docs", url: "javascript:alert(1)" }] },
        },
      ],
    });

    try {
      const attachments = mounted.renderer.root.findByProps({
        "data-ui-plugin": "agent-message-attachments",
      });
      const sources = mounted.renderer.root.findByProps({
        "data-ui-plugin": "agent-message-sources",
      });
      expect(attachments.findAllByType("a")).toHaveLength(0);
      expect(sources.findAllByType("a")).toHaveLength(0);
      expect(textContent(attachments)).toContain("unsafe.png");
      expect(textContent(sources)).toContain("Unsafe docs");
    } finally {
      await mounted.dispose();
    }
  });

  it("replaces sources independently while keeping default attachments", async () => {
    const mounted = await mountMessageList({
      sourcesRenderer: "custom",
      messages: [
        {
          id: "default-attachment-user",
          producer: { type: "root" },
          role: "user",
          content: [{ type: "image", filename: "default.png" }],
        },
        {
          id: "custom-source-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "Source",
          metadata: { sources: [{ title: "Custom source" }] },
        },
      ],
    });

    try {
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-attachments",
      })).toHaveLength(1);
      expect(textContent(mounted.renderer.root.findByProps({
        "data-testid": "custom-sources",
      }))).toContain("custom:Custom source");
      expect(mounted.renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-sources",
      })).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps attachments and sources visible when renderers are disabled or missing", async () => {
    const mounted = await mountMessageList({
      attachmentRenderer: "disabled",
      sourcesRenderer: "missing",
      messages: [
        {
          id: "fallback-attachment-user",
          producer: { type: "root" },
          role: "user",
          content: [{ type: "file", filename: "fallback.pdf", url: "javascript:alert(1)" }],
        },
        {
          id: "fallback-source-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "Source",
          metadata: {
            sources: [{
              title: "Fallback source",
              url: "file:///private/source",
              description: "Preserved description",
            }],
          },
        },
      ],
    });

    try {
      const attachments = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-attachments-fallback",
      });
      expect(textContent(attachments)).toContain("fallback.pdf");
      expect(attachments.findAllByType("a")).toHaveLength(0);
      const sources = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-sources-fallback",
      });
      expect(textContent(sources)).toContain("Fallback source");
      expect(textContent(sources)).toContain("Preserved description");
      expect(sources.findAllByType("a")).toHaveLength(0);
    } finally {
      await mounted.dispose();
    }
  });

  it("renders the configured local empty fallback", async () => {
    const mounted = await mountMessageList({ messages: [] });

    try {
      expect(
        textContent(
          mounted.renderer.root.findByProps({
            "data-slot": "agent-message-empty",
          }),
        ),
      ).toBe("开始一段新对话");
    } finally {
      await mounted.dispose();
    }
  });

  it("renders history loading through the local status presentation", async () => {
    const mounted = await mountMessageList({
      historyDetailStatus: "loading",
      historyMessages: [],
      messages: [],
    });

    try {
      const loading = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-loading",
      });
      expect(loading.props.role).toBe("status");
      expect(textContent(loading)).toContain("历史会话加载中");
      expect(loading.findAllByProps({ "data-slot": "spinner" })).toHaveLength(
        1,
      );
    } finally {
      await mounted.dispose();
    }
  });

  it("renders history errors through the local alert presentation", async () => {
    const mounted = await mountMessageList({
      historyDetailError: "历史会话读取失败",
      historyDetailStatus: "error",
      historyMessages: [],
      messages: [],
    });

    try {
      const error = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-error",
      });
      expect(error.props.role).toBe("alert");
      expect(textContent(error)).toBe("历史会话读取失败");
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps reasoning and tool activity providers inside one assistant message", async () => {
    const mounted = await mountMessageList({
      messages: [
        {
          id: "compound-user",
          producer: { type: "root" },
          role: "user",
          content: "检查项目",
        },
        {
          id: "compound-reasoning",
          producer: { type: "root" },
          role: "reasoning",
          content: "读取项目结构",
        },
        {
          id: "compound-tool-call-message",
          producer: { type: "root" },
          role: "assistant",
          toolCalls: [
            {
              id: "compound-tool-call",
              type: "function",
              function: { name: "inspect_project", arguments: "{}" },
            },
          ],
        },
        {
          id: "compound-tool-result",
          producer: { type: "root" },
          role: "tool",
          toolCallId: "compound-tool-call",
          content: "done",
        },
        {
          id: "compound-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "检查完成",
        },
      ],
    });

    try {
      const reasoning = mounted.renderer.root.findByProps({
        "data-testid": "reasoning-fixture",
      });
      const toolActivity = mounted.renderer.root.findByProps({
        "data-testid": "tool-activity-fixture",
      });
      expect(reasoning.props["data-kind"]).toBe("reasoning");
      expect(reasoning.props["data-turn-id"]).toBe("compound-user");
      expect(reasoning.props["data-running"]).toBe(false);
      expect(toolActivity.props["data-kind"]).toBe("tool-activity");
      expect(toolActivity.props["data-turn-id"]).toBe("compound-user");
      expect(toolActivity.props["data-presentation"]).toBe("grouped");
      expect(toolActivity.props["data-item-count"]).toBe(1);
      expect(toolActivity.props["data-status"]).toBe("completed");
      expect(closestAgentMessage(reasoning).props.role).toBe("assistant");
      expect(closestAgentMessage(toolActivity).props.role).toBe("assistant");
      expect(closestAgentMessage(reasoning)).toBe(
        closestAgentMessage(toolActivity),
      );
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps reasoning readable when no child renderer is configured", async () => {
    const mounted = await mountMessageList({
      includeReasoningRenderer: false,
      messages: [
        {
          id: "fallback-user",
          producer: { type: "root" },
          role: "user",
          content: "分析项目",
        },
        {
          id: "fallback-reasoning",
          producer: { type: "root" },
          role: "reasoning",
          content: "保留这段推理内容",
        },
      ],
    });

    try {
      const fallback = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-reasoning-fallback",
      });
      expect(textContent(fallback)).toContain("思考");
      expect(textContent(fallback)).toContain("保留这段推理内容");
    } finally {
      await mounted.dispose();
    }
  });

  it("keeps tool activity readable when no activity renderer is configured", async () => {
    const mounted = await mountMessageList({
      includeToolActivityRenderer: false,
      messages: [
        {
          id: "fallback-tool-user",
          producer: { type: "root" },
          role: "user",
          content: "执行工具",
        },
        {
          id: "fallback-tool-call-message",
          producer: { type: "root" },
          role: "assistant",
          toolCalls: [{
            id: "fallback-tool-call",
            type: "function",
            function: { name: "inspect_project", arguments: "{}" },
          }],
        },
        {
          id: "fallback-tool-result",
          producer: { type: "root" },
          role: "tool",
          toolCallId: "fallback-tool-call",
          content: "project inspected",
        },
      ],
    });

    try {
      const fallback = mounted.renderer.root.findByProps({
        "data-slot": "agent-message-tool-activity-fallback",
      });
      expect(textContent(fallback)).toContain("工具活动");
      expect(textContent(fallback)).toContain("inspect_project");
      expect(textContent(fallback)).toContain("project inspected");
      expect(fallback.findAllByProps({
        "data-slot": "agent-message-tool-activity-fallback-item",
      })).toHaveLength(1);
    } finally {
      await mounted.dispose();
    }
  });
});
