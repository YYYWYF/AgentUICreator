// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import {
  AuiConfig,
  AssistantRuntimeProvider,
  Tools,
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
import { createAssistantUiToolkit } from "../agent-ui/adapters/assistant-ui/toolkit";
import {
  AssistantUiPresentationConfigProvider,
  type AssistantUiPresentationConfig,
} from "../agent-ui/adapters/assistant-ui/config";
import { Thread } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
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
  interactions: {},
};

function MessageCompositionFixture({
  initialMessages,
  mockAgentElements = false,
  presentation = messageCompositionPresentation,
}: {
  initialMessages: readonly ThreadMessageLike[];
  mockAgentElements?: boolean;
  presentation?: AssistantUiPresentationConfig;
}) {
  const runtime = useLocalRuntime(TEST_CHAT_MODEL, { initialMessages });
  const config = AuiConfig({
    tools: Tools({ toolkit: createAssistantUiToolkit({ mockAgentElements }) }),
  });
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <AssistantUiPresentationConfigProvider value={presentation}>
        <Thread
          components={createAssistantUiSemanticThreadComponents(
            renderFallback,
            presentation,
          )}
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

const agentElementsMessage: ThreadMessageLike = {
  id: "agent-elements-composition-sequence",
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId: "composition-plan",
      toolName: "mock_agent_plan",
      args: {},
      argsText: "{}",
      result: {
        steps: ["Inspect", "Compare", "Update"],
        activeIndex: 1,
      },
    },
    {
      type: "tool-call",
      toolCallId: "composition-status",
      toolName: "mock_agent_status",
      args: {},
      argsText: "{}",
      result: { state: "working", label: "Inspecting workspace" },
    },
    ...(["A", "B", "C"] as const).map((name) => ({
      type: "tool-call" as const,
      toolCallId: `composition-dispatch-${name}`,
      toolName: "mock_dispatch_subagent",
      args: { name: `Agent ${name}`, model: "mimo-v2.5-pro" },
      argsText: JSON.stringify({ name: `Agent ${name}`, model: "mimo-v2.5-pro" }),
      result: {
        name: `Agent ${name}`,
        model: "mimo-v2.5-pro",
        status: "completed",
        progress: 100,
      },
    })),
    { type: "text", text: "Agent elements complete." },
  ],
  status: { type: "complete", reason: "stop" },
};

const subagentsDemoMessage: ThreadMessageLike = {
  id: "subagents-demo-composition-sequence",
  role: "assistant",
  content: [
    ...[
      ["Architecture Researcher", "running", 20],
      ["Runtime Inspector", "completed", 100],
      ["UI Reviewer", "completed", 100],
    ] as const,
  ].map(([name, status, progress], index) => ({
    type: "tool-call" as const,
    toolCallId: `subagents-demo-${index}`,
    toolName: "mock_dispatch_subagent",
    args: { name, model: "mimo-v2.5-pro", status, progress },
    argsText: JSON.stringify({ name, model: "mimo-v2.5-pro", status, progress }),
    result: { name, model: "mimo-v2.5-pro", status, progress },
  })),
  status: { type: "complete", reason: "stop" },
};

const runningSubagentsMessage: ThreadMessageLike = {
  id: "running-subagents-composition-sequence",
  role: "assistant",
  content: [
    ...[
      ["Architecture Researcher", "running", 20],
      ["Runtime Inspector", "running", 45],
      ["UI Reviewer", "running", 10],
    ] as const,
  ].map(([name, status, progress], index) => ({
    type: "tool-call" as const,
    toolCallId: `running-subagents-${index}`,
    toolName: "mock_dispatch_subagent",
    args: { name, model: "mimo-v2.5-pro", status, progress },
    argsText: JSON.stringify({ name, model: "mimo-v2.5-pro", status, progress }),
    result: { name, model: "mimo-v2.5-pro", status, progress },
  })),
  status: { type: "running" },
};

const incompleteSubagentsMessage: ThreadMessageLike = {
  ...runningSubagentsMessage,
  id: "incomplete-subagents-composition-sequence",
  status: {
    type: "incomplete",
    reason: "error",
    error: "mock failure",
  },
};

