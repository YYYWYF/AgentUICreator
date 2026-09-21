// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
  type ThreadMessage,
} from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type AgUiAssistantRuntime,
} from "@assistant-ui/react-ag-ui";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { nestedSubagentConversationScenario } from "@agent-ui/mock-agent";
import { runMockScenario } from "@agent-ui/mock-agent";
import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { AssistantUiMessageFooterPlugin } from "../plugins/assistant-ui-message-footer";
import { SubagentConversationPlugin } from "../plugins/subagent-conversation";
import type { UIPluginRenderScope } from "../framework/contracts/ui-plugin";
import { PluginRenderScopeProvider } from "../runtime/plugins";

type AssistantAgent = Parameters<typeof useAgUiRuntime>[0]["agent"];

const mockInput: Parameters<typeof runMockScenario>[0] = {
  threadId: "p6-thread",
  runId: "p6-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

const assistantConfig = AuiConfig({
  tools: Tools({
    toolkit: createConversationToolkit({ mockAgentElements: true }) as never,
  }),
});

const mountedRoots: Root[] = [];

async function collectScenarioEvents(): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of runMockScenario(
    mockInput,
    nestedSubagentConversationScenario,
    { timingScale: 0 },
  )) {
    events.push(event);
  }
  return events;
}

function renameParentTool(events: readonly unknown[], toolName: string): unknown[] {
  return events.map((event) => {
    if (typeof event !== "object" || event === null) return event;
    const candidate = event as { type?: unknown; toolCallId?: unknown };
    return candidate.type === "TOOL_CALL_START" &&
        candidate.toolCallId === "invoke-researcher-1"
      ? { ...event, toolCallName: toolName }
      : event;
  });
}

function createEventAgent(events: readonly unknown[]): AssistantAgent {
  return {
    threadId: "p6-thread",
    runAgent: async (
      _input: unknown,
      options?: { onEvent?: (payload: { event: unknown }) => void },
    ) => {
      for (const event of events) options?.onEvent?.({ event });
    },
    abortRun: () => undefined,
  } as unknown as AssistantAgent;
}

function renderConversationScopedSlot(
  slotName: string,
  scope: UIPluginRenderScope,
  fallback?: ReactNode,
) {
  if (slotName === "assistantMessageFooter") {
    return (
      <AssistantUiMessageFooterPlugin
        renderSlot={() => null}
        renderScopedSlot={() => null}
      />
    );
  }
  if (slotName === "toolGroup" || slotName === "reasoningGroup") {
    return (scope.value as { children?: ReactNode }).children ?? null;
  }
  if (slotName !== "subagentConversation") return fallback ?? null;
  return (
    <PluginRenderScopeProvider scope={scope}>
      <SubagentConversationPlugin
        renderSlot={() => null}
        renderScopedSlot={() => null}
      />
    </PluginRenderScopeProvider>
  );
}

function RuntimeHarness({
  agent,
  onRuntime,
}: {
  agent: AssistantAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={assistantConfig} runtime={runtime}>
      <ConversationAdapter renderScopedSlot={renderConversationScopedSlot} />
    </AssistantRuntimeProvider>
  );
}

async function mountRuntime(agent: AssistantAgent) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  let runtime: AgUiAssistantRuntime | undefined;
  await act(async () => {
    root.render(
      <RuntimeHarness
        agent={agent}
        onRuntime={(nextRuntime) => {
          runtime = nextRuntime;
        }}
      />,
    );
  });
  if (runtime === undefined) throw new Error("assistant-ui runtime was not captured");
  return { container, runtime };
}

