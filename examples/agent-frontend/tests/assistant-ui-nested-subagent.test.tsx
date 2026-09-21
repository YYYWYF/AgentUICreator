// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { Observable } from "rxjs";
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

import {
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
} from "@agent-ui/mock-agent";
import { runMockScenario } from "@agent-ui/mock-agent";
import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { AssistantUiMessageFooterPlugin } from "../plugins/assistant-ui-message-footer";
import { SubagentConversationPlugin } from "../plugins/subagent-conversation";
import type { UIPluginRenderScope } from "../framework/contracts/ui-plugin";
import { PluginRenderScopeProvider } from "../runtime/plugins";

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

async function collectScenarioEvents(
  scenario = nestedSubagentConversationScenario,
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  for await (const event of runMockScenario(
    mockInput,
    scenario,
    { timingScale: 0 },
  )) {
    events.push(event);
  }
  return events;
}

function renameParentTool(events: readonly BaseEvent[], toolName: string): BaseEvent[] {
  return events.map((event) => {
    return event.type === "TOOL_CALL_START" &&
        event.toolCallId === "invoke-researcher-1"
      ? { ...event, toolCallName: toolName }
      : event;
  });
}

class ScenarioEventAgent extends AbstractAgent {
  constructor(private readonly scenarioEvents: readonly BaseEvent[]) {
    super({ threadId: "p6-thread" });
  }

  override run(_input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      for (const event of this.scenarioEvents) subscriber.next(event);
      subscriber.complete();
    });
  }
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
  agent: AbstractAgent;
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

async function mountRuntime(agent: AbstractAgent) {
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
      new ScenarioEventAgent(await collectScenarioEvents()),
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
    expect(nestedText).toContain(
      "检查完成：当前项目由 Conversation Runtime",
    );

    const nestedMessage = parentTool.messages?.find(
      (message): message is Extract<ThreadMessage, { role: "assistant" }> =>
        message.role === "assistant",
    );
    const nestedMetadata = nestedMessage?.metadata as {
      custom?: {
        agui?: { result?: unknown };
      };
    } | undefined;
    expect(nestedMetadata?.custom?.agui?.result).toEqual({
      summary: "Architecture inspection complete",
    });
  });

  it("renders nested messages with inherited toolkit UI inside the parent tool", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(await collectScenarioEvents()),
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

  it("uses the canonical tool fallback without a second disclosure shell", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(await collectScenarioEvents()),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    expect(
      runtimeFixture.container.querySelector('[data-slot="tool-fallback-root"]'),
    ).not.toBeNull();
    expect(
      runtimeFixture.container.querySelector('[data-slot="subagent-conversation-root"]'),
    ).toBeNull();
    expect(
      runtimeFixture.container.querySelector('[data-slot="subagent-conversation-trigger"]'),
    ).toBeNull();
    expect(
      runtimeFixture.container.querySelector('[data-slot="subagent-conversation-chevron"]'),
    ).toBeNull();

    const matches = runtimeFixture.container.textContent?.match(/delegate_specialist/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="subagent-conversation-content"]',
      ),
    ).toHaveLength(1);
    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="subagent-conversation-message"]',
      ),
    ).toHaveLength(1);
  });

  it("routes an unknown parent tool name through the same presentation", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(renameParentTool(
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
      runtimeFixture.container.querySelector('[data-slot="tool-fallback-root"]'),
    ).not.toBeNull();
    expect(runtimeFixture.container.textContent).toContain(
      "customer_defined_agent_tool",
    );
  });

  it("recursively renders a second subagent through ToolCallMessagePart.messages", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(
        await collectScenarioEvents(nestedSubagentRecursiveScenario),
      ),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "递归检查 Agent UI 架构" }],
        startRun: true,
      });
    });

    const parentMessage = assistantMessages(runtimeFixture.runtime).at(-1);
    const parentTool = parentMessage?.content.find(
      (part): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> =>
        part.type === "tool-call" && part.toolCallId === "parent-tool",
    );
    const subagentA = parentTool?.messages?.[0];
    const childTool = subagentA?.content.find(
      (part): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> =>
        part.type === "tool-call" && part.toolCallId === "child-tool",
    );

    expect(parentTool?.messages).toHaveLength(1);
    expect(childTool?.messages).toHaveLength(1);
    expect(runtimeFixture.container.textContent).toContain(
      "Subagent B 已完成 Runtime 检查。",
    );
    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="subagent-conversation-message"]',
      ),
    ).toHaveLength(2);
  });

  it("keeps attributed content and the canonical incomplete status for SUBAGENT_ERROR", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(
        await collectScenarioEvents(nestedSubagentErrorScenario),
      ),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查失败的 Agent UI 分支" }],
        startRun: true,
      });
    });

    const parentMessage = assistantMessages(runtimeFixture.runtime).at(-1);
    const parentTool = parentMessage?.content.find(
      (part): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> =>
        part.type === "tool-call" && part.toolCallId === "error-parent-tool",
    );
    const errorMessage = parentTool?.messages?.[0];
    const errorMetadata = errorMessage?.metadata as {
      custom?: { agui?: { errorCode?: unknown } };
    } | undefined;

    expect(errorMessage?.status).toMatchObject({
      type: "incomplete",
      reason: "error",
    });
    expect(errorMetadata?.custom?.agui?.errorCode).toBe(
      "SUBAGENT_RESEARCH_FAILED",
    );
    expect(runtimeFixture.container.textContent).toContain(
      "我已经定位到失败分支",
    );
  });

  it("does not register the nested conversation by tool name", () => {
    const productionToolkit = createConversationToolkit() as Record<string, unknown>;
    const mockToolkit = createConversationToolkit({ mockAgentElements: true }) as Record<string, unknown>;

    expect(productionToolkit.delegate_specialist).toBeUndefined();
    expect(mockToolkit.delegate_specialist).toBeUndefined();
  });
});