const runningReasoningMessage: ThreadMessageLike = {
  id: "running-reasoning-composition-sequence",
  role: "assistant",
  content: [
    {
      type: "reasoning",
      text: "ongoing reasoning",
      status: { type: "running" },
    },
    { type: "text", text: "partial response" },
  ],
  status: { type: "running" },
};

const malformedDispatchMessage: ThreadMessageLike = {
  id: "malformed-dispatch-composition",
  role: "assistant",
  content: [{
    type: "tool-call",
    toolCallId: "malformed-dispatch",
    toolName: "mock_dispatch_subagent",
    args: { name: "Missing Model" },
    argsText: '{"name":"Missing Model"}',
    result: { name: "Missing Model", status: "completed" },
  }],
  status: { type: "complete", reason: "stop" },
};

const ordinaryToolsMessage: ThreadMessageLike = {
  id: "ordinary-tools-composition-sequence",
  role: "assistant",
  content: (["a", "b", "c"] as const).map((suffix) => ({
    type: "tool-call" as const,
    toolCallId: `ordinary-tool-${suffix}`,
    toolName: `ordinary_tool_${suffix}`,
    args: { suffix },
    argsText: JSON.stringify({ suffix }),
    result: { ok: true },
  })),
  status: { type: "complete", reason: "stop" },
};

const mountedRenderers: ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => {
    for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  });
});