function assistantMessages(runtime: AgUiAssistantRuntime): ThreadMessage[] {
  return runtime.thread.getState().messages.filter(
    (message): message is ThreadMessage => message.role === "assistant",
  );
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("official nested assistant-ui conversation", () => {
  it("exposes ToolCallMessagePart.messages through the pinned AG-UI adapter", async () => {
    const runtimeFixture = await mountRuntime(
      createEventAgent(await collectScenarioEvents()),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    const parentMessage = assistantMessages(runtimeFixture.runtime).at(-1);
    const parentTool = parentMessage?.content.find((part) =>
      part.type === "tool-call" &&
      part.toolName === "delegate_specialist",
    );
    if (parentTool?.type !== "tool-call") {
      throw new Error("official adapter did not materialize the parent tool call");
    }

    expect(parentTool.messages).toHaveLength(1);
    const nestedText = parentTool.messages
      ?.filter(
        (message): message is Extract<ThreadMessage, { role: "assistant" }> =>
          message.role === "assistant",
      )
      .flatMap((message) => message.content)
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map(({ text }) => text)
      .join("");
    expect(nestedText).toContain("Architecture inspection complete");
  });

  it("renders nested messages with inherited toolkit UI inside the parent tool", async () => {
    const runtimeFixture = await mountRuntime(
      createEventAgent(await collectScenarioEvents()),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    const nested = runtimeFixture.container.querySelector(
      '[data-slot="subagent-conversation-content"]',
    );
    expect(nested).not.toBeNull();
    expect(nested?.classList.contains("border-s")).toBe(false);
    expect(nested?.classList.contains("border-border/60")).toBe(false);
    expect(nested?.classList.contains("ps-5")).toBe(false);
    expect(nested?.classList.contains("ms-[7px]")).toBe(false);
    expect(nested?.classList.contains("ms-5")).toBe(true);
    expect(nested?.textContent).toContain("我先检查 Agent UI 的核心 Runtime");
    expect(nested?.textContent).toContain("Searched files");
    expect(nested?.textContent).toContain("检查完成：当前项目由 Conversation Runtime");

    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="subagent-conversation-message"]',
      ),
    ).toHaveLength(1);
    const nestedMessage = runtimeFixture.container.querySelector(
      '[data-slot="subagent-conversation-message"]',
    );
    expect(nestedMessage).not.toBeNull();
    expect(nestedMessage?.classList.contains("rounded-xl")).toBe(false);
    expect(nestedMessage?.classList.contains("border")).toBe(false);
    expect(nestedMessage?.classList.contains("bg-card/40")).toBe(false);
    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="aui_assistant-message-root"]',
      ),
    ).toHaveLength(1);
    expect(
      runtimeFixture.container.querySelectorAll(
        ".aui-assistant-action-bar-root",
      ),
    ).toHaveLength(1);
    expect(runtimeFixture.container.textContent).not.toContain(
      "我把架构检查交给 Researcher 子 Agent。",
    );
    expect(runtimeFixture.container.textContent).toContain(
      "Researcher 已完成架构检查，我已经收到它的结果。",
    );
  });

  it("uses one nested disclosure and keeps the tool identity singular", async () => {
    const runtimeFixture = await mountRuntime(
      createEventAgent(await collectScenarioEvents()),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    const nestedTool = runtimeFixture.container.querySelector(
      '[data-slot="subagent-conversation-root"]',
    );
    const trigger = nestedTool?.querySelector(
      '[data-slot="subagent-conversation-trigger"]',
    ) as HTMLButtonElement | null;
    const chevron = nestedTool?.querySelector(
      '[data-slot="subagent-conversation-chevron"]',
    );
    const conversation = nestedTool?.querySelector(
      '[data-slot="subagent-conversation-content"]',
    );

    expect(nestedTool).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(chevron).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.classList.contains("rotate-90")).toBe(true);
    expect(conversation).not.toBeNull();

    const matches =
      nestedTool?.textContent?.match(/delegate_specialist/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(
      nestedTool?.querySelectorAll(
        '[data-slot="subagent-conversation-content"]',
      ),
    ).toHaveLength(1);
    expect(
      nestedTool?.querySelectorAll(
        '[data-slot="subagent-conversation-message"]',
      ),
    ).toHaveLength(1);

    await act(async () => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(chevron?.classList.contains("rotate-90")).toBe(false);
    expect(
      nestedTool?.querySelector(
        '[data-slot="subagent-conversation-content"]',
      ),
    ).toBeNull();

    await act(async () => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.classList.contains("rotate-90")).toBe(true);
    expect(
      nestedTool?.querySelector(
        '[data-slot="subagent-conversation-content"]',
      ),
    ).not.toBeNull();
  });

  it("routes an unknown parent tool name through the same presentation", async () => {
    const runtimeFixture = await mountRuntime(
      createEventAgent(renameParentTool(
        await collectScenarioEvents(),
        "customer_defined_agent_tool",
      )),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    expect(
      runtimeFixture.container.querySelector(
        '[data-slot="subagent-conversation-root"]',
      ),
    ).not.toBeNull();
    expect(runtimeFixture.container.textContent).toContain(
      "customer_defined_agent_tool",
    );
  });

  it("does not register the nested conversation by tool name", () => {
    const productionToolkit = createConversationToolkit() as Record<string, unknown>;
    const mockToolkit = createConversationToolkit({ mockAgentElements: true }) as Record<string, unknown>;

    expect(productionToolkit.delegate_specialist).toBeUndefined();
    expect(mockToolkit.delegate_specialist).toBeUndefined();
  });
});
