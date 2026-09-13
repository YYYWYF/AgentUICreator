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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { nestedSubagentConversationScenario } from "@agent-ui/mock-agent";
import { runMockScenario } from "@agent-ui/mock-agent";
import { createAssistantUiToolkit } from "../agent-ui/adapters/assistant-ui/toolkit";
import { Thread } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui";

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
    toolkit: createAssistantUiToolkit({ mockAgentElements: true }),
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
      <Thread autoFocus={false} />
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
      part.toolName === "mock_invoke_researcher",
    );
    if (parentTool?.type !== "tool-call") {
      throw new Error("official adapter did not materialize the parent tool call");
    }

    expect(parentTool.messages).toHaveLength(1);
    const nestedText = parentTool.messages
      ?.flatMap((message) => message.content)
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
      '[data-slot="mock-nested-subagent-conversation"]',
    );
    expect(nested).not.toBeNull();
    expect(nested?.textContent).toContain("我先检查 Agent UI 的核心 Runtime");
    expect(nested?.textContent).toContain("Searched files");
    expect(nested?.textContent).toContain("检查完成：当前项目由 assistant-ui Runtime");

    expect(
      runtimeFixture.container.querySelectorAll(
        '[data-slot="mock-nested-assistant-message"]',
      ),
    ).toHaveLength(1);
    const nestedMessage = runtimeFixture.container.querySelector(
      '[data-slot="mock-nested-assistant-message"]',
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

  it("uses one nested disclosure and keeps the researcher identity singular", async () => {
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
      '[data-slot="mock-invoke-researcher-tool"]',
    );
    const trigger = nestedTool?.querySelector(
      '[data-slot="mock-nested-subagent-trigger"]',
    ) as HTMLButtonElement | null;
    const chevron = nestedTool?.querySelector(
      '[data-slot="mock-nested-subagent-chevron"]',
    );
    const conversation = nestedTool?.querySelector(
      '[data-slot="mock-nested-subagent-conversation"]',
    );

    expect(nestedTool).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(chevron).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.classList.contains("rotate-90")).toBe(true);
    expect(conversation).not.toBeNull();

    const matches =
      nestedTool?.textContent?.match(/Architecture Researcher/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(
      nestedTool?.querySelectorAll(
        '[data-slot="mock-nested-subagent-conversation"]',
      ),
    ).toHaveLength(1);
    expect(
      nestedTool?.querySelectorAll(
        '[data-slot="mock-nested-assistant-message"]',
      ),
    ).toHaveLength(1);

    await act(async () => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(chevron?.classList.contains("rotate-90")).toBe(false);
    expect(
      nestedTool?.querySelector(
        '[data-slot="mock-nested-subagent-conversation"]',
      ),
    ).toBeNull();

    await act(async () => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.classList.contains("rotate-90")).toBe(true);
    expect(
      nestedTool?.querySelector(
        '[data-slot="mock-nested-subagent-conversation"]',
      ),
    ).not.toBeNull();
  });

  it("keeps the nested researcher tool mock-only", () => {
    const productionToolkit = createAssistantUiToolkit() as Record<string, unknown>;
    const mockToolkit = createAssistantUiToolkit({ mockAgentElements: true }) as Record<string, unknown>;

    expect(productionToolkit.mock_invoke_researcher).toBeUndefined();
    expect(mockToolkit.mock_invoke_researcher).toBeDefined();
  });
});