describe("assistant-ui Agent Message composition", () => {
  it("keeps Agent reasoning and grouped tools on upstream primitives without product rhythm overrides", () => {
    const html = renderToStaticMarkup(
      <>
        <ReasoningRoot
          data-agent-ui-composition-part="reasoning"
        >
          <ReasoningTrigger active={false} />
          <ReasoningContent>
            <ReasoningText>thinking</ReasoningText>
          </ReasoningContent>
        </ReasoningRoot>
        <ToolGroupRoot
          data-agent-ui-composition-part="tool-group"
          variant="ghost"
        >
          <ToolGroupTrigger count={1} />
          <ToolGroupContent keepMounted>tool</ToolGroupContent>
        </ToolGroupRoot>
      </>,
    );

    expect(html).toContain('data-agent-ui-composition-part="reasoning"');
    expect(html).toContain('data-agent-ui-composition-part="tool-group"');
    expect(html).toContain('data-variant="ghost"');
    expect(html).not.toContain("my-1 mb-3");
    expect(html).not.toContain('class="my-1"');
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
      frame.props["data-variant"] === undefined &&
      !frame.props.className.split(/\s+/u).includes("my-1") &&
      !frame.props.className.split(/\s+/u).includes("mb-3")
    )).toBe(true);
    expect(toolGroupFrames).toHaveLength(1);
    expect(toolGroupFrames[0]?.props["data-variant"]).toBe("ghost");
    expect(toolGroupFrames[0]?.props.className.split(/\s+/u)).not.toContain("my-1");
    expect(toolCallFrames).toHaveLength(0);

    const text = renderedText(renderer);
    expect(text).toContain("reasoning before");
    expect(text).toContain("search_files");
    expect(text).toContain("reasoning after");
    expect(text).toContain("final text");
  });

  it("leaves AssistantMessage and direct tool composition to official seams", () => {
    const components = createAssistantUiSemanticThreadComponents(renderFallback);
    expect(components.AssistantMessage).toBeUndefined();
    expect(components.Welcome).toBeUndefined();
    expect(components.ReasoningGroup).toBeDefined();
    expect(components.ToolGroup).toBeDefined();
    expect(components.ToolFallback).toBeDefined();
    expect(components).not.toHaveProperty("ToolCallWrapper");
  });

  it("uses the product Welcome seam only for an explicit Welcome configuration", () => {
    const components = createAssistantUiSemanticThreadComponents(renderFallback);
    expect(components.Welcome).toBeUndefined();

    const customComponents = createAssistantUiSemanticThreadComponents(
      renderFallback,
      {
        ...messageCompositionPresentation,
        welcome: {
          title: "Product Welcome",
          description: "Explicit product copy",
        },
      },
    );
    expect(customComponents.Welcome).toBeDefined();
  });

  it("composes AgentPlan, AgentStatus, and one SubagentList through toolkit renderers", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[agentElementsMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Agent Elements renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const planFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "plan",
    });
    const statusFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "status",
    });
    const aggregateFrames = renderer.root.findAllByProps({
      "data-agent-ui-composition-part": "subagent-aggregate",
    });
    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    const dispatchFallbacks = renderer.root.findAllByProps({
      "data-slot": "tool-fallback-root",
    });

    expect(planFrames).toHaveLength(1);
    expect(statusFrames).toHaveLength(1);
    expect(planFrames[0]?.props.className.split(/\s+/u)).toEqual(
      expect.arrayContaining(["my-3", "w-fit", "max-w-full"]),
    );
    expect(statusFrames[0]?.props.className.split(/\s+/u)).toEqual(
      expect.arrayContaining(["my-3", "w-fit", "max-w-full"]),
    );
    expect(aggregateFrames).toHaveLength(1);
    expect(subagentLists).toHaveLength(1);
    expect(renderer.root.findAllByProps({
      "data-slot": "tool-group-trigger",
    })).toHaveLength(0);
    expect(dispatchFallbacks).toHaveLength(0);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
    expect(renderedText(renderer)).toContain("Agent A");
    expect(renderedText(renderer)).toContain("Agent B");
    expect(renderedText(renderer)).toContain("Agent C");
  });

  it("renders the terminal Subagents demo as one compact aggregate", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[subagentsDemoMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Subagents demo renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    expect(subagentLists).toHaveLength(1);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
    expect(renderer.root.findAllByProps({
      "data-slot": "tool-group-trigger",
    })).toHaveLength(0);
    expect(renderedText(renderer)).toContain("Architecture Researcher");
    expect(renderedText(renderer)).toContain("Runtime Inspector");
    expect(renderedText(renderer)).toContain("UI Reviewer");
  });

  it("keeps the official SubagentList minimum height while running", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[runningSubagentsMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Running Subagents renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    expect(subagentLists).toHaveLength(1);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
    expect(renderer.root.findAllByProps({
      "data-slot": "tool-group-trigger",
    })).toHaveLength(0);
  });

  it("keeps the official SubagentList minimum height for an incomplete run", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[incompleteSubagentsMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Incomplete Subagents renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    expect(subagentLists).toHaveLength(1);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
  });

  it("keeps the official SubagentList minimum height across message rounds", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[subagentsDemoMessage, runningReasoningMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Multi-round Subagents renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    expect(subagentLists).toHaveLength(1);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
    expect(renderedText(renderer)).toContain("ongoing reasoning");
    expect(renderedText(renderer)).toContain("partial response");
  });

  it("keeps the official SubagentList minimum height in history", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[subagentsDemoMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("History Subagents renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const subagentLists = renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    });
    expect(subagentLists).toHaveLength(1);
    expect(subagentLists[0]?.props.className.split(/\s+/u)).toContain("min-h-[14.5rem]");
    expect(subagentLists[0]?.props.className.split(/\s+/u)).not.toContain("min-h-0");
  });

  it("keeps ordinary tools in the official ToolGroup", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[ordinaryToolsMessage]}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Ordinary tool renderer was not created.");
    }
    mountedRenderers.push(renderer);

    expect(renderer.root.findAllByProps({
      "data-slot": "tool-group-trigger",
    })).toHaveLength(1);
    expect(renderedText(renderer)).toContain("3 tool calls");
  });

  it("keeps an explicit ToolGroup presentation override", async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[ordinaryToolsMessage]}
          presentation={{
            ...messageCompositionPresentation,
            interactions: { toolGroupVariant: "outline" },
          }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("ToolGroup override renderer was not created.");
    }
    mountedRenderers.push(renderer);

    const toolGroups = renderer.root.findAllByProps({
      "data-slot": "tool-group-root",
    });
    expect(toolGroups).toHaveLength(1);
    expect(toolGroups[0]?.props["data-variant"]).toBe("outline");
  });

  it("keeps malformed dispatches on the visible ToolFallback path", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <MessageCompositionFixture
          initialMessages={[malformedDispatchMessage]}
          mockAgentElements
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (renderer === undefined) {
      throw new Error("Malformed dispatch renderer was not created.");
    }
    mountedRenderers.push(renderer);

    expect(renderer.root.findAllByProps({
      "data-slot": "subagent-list",
    })).toHaveLength(0);
    expect(renderer.root.findAllByProps({
      "data-slot": "tool-fallback-root",
    })).toHaveLength(1);
  });
});
