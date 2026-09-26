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
  multiMessageResponseScenario,
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  nestedSubagentTaskGroupScenario,
} from "@agent-ui/mock-agent";
import { runMockScenario } from "@agent-ui/mock-agent";
import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { AssistantUiResponseFooterPlugin } from "../plugins/assistant-ui-response-footer";
import { TaskGroupPlugin } from "../plugins/task-group";
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

const namedToolUiConfig = AuiConfig({
  tools: Tools({
    toolkit: {
      customer_defined_agent_tool: {
        type: "backend" as const,
        display: "standalone" as const,
        render: () => (
          <div data-slot="named-task-tool-ui">Named Task UI</div>
        ),
      },
    } as never,
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
  if (slotName === "assistantResponseFooter") {
    return (
      <AssistantUiResponseFooterPlugin
        renderSlot={() => null}
        renderScopedSlot={() => null}
      />
    );
  }
  if (slotName === "toolGroup" || slotName === "reasoningGroup") {
    return (scope.value as { children?: ReactNode }).children ?? null;
  }
  if (slotName !== "taskGroup") return fallback ?? null;
  return (
    <PluginRenderScopeProvider scope={scope}>
      <TaskGroupPlugin
        renderSlot={() => null}
        renderScopedSlot={() => null}
      />
    </PluginRenderScopeProvider>
  );
}

function RuntimeHarness({
  agent,
  onRuntime,
  config = assistantConfig,
}: {
  agent: AbstractAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
  config?: typeof assistantConfig;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <ConversationAdapter renderScopedSlot={renderConversationScopedSlot} />
    </AssistantRuntimeProvider>
  );
}

async function mountRuntime(
  agent: AbstractAgent,
  config: typeof assistantConfig = assistantConfig,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  let runtime: AgUiAssistantRuntime | undefined;
  await act(async () => {
    root.render(
      <RuntimeHarness
        agent={agent}
        config={config}
        onRuntime={(nextRuntime) => {
          runtime = nextRuntime;
        }}
      />,
    );
  });
  if (runtime === undefined) throw new Error("assistant-ui runtime was not captured");
  return { container, runtime };
}

async function openTaskCards(container: HTMLElement) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const button = [...container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="task-card"] button[aria-expanded="false"]',
    )][0];
    if (button === undefined) return;
    await act(async () => button.click());
  }
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

    expect(parentTool.args).toEqual({
      task: "Inspect Conversation Runtime",
      subagent_type: "researcher",
    });
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
      "检查完成：Conversation Runtime 负责 assistant-ui Runtime 集成",
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
      summary: "Conversation Runtime inspection complete",
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

    await openTaskCards(runtimeFixture.container);

    const nested = runtimeFixture.container.querySelector(
      '[data-slot="task-card-transcript"]',
    );
    expect(nested).not.toBeNull();
    expect(nested?.textContent).toContain("我先检查 Conversation Runtime 和 Conversation Adapter");
    expect(nested?.textContent).toContain("Searched files");
    expect(nested?.textContent).toContain("检查完成：Conversation Runtime 负责 assistant-ui Runtime 集成");
    expect(runtimeFixture.container.textContent).toContain(
      "Conversation Runtime inspection complete",
    );

    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="aui_task-transcript-message"]',
      ),
    ).toHaveLength(1);
    const nestedMessage = runtimeFixture.container.querySelector(
      '[data-slot="aui_task-transcript-message"]',
    );
    expect(nestedMessage).not.toBeNull();
    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="aui_task-transcript-message"]',
      ),
    ).toHaveLength(1);
    expect(runtimeFixture.container.textContent).not.toContain(
      "我把架构检查交给 Researcher 子 Agent。",
    );
    expect(runtimeFixture.container.textContent).toContain(
      "Researcher 已完成 Conversation Runtime 检查，我已经收到它的结果。",
    );
  });

  it("uses the official TaskCard disclosure for nested work", async () => {
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

    const taskCard = runtimeFixture.container.querySelector('[data-slot="task-card"]');
    expect(taskCard).not.toBeNull();
    expect(taskCard?.querySelector("button")).not.toBeNull();
    expect(runtimeFixture.container.querySelector('[data-slot="task-card-transcript"]')).toBeNull();
    expect(
      runtimeFixture.container
        .querySelector('[data-slot="task-card"] [data-slot="tool-fallback-root"]'),
    ).toBeNull();
    expect(runtimeFixture.container.textContent).toContain("Inspect Conversation Runtime");
    expect(runtimeFixture.container.textContent).toContain("researcher");
    expect(
      runtimeFixture.container.querySelector('[data-slot="task-card-result"]')
        ?.textContent,
    ).toContain("Conversation Runtime inspection complete");

    const matches = runtimeFixture.container.textContent?.match(/delegate_specialist/g) ?? [];
    expect(matches).toHaveLength(1);
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

    expect(runtimeFixture.container.querySelector('[data-slot="task-card"]')).not.toBeNull();
    expect(runtimeFixture.container.textContent).toContain(
      "customer_defined_agent_tool",
    );
  });

  it("renders sibling nested subagents through the official TaskGroup", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(
        await collectScenarioEvents(nestedSubagentTaskGroupScenario),
      ),
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查多个 Agent 任务" }],
        startRun: true,
      });
    });

    const parentMessage = assistantMessages(runtimeFixture.runtime).at(-1);
    const parentTools = parentMessage?.content.filter(
      (part): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> =>
        part.type === "tool-call",
    ) ?? [];
    expect(parentTools).toHaveLength(3);
    expect(parentTools.every((part) => part.messages?.length === 1)).toBe(true);

    const taskGroup = runtimeFixture.container.querySelector(
      '[data-slot="aui_task-group"]',
    );
    expect(taskGroup).not.toBeNull();
    expect(taskGroup?.textContent).toContain("3 tasks");
    expect(taskGroup?.querySelectorAll('[data-slot="task-card"]')).toHaveLength(3);
    expect(taskGroup?.textContent).toContain("Inspect Architecture");
    expect(taskGroup?.textContent).toContain("Inspect Conversation Runtime");
    expect(taskGroup?.textContent).toContain("Review Conversation UI");
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

    await openTaskCards(runtimeFixture.container);

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
        '[data-slot="aui_task-transcript-message"]',
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

    await openTaskCards(runtimeFixture.container);

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
    expect(runtimeFixture.container.querySelector('[data-slot="task-card"]')).not.toBeNull();
    expect(
      runtimeFixture.container.querySelector(
        '[data-slot="task-card"][data-state="done"]',
      ),
    ).not.toBeNull();
    const errorAlert = runtimeFixture.container
      .querySelector('[data-slot="aui_task-transcript-message"]')
      ?.querySelector('[role="alert"]');
    expect(errorAlert).not.toBeNull();
    expect(errorAlert?.textContent).toContain(
      "Researcher failed during runtime inspection",
    );
    expect(runtimeFixture.container.textContent).toContain(
      "我已经定位到失败分支",
    );
  });

  it("prioritizes a registered named Tool UI over TaskGroup for nested messages", async () => {
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(renameParentTool(
        await collectScenarioEvents(),
        "customer_defined_agent_tool",
      )),
      namedToolUiConfig,
    );

    await act(async () => {
      await runtimeFixture.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "检查命名 Agent Tool UI" }],
        startRun: true,
      });
    });

    const parentMessage = assistantMessages(runtimeFixture.runtime).at(-1);
    const parentTool = parentMessage?.content.find(
      (part): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> =>
        part.type === "tool-call" && part.toolName === "customer_defined_agent_tool",
    );
    expect(parentTool?.messages).toHaveLength(1);
    expect(
      runtimeFixture.container.querySelector('[data-slot="named-task-tool-ui"]'),
    ).not.toBeNull();
    expect(runtimeFixture.container.querySelector('[data-slot="task-card"]')).toBeNull();
  });

  it("does not register the nested conversation by tool name", () => {
    const productionToolkit = createConversationToolkit() as Record<string, unknown>;
    const mockToolkit = createConversationToolkit({ mockAgentElements: true }) as Record<string, unknown>;

    expect(productionToolkit.delegate_specialist).toBeUndefined();
    expect(mockToolkit.delegate_specialist).toBeUndefined();
  });
});

