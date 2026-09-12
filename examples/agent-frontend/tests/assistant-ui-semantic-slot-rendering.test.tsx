// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantUiConversationAdapter } from "../agent-ui/adapters/assistant-ui/conversation";
import { Thread } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import {
  ASSISTANT_UI_CONVERSATION_SLOTS,
  type AssistantUiConversationSlotId,
} from "../agent-ui/adapters/assistant-ui/slots/semantic-slots";
import type { AppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { agentMessageListPlugin } from "../plugins/agent-message-list/definition";
import { agentToolActivityPlugin } from "../plugins/agent-tool-activity/definition";
import {
  useMessageAttachmentsRenderContext,
  useMessageSourcesRenderContext,
  useReasoningRenderContext,
  useToolActivityRenderContext,
  useToolRenderContext,
} from "../runtime/message-rendering";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const ROOT_SLOT = "semantic-slot-rendering.root";
const SURFACE_PLUGIN_ID = "semantic-slot-rendering-surface";
const SURFACE_INSTANCE_ID = `${SURFACE_PLUGIN_ID}-main`;
const MESSAGE_LIST_INSTANCE_ID = "semantic-slot-message-list-main";
const TOOL_ACTIVITY_INSTANCE_ID = "semantic-slot-tool-activity-main";
const APP_UI_MODEL_HASH = "a".repeat(64);

const TEST_CHAT_MODEL = {
  run: async () => ({ content: [] }),
} satisfies ChatModelAdapter;

const runtimeActions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
  updateInstanceProps: () => undefined,
};

function WelcomeSentinel() {
  return <div data-testid="welcome-sentinel">WELCOME SENTINEL</div>;
}

function SuggestionsSentinel() {
  return <div data-testid="suggestions-sentinel">SUGGESTIONS SENTINEL</div>;
}

function TimelineSentinel() {
  return <div data-testid="timeline-sentinel">TIMELINE SENTINEL</div>;
}

function ComposerSentinel() {
  return <div data-testid="composer-sentinel">COMPOSER SENTINEL</div>;
}

function ReasoningSentinel() {
  const context = useReasoningRenderContext();
  return (
    <div
      data-testid="reasoning-sentinel"
      data-running={context.running}
      data-turn-id={context.turnId}
    >
      {context.message.content}
    </div>
  );
}

function ToolActivitySentinel() {
  const context = useToolActivityRenderContext();
  return (
    <div
      data-testid="tool-activity-sentinel"
      data-active-tool-call-ids={context.activeToolCallIds.join(",")}
      data-item-count={context.items.length}
      data-status={context.status}
      data-turn-id={context.turnId}
    >
      TOOL ACTIVITY SENTINEL
    </div>
  );
}

function ToolItemSentinel() {
  const context = useToolRenderContext();
  return (
    <div
      data-testid="tool-item-sentinel"
      data-running={context.running}
      data-tool-id={context.toolCall.id}
      data-turn-id={context.turnId}
    >
      {context.toolCall.function.name}
    </div>
  );
}

function AttachmentsSentinel() {
  const context = useMessageAttachmentsRenderContext();
  return (
    <div
      data-testid="attachments-sentinel"
      data-item-count={context.items.length}
      data-name={context.items[0]?.name}
      data-turn-id={context.turnId}
    >
      ATTACHMENTS SENTINEL
    </div>
  );
}

function SourcesSentinel() {
  const context = useMessageSourcesRenderContext();
  return (
    <div
      data-testid="sources-sentinel"
      data-href={context.items[0]?.href}
      data-title={context.items[0]?.title}
      data-turn-id={context.turnId}
    >
      SOURCES SENTINEL
    </div>
  );
}

const SENTINEL_COMPONENTS: Record<
  AssistantUiConversationSlotId,
  UIPluginDefinition["Component"]
> = {
  [ASSISTANT_UI_CONVERSATION_SLOTS.welcome]: WelcomeSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.suggestions]: SuggestionsSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.timeline]: TimelineSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.composer]: ComposerSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.reasoning]: ReasoningSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity]: ToolActivitySentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.toolItem]: ToolItemSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.attachments]: AttachmentsSentinel,
  [ASSISTANT_UI_CONVERSATION_SLOTS.sources]: SourcesSentinel,
};

