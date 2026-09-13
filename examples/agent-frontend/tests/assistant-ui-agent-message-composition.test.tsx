// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/tool-group.aui";
import {
  createAssistantUiSemanticThreadComponents,
} from "../agent-ui/adapters/assistant-ui/conversation";
import {
  AssistantUiPresentationConfigProvider,
} from "../agent-ui/adapters/assistant-ui/config";
import { Thread } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import type {
  ThreadToolCallWrapperProps,
} from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import type { UIPluginComponentProps } from "../framework/contracts/ui-plugin";

const renderFallback: UIPluginComponentProps["renderSlot"] = (
  _slotId,
  fallback,
) => fallback;

const TEST_CHAT_MODEL = {
  run: async () => ({ content: [] }),
} satisfies ChatModelAdapter;

const messageCompositionPresentation = {
  welcome: {},
  starterSuggestions: [],
  composer: { quickPrompts: [] },
  interactions: { reasoningVariant: "ghost" as const, toolGroupVariant: "ghost" as const },
};

function MessageCompositionFixture({
  initialMessages,
}: {
  initialMessages: readonly ThreadMessageLike[];
}) {
  const runtime = useLocalRuntime(TEST_CHAT_MODEL, { initialMessages });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantUiPresentationConfigProvider value={messageCompositionPresentation}>
        <Thread
          components={createAssistantUiSemanticThreadComponents(renderFallback)}
        />
      </AssistantUiPresentationConfigProvider>
    </AssistantRuntimeProvider>
  );
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

const agentMessageSequence: ThreadMessageLike = {
  id: "agent-message-composition-sequence",
  role: "assistant",
  content: [
    {
      type: "reasoning",
      text: "reasoning before",
      status: { type: "complete" },
    },
    {
      type: "tool-call",
      toolCallId: "standalone-search-files",
      toolName: "search_files",
      args: { query: "src" },
      argsText: '{"query":"src"}',
      result: { matches: ["src/App.tsx"] },
    },
    {
      type: "reasoning",
      text: "reasoning after",
      status: { type: "complete" },
    },
    { type: "text", text: "final text" },
  ],
  status: { type: "complete", reason: "stop" },
};

const mountedRenderers: ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => {
    for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  });
});

describe("assistant-ui Agent Message composition", () => {
  it("keeps Agent reasoning and grouped tools on upstream primitives with configured rhythm", () => {
    const html = renderToStaticMarkup(
      <>
        <ReasoningRoot
          data-agent-ui-composition-part="reasoning"
          variant="ghost"
          className="my-1 mb-3"
        >
          <ReasoningTrigger active={false} />
          <ReasoningContent>
            <ReasoningText>thinking</ReasoningText>
          </ReasoningContent>
        </ReasoningRoot>
        <ToolGroupRoot
          data-agent-ui-composition-part="tool-group"
          variant="ghost"
          className="my-1"
        >
          <ToolGroupTrigger count={1} />
          <ToolGroupContent keepMounted>tool</ToolGroupContent>
        </ToolGroupRoot>
      </>,
    );

    expect(html).toContain('data-agent-ui-composition-part="reasoning"');
    expect(html).toContain('data-agent-ui-composition-part="tool-group"');
    expect(html).toContain('data-variant="ghost"');
    expect(html).toContain("my-1 mb-3");
    expect(html).toContain("my-1");
  });

  it("renders reasoning, standalone search_files, reasoning, and text as one composed message", async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture initialMessages={[agentMessageSequence]} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Message composition renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const reasoningFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "reasoning",
    });
    const toolGroupFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "tool-group",
    });
    const toolCallFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "tool-call",
    });

    expect(reasoningFrames).toHaveLength(2);
    expect(reasoningFrames.every((frame) =>
      frame.props["data-variant"] === "ghost" &&
      frame.props.className.split(/\s+/u).includes("mb-3")
    )).toBe(true);
    expect(toolGroupFrames).toHaveLength(1);
    expect(toolGroupFrames[0]?.props["data-variant"]).toBe("ghost");
    expect(toolGroupFrames[0]?.props.className.split(/\s+/u)).toContain("my-1");
    expect(toolCallFrames).toHaveLength(1);
    expect(toolCallFrames[0]?.props.className.split(/\s+/u)).toContain("my-1");

    const text = renderedText(renderer);
    expect(text).toContain("reasoning before");
    expect(text).toContain("search_files");
    expect(text).toContain("reasoning after");
    expect(text).toContain("final text");
  });

  it("wraps standalone tool calls without replacing registered tool UI", () => {
    const components = createAssistantUiSemanticThreadComponents(renderFallback);
    const ToolCallWrapper = components.ToolCallWrapper;
    expect(ToolCallWrapper).toBeDefined();
    if (ToolCallWrapper === undefined) return;

    const part = {
      type: "tool-call",
      toolCallId: "standalone-call",
      toolName: "inspect",
      args: {},
      argsText: "{}",
      status: { type: "complete" },
    } as ThreadToolCallWrapperProps["part"];
    const html = renderToStaticMarkup(
      <ToolCallWrapper part={part}>
        <span data-fixture="registered-tool-ui">registered tool</span>
      </ToolCallWrapper>,
    );

    expect(html).toContain('data-agent-ui-composition-part="tool-call"');
    expect(html).toContain('data-fixture="registered-tool-ui"');
    expect(html).toContain("my-1");
  });
});