describe("standard AG-UI multi-message Response", () => {
  it("projects three ThreadMessages and one tail Footer through react-ag-ui", async () => {
    const events = await collectScenarioEvents(multiMessageResponseScenario);
    const { container, runtime } = await mountRuntime(new ScenarioEventAgent(events));
    await act(async () => { await runtime.thread.append({ role: "user", content: [{ type: "text", text: "回答" }], startRun: true }); });
    const messages = assistantMessages(runtime);
    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.content.filter((part) => part.type === "text").map((part) => part.text).join("")))
      .toEqual(["第一段回答", "第二段回答", "最终总结"]);
    const roots = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
    expect(roots).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(roots[2]?.querySelector('[data-slot="aui_assistant-response-footer"]')).not.toBeNull();
  });

  it("keeps actions absent between streamed messages until RUN_FINISHED", async () => {
    const events = await collectScenarioEvents(multiMessageResponseScenario);
    let emit: ((event: BaseEvent) => void) | undefined;
    let complete: (() => void) | undefined;
    class PausedScenarioAgent extends AbstractAgent {
      constructor() { super({ threadId: "p6-thread" }); }
      override run(_input: RunAgentInput): Observable<BaseEvent> {
        return new Observable((subscriber) => {
          emit = (event) => subscriber.next(event);
          complete = () => subscriber.complete();
        });
      }
    }
    const { container, runtime } = await mountRuntime(new PausedScenarioAgent());
    await act(async () => { runtime.thread.append({ role: "user", content: [{ type: "text", text: "回答" }], startRun: true }); });
    const firstEnd = events.findIndex((event) => event.type === "TEXT_MESSAGE_END");
    await act(async () => { events.slice(0, firstEnd + 1).forEach((event) => emit?.(event)); });
    expect(assistantMessages(runtime)).toHaveLength(1);
    expect(runtime.thread.getState().isRunning).toBe(true);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(0);
    await act(async () => { events.slice(firstEnd + 1).forEach((event) => emit?.(event)); complete?.(); });
    expect(assistantMessages(runtime)).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
  });
});