function sentinelPluginId(slotId: AssistantUiConversationSlotId): string {
  return `semantic-slot-sentinel-${slotId.replaceAll(".", "-")}`;
}

function sentinelInstanceId(slotId: AssistantUiConversationSlotId): string {
  return `${sentinelPluginId(slotId)}-main`;
}

function createSentinelPlugin(
  slotId: AssistantUiConversationSlotId,
): UIPluginDefinition {
  return {
    manifest: {
      id: sentinelPluginId(slotId),
      name: `${slotId} Sentinel`,
      description: `Render-level replacement sentinel for ${slotId}.`,
      version: "1.0.0",
    },
    Component: SENTINEL_COMPONENTS[slotId],
  };
}

function createSurfacePlugin(
  initialMessages: readonly ThreadMessageLike[],
): UIPluginDefinition {
  return {
    manifest: {
      id: SURFACE_PLUGIN_ID,
      name: "Semantic Slot Rendering Surface",
      description: "Test-only assistant-ui semantic Slot owner.",
      version: "1.0.0",
      slots: {
        children: [
          ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
          ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
          ASSISTANT_UI_CONVERSATION_SLOTS.timeline,
          ASSISTANT_UI_CONVERSATION_SLOTS.composer,
        ],
      },
    },
    Component: function SemanticSlotRenderingSurface({ renderSlot }) {
      const assistantRuntime = useLocalRuntime(TEST_CHAT_MODEL, {
        initialMessages,
      });
      return (
        <AssistantRuntimeProvider runtime={assistantRuntime}>
          <AssistantUiConversationAdapter renderSlot={renderSlot} />
        </AssistantRuntimeProvider>
      );
    },
  };
}

interface MountSemanticRuntimeOptions {
  includeMessageList?: boolean;
  includeToolActivity?: boolean;
  initialMessages?: readonly ThreadMessageLike[];
  target?: AssistantUiConversationSlotId;
  targets?: readonly AssistantUiConversationSlotId[];
}

const mountedRenderers: ReactTestRenderer[] = [];

async function mountSemanticRuntime({
  includeMessageList = true,
  includeToolActivity = false,
  initialMessages = [],
  target,
  targets = [],
}: MountSemanticRuntimeOptions = {}): Promise<ReactTestRenderer> {
  const definitions: UIPluginDefinition[] = [
    createSurfacePlugin(initialMessages),
  ];
  const pluginInstances: AppUIModel["pluginInstances"] = {
    [SURFACE_INSTANCE_ID]: {
      id: SURFACE_INSTANCE_ID,
      pluginId: SURFACE_PLUGIN_ID,
      enabled: true,
      mount: { slotId: ROOT_SLOT },
    },
  };

  if (includeMessageList) {
    definitions.push(agentMessageListPlugin);
    pluginInstances[MESSAGE_LIST_INSTANCE_ID] = {
      id: MESSAGE_LIST_INSTANCE_ID,
      pluginId: agentMessageListPlugin.manifest.id,
      enabled: true,
      mount: { slotId: ASSISTANT_UI_CONVERSATION_SLOTS.timeline },
    };
  }

  if (includeToolActivity) {
    definitions.push(agentToolActivityPlugin);
    pluginInstances[TOOL_ACTIVITY_INSTANCE_ID] = {
      id: TOOL_ACTIVITY_INSTANCE_ID,
      pluginId: agentToolActivityPlugin.manifest.id,
      enabled: true,
      mount: { slotId: ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity },
    };
  }

  const targetSlots = new Set(
    target === undefined ? targets : [target, ...targets],
  );
  for (const targetSlot of targetSlots) {
    definitions.push(createSentinelPlugin(targetSlot));
    pluginInstances[sentinelInstanceId(targetSlot)] = {
      id: sentinelInstanceId(targetSlot),
      pluginId: sentinelPluginId(targetSlot),
      enabled: true,
      mount: { slotId: targetSlot },
    };
  }

  const model: AppUIModel = {
    version: "2",
    root: {
      type: "slot",
      id: "semantic-slot-rendering-root",
      slotId: ROOT_SLOT,
    },
    pluginInstances,
  };

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <PluginRuntimeFixture
        actions={runtimeActions}
        appUIModelHash={APP_UI_MODEL_HASH}
        conversation={{ id: "semantic-slot-rendering" }}
        executions={[]}
        interrupts={[]}
        messages={[]}
        model={model}
        registry={createPluginRegistry(definitions)}
        run={{ status: "idle" }}
        state={null}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  if (renderer === undefined) {
    throw new Error("Semantic Slot test renderer was not created.");
  }
  mountedRenderers.push(renderer);
  return renderer;
}

async function mountUpstreamThread(
  initialMessages: readonly ThreadMessageLike[] = [],
): Promise<ReactTestRenderer> {
  function UpstreamThreadFixture() {
    const assistantRuntime = useLocalRuntime(TEST_CHAT_MODEL, {
      initialMessages,
    });
    return (
      <AssistantRuntimeProvider runtime={assistantRuntime}>
        <Thread />
      </AssistantRuntimeProvider>
    );
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<UpstreamThreadFixture />);
    await Promise.resolve();
    await Promise.resolve();
  });
  if (renderer === undefined) {
    throw new Error("Upstream Thread test renderer was not created.");
  }
  mountedRenderers.push(renderer);
  return renderer;
}

function countByTestId(renderer: ReactTestRenderer, testId: string): number {
  return renderer.root.findAllByProps({ "data-testid": testId }).length;
}

function countByDataSlot(renderer: ReactTestRenderer, slot: string): number {
  return renderer.root.findAllByProps({ "data-slot": slot }).length;
}

function countByClassToken(renderer: ReactTestRenderer, token: string): number {
  return renderer.root.findAll((node) => {
    const className = node.props.className;
    return typeof className === "string" &&
      className.split(/\s+/u).includes(token);
  }).length;
}

function findOneByClassToken(renderer: ReactTestRenderer, token: string) {
  const matches = renderer.root.findAll((node) => {
    const className = node.props.className;
    return typeof className === "string" &&
      className.split(/\s+/u).includes(token);
  });
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function renderedText(renderer: ReactTestRenderer): string {
  const visit = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) return value.map(visit).join("");
    if (value !== null && typeof value === "object" && "children" in value) {
      return visit((value as { children?: unknown }).children);
    }
    return "";
  };
  return visit(renderer.toJSON());
}

async function openToolGroup(renderer: ReactTestRenderer): Promise<void> {
  const triggers = renderer.root.findAllByProps({
    "data-slot": "tool-group-trigger",
  });
  expect(triggers).toHaveLength(1);
  await act(async () => {
    triggers[0]!.props.onClick({
      defaultPrevented: false,
      nativeEvent: new MouseEvent("click"),
    });
    await Promise.resolve();
  });
}

function assistantTextMessage(id = "assistant-text"): ThreadMessageLike {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text: "assistant sibling text" }],
    status: { type: "complete", reason: "stop" },
  };
}

function reasoningMessage(): ThreadMessageLike {
  return {
    id: "assistant-reasoning",
    role: "assistant",
    content: [
      {
        type: "reasoning",
        text: "reasoning context content",
        status: { type: "running" },
      },
      { type: "text", text: "assistant sibling text" },
    ],
    status: { type: "running" },
  };
}

function toolMessage(running: boolean): ThreadMessageLike {
  return {
    id: running ? "assistant-tools-running" : "assistant-tools-complete",
    role: "assistant",
    content: [
      { type: "text", text: "tool sibling text" },
      {
        type: "tool-call",
        toolCallId: "tool-a",
        toolName: "alpha_tool",
        args: { value: "a" },
        argsText: '{"value":"a"}',
        ...(running ? {} : { result: { ok: "a" } }),
      },
      {
        type: "tool-call",
        toolCallId: "tool-b",
        toolName: "beta_tool",
        args: { value: "b" },
        argsText: '{"value":"b"}',
        ...(running ? {} : { result: { ok: "b" } }),
      },
    ],
    status: running
      ? { type: "running" }
      : { type: "complete", reason: "stop" },
  };
}

function attachmentMessage(): ThreadMessageLike {
  return {
    id: "user-attachment",
    role: "user",
    content: [{ type: "text", text: "user sibling text" }],
    attachments: [
      {
        id: "attachment-image",
        type: "image",
        name: "diagram.png",
        contentType: "image/png",
        status: { type: "complete" },
        content: [
          {
            type: "image",
            image: "data:image/png;base64,AA==",
            filename: "diagram.png",
          },
        ],
      },
    ],
  };
}

function sourceMessage(): ThreadMessageLike {
  return {
    id: "assistant-source",
    role: "assistant",
    content: [
      { type: "text", text: "source sibling text" },
      {
        type: "source",
        sourceType: "url",
        id: "source-one",
        title: "Semantic Slot Source",
        url: "https://example.com/semantic-slot",
      },
    ],
    status: { type: "complete", reason: "stop" },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  });
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("assistant-ui semantic Slot rendering", () => {
  it("orders the semantic empty state and docks its Composer without sticky positioning", async () => {
    const renderer = await mountSemanticRuntime({
      targets: [
        ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
        ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
        ASSISTANT_UI_CONVERSATION_SLOTS.composer,
      ],
    });
    const text = renderedText(renderer);
    const welcomeIndex = text.indexOf("WELCOME SENTINEL");
    const suggestionsIndex = text.indexOf("SUGGESTIONS SENTINEL");
    const composerIndex = text.indexOf("COMPOSER SENTINEL");

    expect(welcomeIndex).toBeGreaterThanOrEqual(0);
    expect(suggestionsIndex).toBeGreaterThan(welcomeIndex);
    expect(composerIndex).toBeGreaterThan(suggestionsIndex);
    expect(countByTestId(renderer, "suggestions-sentinel")).toBe(1);
    expect(countByTestId(renderer, "composer-sentinel")).toBe(1);

    const content = findOneByClassToken(renderer, "max-w-(--thread-max-width)");
    expect(content.props.className.split(/\s+/u)).not.toContain("justify-center");

    const footer = findOneByClassToken(renderer, "aui-thread-viewport-footer");
    const footerClasses = footer.props.className.split(/\s+/u);
    expect(footerClasses).toContain("mt-auto");
    expect(footerClasses).not.toContain("sticky");
  });

  it("keeps the active conversation Timeline and sticky Composer behavior", async () => {
    const renderer = await mountSemanticRuntime({
      includeMessageList: false,
      initialMessages: [assistantTextMessage()],
      targets: [
        ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
        ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
        ASSISTANT_UI_CONVERSATION_SLOTS.timeline,
        ASSISTANT_UI_CONVERSATION_SLOTS.composer,
      ],
    });

    expect(countByTestId(renderer, "welcome-sentinel")).toBe(0);
    expect(countByTestId(renderer, "suggestions-sentinel")).toBe(0);
    expect(countByTestId(renderer, "timeline-sentinel")).toBe(1);
    expect(countByTestId(renderer, "composer-sentinel")).toBe(1);

    const footer = findOneByClassToken(renderer, "aui-thread-viewport-footer");
    const footerClasses = footer.props.className.split(/\s+/u);
    expect(footerClasses).toContain("mt-auto");
    expect(footerClasses).toContain("sticky");
    expect(footerClasses).toContain("bottom-0");
  });

  it("preserves the centered no-wrapper assistant-ui empty state fallback", async () => {
    const renderer = await mountUpstreamThread();
    const content = findOneByClassToken(renderer, "max-w-(--thread-max-width)");
    const renderedTree = JSON.stringify(renderer.toJSON());

    expect(content.props.className.split(/\s+/u)).toContain("justify-center");
    expect(countByClassToken(renderer, "aui-thread-welcome-suggestions")).toBe(1);
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(1);
    expect(renderedTree.indexOf("aui_composer-shell")).toBeLessThan(
      renderedTree.indexOf("aui-thread-welcome-suggestions"),
    );

    const footer = findOneByClassToken(renderer, "aui-thread-viewport-footer");
    const footerClasses = footer.props.className.split(/\s+/u);
    expect(footerClasses).not.toContain("mt-auto");
    expect(footerClasses).not.toContain("sticky");
  });

  it("replaces Welcome without replacing Initial Suggestions or Composer", async () => {
    const renderer = await mountSemanticRuntime({
      target: ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
    });

    expect(countByTestId(renderer, "welcome-sentinel")).toBe(1);
    expect(renderedText(renderer)).not.toContain("How can I help you today?");
    expect(countByClassToken(renderer, "aui-thread-welcome-suggestions")).toBe(1);
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(1);
  });

  it("replaces Initial Suggestions without replacing Welcome or Composer", async () => {
    const renderer = await mountSemanticRuntime({
      target: ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
    });

    expect(countByTestId(renderer, "suggestions-sentinel")).toBe(1);
    expect(countByClassToken(renderer, "aui-thread-welcome-suggestions")).toBe(0);
    expect(renderedText(renderer)).toContain("How can I help you today?");
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(1);
  });

  it("replaces Timeline as a parent without retaining its message children", async () => {
    const renderer = await mountSemanticRuntime({
      includeMessageList: false,
      initialMessages: [assistantTextMessage()],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.timeline,
    });

    expect(countByTestId(renderer, "timeline-sentinel")).toBe(1);
    expect(countByDataSlot(renderer, "aui_message-group")).toBe(0);
    expect(countByDataSlot(renderer, "aui_assistant-message-root")).toBe(0);
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(1);
  });

  it("replaces Composer once while preserving the empty state and Timeline", async () => {
    const renderer = await mountSemanticRuntime({
      target: ASSISTANT_UI_CONVERSATION_SLOTS.composer,
    });

    expect(countByTestId(renderer, "composer-sentinel")).toBe(1);
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(0);
    expect(renderedText(renderer)).toContain("How can I help you today?");
    expect(countByDataSlot(renderer, "aui_message-group")).toBe(1);
  });

  it("replaces Reasoning once with real context while preserving text and Composer", async () => {
    const renderer = await mountSemanticRuntime({
      initialMessages: [reasoningMessage()],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.reasoning,
    });
    const sentinel = renderer.root.findByProps({
      "data-testid": "reasoning-sentinel",
    });

    expect(countByTestId(renderer, "reasoning-sentinel")).toBe(1);
    expect(sentinel.props["data-running"]).toBe(true);
    expect(sentinel.props["data-turn-id"]).toBe("assistant-reasoning");
    expect(sentinel.props.children).toBe("reasoning context content");
    expect(countByDataSlot(renderer, "reasoning-root")).toBe(0);
    expect(renderedText(renderer)).toContain("assistant sibling text");
    expect(countByDataSlot(renderer, "aui_composer-shell")).toBe(1);
  });

  it("replaces Tool Activity with the running grouped context and preserves text", async () => {
    const renderer = await mountSemanticRuntime({
      initialMessages: [toolMessage(true)],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity,
    });
    const sentinel = renderer.root.findByProps({
      "data-testid": "tool-activity-sentinel",
    });

    expect(countByTestId(renderer, "tool-activity-sentinel")).toBe(1);
    expect(sentinel.props["data-item-count"]).toBe(2);
    expect(sentinel.props["data-status"]).toBe("running");
    expect(sentinel.props["data-active-tool-call-ids"]).toBe("tool-a,tool-b");
    expect(sentinel.props["data-turn-id"]).toBe("assistant-tools-running");
    expect(countByDataSlot(renderer, "tool-group-root")).toBe(0);
    expect(renderedText(renderer)).toContain("tool sibling text");
  });

  it("replaces only Tool Items while preserving assistant-ui ToolGroup", async () => {
    const renderer = await mountSemanticRuntime({
      includeToolActivity: true,
      initialMessages: [toolMessage(false)],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.toolItem,
    });

    expect(countByDataSlot(renderer, "tool-group-root")).toBe(1);
    expect(
      renderer.root.findAllByProps({
        "data-plugin-instance-id": TOOL_ACTIVITY_INSTANCE_ID,
      }),
    ).toHaveLength(1);

    await openToolGroup(renderer);

    const sentinels = renderer.root.findAllByProps({
      "data-testid": "tool-item-sentinel",
    });
    expect(sentinels).toHaveLength(2);
    expect(sentinels.map((sentinel) => sentinel.props["data-tool-id"])).toEqual([
      "tool-a",
      "tool-b",
    ]);
    expect(sentinels.map((sentinel) => sentinel.props.children)).toEqual([
      "alpha_tool",
      "beta_tool",
    ]);
    expect(countByDataSlot(renderer, "tool-fallback-root")).toBe(0);
    expect(renderedText(renderer)).toContain("tool sibling text");
  });

  it("replaces message Attachments with real context while preserving user text", async () => {
    const renderer = await mountSemanticRuntime({
      initialMessages: [attachmentMessage()],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.attachments,
    });
    const sentinel = renderer.root.findByProps({
      "data-testid": "attachments-sentinel",
    });

    expect(countByTestId(renderer, "attachments-sentinel")).toBe(1);
    expect(sentinel.props["data-item-count"]).toBe(1);
    expect(sentinel.props["data-name"]).toBe("diagram.png");
    expect(sentinel.props["data-turn-id"]).toBe("user-attachment");
    expect(
      renderer.root.findAllByProps({ "aria-label": "Image attachment" }),
    ).toHaveLength(0);
    expect(renderedText(renderer)).toContain("user sibling text");
  });

  it("replaces Sources with real context while preserving assistant text", async () => {
    const renderer = await mountSemanticRuntime({
      initialMessages: [sourceMessage()],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.sources,
    });
    const sentinel = renderer.root.findByProps({
      "data-testid": "sources-sentinel",
    });

    expect(countByTestId(renderer, "sources-sentinel")).toBe(1);
    expect(sentinel.props["data-title"]).toBe("Semantic Slot Source");
    expect(sentinel.props["data-href"]).toBe("https://example.com/semantic-slot");
    expect(sentinel.props["data-turn-id"]).toBe("assistant-source");
    expect(renderedText(renderer)).toContain("source sibling text");
  });

  it("suppresses a Sources contribution when the message has no sources", async () => {
    const renderer = await mountSemanticRuntime({
      initialMessages: [assistantTextMessage("assistant-without-source")],
      target: ASSISTANT_UI_CONVERSATION_SLOTS.sources,
    });

    expect(countByTestId(renderer, "sources-sentinel")).toBe(0);
    expect(
      renderer.root.findAllByProps({
        "data-plugin-instance-id": sentinelInstanceId(
          ASSISTANT_UI_CONVERSATION_SLOTS.sources,
        ),
      }),
    ).toHaveLength(0);
    expect(renderedText(renderer)).toContain("assistant sibling text");
  });

  it("renders assistant-ui native leaf presentation when no custom leaf Plugin contributes", async () => {
    const fallbackReasoningAndTools: ThreadMessageLike = {
      id: "assistant-fallbacks",
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "fallback reasoning",
          status: { type: "complete" },
        },
        { type: "text", text: "fallback assistant text" },
        {
          type: "tool-call",
          toolCallId: "tool-a",
          toolName: "alpha_tool",
          args: { value: "a" },
          argsText: '{"value":"a"}',
          result: { ok: "a" },
        },
        {
          type: "tool-call",
          toolCallId: "tool-b",
          toolName: "beta_tool",
          args: { value: "b" },
          argsText: '{"value":"b"}',
          result: { ok: "b" },
        },
      ],
      status: { type: "complete", reason: "stop" },
    };
    const renderer = await mountSemanticRuntime({
      includeToolActivity: true,
      initialMessages: [attachmentMessage(), fallbackReasoningAndTools],
    });

    expect(countByDataSlot(renderer, "reasoning-root")).toBe(1);
    expect(countByDataSlot(renderer, "tool-group-root")).toBe(1);
    expect(
      renderer.root.findAllByProps({ "aria-label": "Image attachment" }),
    ).toHaveLength(1);
    expect(renderedText(renderer)).toContain("user sibling text");
    expect(renderedText(renderer)).toContain("fallback assistant text");

    await openToolGroup(renderer);

    expect(countByDataSlot(renderer, "tool-fallback-root")).toBe(2);
    expect(countByTestId(renderer, "reasoning-sentinel")).toBe(0);
    expect(countByTestId(renderer, "tool-activity-sentinel")).toBe(0);
    expect(countByTestId(renderer, "tool-item-sentinel")).toBe(0);
    expect(countByTestId(renderer, "attachments-sentinel")).toBe(0);
    expect(
      renderer.root.findAllByProps({ "data-ui-plugin": "agent-reasoning" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-ui-plugin": "agent-tool" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        "data-ui-plugin": "agent-message-attachments",
      }),
    ).toHaveLength(0);
  });
});
