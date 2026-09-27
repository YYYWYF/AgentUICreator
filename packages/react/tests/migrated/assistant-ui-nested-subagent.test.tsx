// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { Observable } from "rxjs";
import { readFile } from "node:fs/promises";
import { TaskGroup as PinnedTaskGroup } from "../../src/internal/vendor/assistant-ui/components/assistant-ui/elements/task-card.aui";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  multiMessageResponseScenario,
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  nestedSubagentTaskGroupScenario,
  type MockScenario,
} from "@agent-ui/mock-agent";
import { runMockScenario } from "@agent-ui/mock-agent";
import { ConversationAdapter } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/ConversationAdapter";
import { createConversationToolkit } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/toolkit/index";
import { AssistantUiResponseFooterPlugin } from "../../../source-registry/registry/items/plugin-assistant-ui-response-footer/files/plugins/assistant-ui-response-footer/index";
import { TaskGroupPlugin } from "../../../source-registry/registry/items/plugin-task-group/files/plugins/task-group/index";
import type { UIPluginRenderScope } from "../../../project-control/src/framework/contracts/ui-plugin";
import {
  PluginRenderScopeProvider,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";

// Native TaskCard has no nested transcript override at this fixed revision.
// When upstream renders reasoning/errors, these gap tests must fail: remove the
// product composition once positive acceptance works through native TaskCard.
const PINNED_TASK_CARD_REVISION = "da9a624496ae97864ae30e90f85c7533092a228d";
async function expectPinnedTaskCardRevision() {
  const lockPath = "../../src/internal/vendor/assistant-ui/assistant-ui-upstream.lock.json";
  const lock = JSON.parse(await readFile(new URL(lockPath, import.meta.url), "utf8"));
  expect(lock.revision).toBe(PINNED_TASK_CARD_REVISION);
}

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
const serviceRuntimes: PluginServiceRuntime[] = [];
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Test protocol projection with the browser's reduced-motion preference;
  // animation timing has its own upstream tests.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});

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

type EventPredicate = (event: BaseEvent) => boolean;

/**
 * Pump the real delayed iterator straight into the official AbstractAgent.
 * A test can hold delivery AFTER an event, to inspect lifecycle boundaries
 * which the runner otherwise yields in the same tick (finish vs parent result).
 * No events are collected ahead of delivery and no protocol state is projected.
 */
class StreamingScenarioAgent extends AbstractAgent {
  readonly events: BaseEvent[] = [];
  pausedEvent: BaseEvent | undefined;
  signal: AbortSignal | undefined;
  holdAfter: EventPredicate = () => false;
  private release: (() => void) | undefined;

  constructor(private readonly scenario: MockScenario) {
    super({ threadId: mockInput.threadId });
  }

  resume() {
    this.release?.();
    this.release = undefined;
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      this.signal = controller.signal;
      void (async () => {
        try {
          for await (const event of runMockScenario(input, this.scenario, {
            timingScale: 1,
            signal: controller.signal,
          })) {
            if (subscriber.closed || controller.signal.aborted) break;
            subscriber.next(event);
            this.events.push(event);
            if (this.holdAfter(event)) {
              this.pausedEvent = event;
              await new Promise<void>((resolve) => { this.release = resolve; });
            }
          }
          if (!subscriber.closed) subscriber.complete();
        } catch (error) {
          if (!subscriber.closed) subscriber.error(error);
        }
      })();
      return () => {
        controller.abort();
        this.resume();
      };
    });
  }

  async advanceTo(predicate: EventPredicate) {
    this.holdAfter = predicate;
    this.pausedEvent = undefined;
    this.resume();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    for (let timer = 0; timer < 1024 && this.pausedEvent === undefined; timer++) {
      if (vi.getTimerCount() === 0) break;
      await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
    }
    expect(this.pausedEvent, "stream did not reach the requested checkpoint").toBeDefined();
    // Markdown renderers schedule a frame; the iterator is held, so flushing
    // presentation cannot accidentally deliver the next protocol event.
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  }

  async finish() {
    this.holdAfter = () => false;
    this.resume();
    await act(async () => { await vi.runAllTimersAsync(); });
  }
}

function eventIs(type: string, id?: string): EventPredicate {
  return (event) => event.type === type && (id === undefined ||
    ("toolCallId" in event && event.toolCallId === id) ||
    ("subagentRunId" in event && event.subagentRunId === id));
}

type ToolPart = Extract<ThreadMessage["content"][number], { type: "tool-call" }>;

function toolPart(message: ThreadMessage | undefined, toolCallId: string): ToolPart {
  const part = message?.content.find((part) =>
    part.type === "tool-call" && part.toolCallId === toolCallId);
  if (part?.type !== "tool-call") throw new Error(`Missing tool ${toolCallId}`);
  return part;
}

function partText(message: ThreadMessage | undefined, type: "text" | "reasoning") {
  return message?.content.flatMap((part) =>
    part.type === type ? [part.text] : []).join("") ?? "";
}

function renderConversationScopedSlot(
  slotName: string,
  scope: UIPluginRenderScope,
  fallback?: ReactNode,
  upstreamTaskCard = false,
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
  if (upstreamTaskCard) {
    return <PinnedTaskGroup group={(scope.value as { group: Parameters<typeof PinnedTaskGroup>[0]["group"] }).group} />;
  }
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
  upstreamTaskCard = false,
}: {
  agent: AbstractAgent;
  onRuntime: (runtime: AgUiAssistantRuntime) => void;
  config?: typeof assistantConfig;
  upstreamTaskCard?: boolean;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <ConversationAdapter renderScopedSlot={(slot, scope, fallback) => renderConversationScopedSlot(slot, scope, fallback, upstreamTaskCard)} />
    </AssistantRuntimeProvider>
  );
}

async function mountRuntime(
  agent: AbstractAgent,
  config: typeof assistantConfig = assistantConfig,
  upstreamTaskCard = false,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const services = new PluginServiceRuntime();
  serviceRuntimes.push(services);
  let runtime: AgUiAssistantRuntime | undefined;
  await act(async () => {
    root.render(
      <PluginServiceRuntimeContext.Provider value={services}>
        <RuntimeHarness
          agent={agent}
          config={config}
          upstreamTaskCard={upstreamTaskCard}
          onRuntime={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      </PluginServiceRuntimeContext.Provider>,
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
  for (const services of serviceRuntimes.splice(0)) services.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

const taskPresentations = [
  { suite: "Streaming Contract", upstreamTaskCard: true },
  { suite: "Product presentation acceptance", upstreamTaskCard: false },
] as const;

describe("Subagent Streaming Contract Tests and product acceptance", () => {
  it.each(taskPresentations)("$suite: streams nested subagent work into TaskCard before SUBAGENT_FINISHED", async ({ upstreamTaskCard }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const agent = new StreamingScenarioAgent(nestedSubagentConversationScenario);
    agent.holdAfter = eventIs("TOOL_CALL_ARGS", "invoke-researcher-1");
    const { container, runtime } = await mountRuntime(agent, assistantConfig, upstreamTaskCard);
    await act(async () => {
      void runtime.thread.append({ role: "user", content: [{ type: "text", text: "检查架构" }], startRun: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    const parent = () => toolPart(assistantMessages(runtime)[0], "invoke-researcher-1");
    const nested = () => parent().messages?.[0];
    const card = () => container.querySelector('[data-slot="task-card"]');
    const noFinalResult = () => {
      expect(parent().result).toBeUndefined();
      expect(agent.events.some(eventIs("SUBAGENT_FINISHED"))).toBe(false);
      expect(runtime.thread.getState().isRunning).toBe(true);
      expect(container.querySelector('[data-slot="aui_assistant-response-footer"]')).toBeNull();
    };

    // A: The run has started, but the parent has neither nested output nor a result.
    expect(agent.events.map(({ type }) => type)).toEqual(["RUN_STARTED", "TOOL_CALL_START", "TOOL_CALL_ARGS"]);
    expect(parent().messages).toBeUndefined();
    expect(card()).toBeNull();
    noFinalResult();

    // B: SUBAGENT_STARTED materializes a running TaskCard before any child content.
    await agent.advanceTo(eventIs("SUBAGENT_STARTED", "researcher-1"));
    expect(parent().messages).toHaveLength(1);
    expect(nested()?.status?.type).toBe("running");
    expect(nested()?.content).toHaveLength(0);
    expect(card()?.getAttribute("data-state")).toBe("working");
    noFinalResult();
    await openTaskCards(container);
    const originalCard = card();
    const originalMessageId = nested()?.id;

    // C: Reasoning starts empty, then its first delta reaches the same transcript.
    await agent.advanceTo(eventIs("REASONING_START", "researcher-1"));
    expect(nested()?.status?.type).toBe("running");
    expect(partText(nested(), "reasoning")).toBe("");
    noFinalResult();

    const reasoningStep = nestedSubagentConversationScenario.steps[0];
    if (reasoningStep?.type !== "subagent-tool") throw new Error("Missing reference subagent");
    const fullReasoning = reasoningStep.subagent.steps.find((step) => step.type === "reasoning")?.text ?? "";
    const fullText = reasoningStep.subagent.steps.find((step) => step.type === "message")?.text ?? "";
    await agent.advanceTo(eventIs("REASONING_MESSAGE_CONTENT", "researcher-1"));
    const partialReasoning = partText(nested(), "reasoning");
    expect(partialReasoning.length).toBeGreaterThan(0);
    expect(partialReasoning.length).toBeLessThan(fullReasoning.length);
    if (!upstreamTaskCard) {
      expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain(partialReasoning);
    }
    noFinalResult();

    // D: Argument completion and execution completion are separate child tool events.
    await agent.advanceTo((event) => event.type === "TOOL_CALL_START" && "subagentRunId" in event && event.subagentRunId === "researcher-1");
    const childToolId = nested()?.content.find((part) => part.type === "tool-call")?.toolCallId;
    if (childToolId === undefined) throw new Error("Missing streamed child tool");
    const child = () => toolPart(nested(), childToolId);
    expect(child().toolName).toBe("search_files");
    expect(child().result).toBeUndefined();
    expect(container.querySelector('[data-slot="tool-call"] [aria-hidden="false"]')?.textContent).toContain("Searching files");
    noFinalResult();

    await agent.advanceTo(eventIs("TOOL_CALL_ARGS", childToolId));
    expect(child().args).toEqual({ keyword: "conversation runtime" });
    expect(child().result).toBeUndefined();
    expect(container.textContent).toContain("Searching files");
    expect(container.querySelector('[data-slot="tool-call"] [aria-hidden="false"]')?.textContent).toContain("Searching files");
    noFinalResult();

    await agent.advanceTo(eventIs("TOOL_CALL_END", childToolId));
    expect(child().result).toBeUndefined();
    expect(container.textContent).toContain("Searching files");
    expect(container.querySelector('[data-slot="tool-call"] [aria-hidden="false"]')?.textContent).toContain("Searching files");
    noFinalResult();
    await agent.advanceTo(eventIs("TOOL_CALL_RESULT", childToolId));
    expect(child().toolCallId).toBe(childToolId);
    expect(nested()?.content.filter((part) => part.type === "tool-call" && part.toolCallId === childToolId)).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="tool-call"]')).toHaveLength(1);
    expect(card()).toBe(originalCard);
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);
    expect(child().result).toEqual({ files: [
      "packages/runtime-conversation/src/ConversationRuntimeProvider.tsx",
      "examples/creator-host-sandbox/src/agent-ui/conversation/ConversationAdapter.tsx",
    ] });
    expect(container.textContent).toContain("Searched files");
    expect(container.querySelector('[data-slot="tool-call"] [aria-hidden="false"]')?.textContent).toContain("Searched files");
    const childDisclosure = container.querySelector<HTMLButtonElement>('[data-slot="tool-call"] button');
    if (!childDisclosure) throw new Error("Missing child tool disclosure");
    await act(async () => childDisclosure.click());
    expect(container.textContent).toContain("2 files found");
    noFinalResult();

    // E: Two successive text deltas extend one message before the subagent settles.
    await agent.advanceTo(eventIs("TEXT_MESSAGE_START", "researcher-1"));
    expect(partText(nested(), "text")).toBe("");
    await agent.advanceTo(eventIs("TEXT_MESSAGE_CONTENT", "researcher-1"));
    const partialText = partText(nested(), "text");
    expect(partialText.length).toBeGreaterThan(0);
    expect(partialText.length).toBeLessThan(fullText.length);
    expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain(partialText);
    noFinalResult();
    await agent.advanceTo(eventIs("TEXT_MESSAGE_CONTENT", "researcher-1"));
    const longerText = partText(nested(), "text");
    expect(longerText.startsWith(partialText)).toBe(true);
    expect(longerText.length).toBeGreaterThan(partialText.length);
    expect(longerText.length).toBeLessThan(fullText.length);
    expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain(longerText);
    expect(partText(nested(), "reasoning")).toBe(fullReasoning);
    expect(child().result).toBeDefined();
    expect(nested()?.id).toBe(originalMessageId);
    expect(card()).toBe(originalCard);
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="aui_task-transcript-message"]')).toHaveLength(1);
    noFinalResult();

    await agent.advanceTo(eventIs("TEXT_MESSAGE_END", "researcher-1"));
    expect(partText(nested(), "text")).toBe(fullText);
    expect(nested()?.status?.type).toBe("running");
    noFinalResult();

    // F: Nested completion precedes the independent parent tool result.
    await agent.advanceTo(eventIs("SUBAGENT_FINISHED", "researcher-1"));
    expect(nested()?.status?.type).toBe("complete");
    expect(nested()?.metadata.custom.agui).toMatchObject({ result: { summary: "Conversation Runtime inspection complete" } });
    expect(parent().result).toBeUndefined();
    expect(card()?.getAttribute("data-state")).toBe("working");
    expect(runtime.thread.getState().isRunning).toBe(true);

    await agent.advanceTo(eventIs("TOOL_CALL_RESULT", "invoke-researcher-1"));
    expect(parent().result).toEqual({ summary: "Conversation Runtime inspection complete" });
    expect(card()?.getAttribute("data-state")).toBe("done");
    expect(container.querySelector('[data-slot="task-card-result"]')?.textContent).toContain("Conversation Runtime inspection complete");
    expect(runtime.thread.getState().isRunning).toBe(true);
    expect(container.querySelector('[data-slot="aui_assistant-response-footer"]')).toBeNull();

    // G: Only the completed run exposes its footer; transcript identities stay unique.
    await agent.finish();
    expect(agent.events.at(-1)?.type).toBe("RUN_FINISHED");
    expect(runtime.thread.getState().isRunning).toBe(false);
    expect(assistantMessages(runtime)).toHaveLength(1);
    expect(parent().messages).toHaveLength(1);
    expect(nested()?.id).toBe(originalMessageId);
    expect(partText(nested(), "text")).toBe(fullText);
    await openTaskCards(container);
    expect(card()?.getAttribute("data-state")).toBe("done");
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="aui_task-transcript-message"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
  });

  it.each(taskPresentations)("$suite: streams recursive TaskCard B and reasoning while subagent A is running", async ({ upstreamTaskCard }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const agent = new StreamingScenarioAgent(nestedSubagentRecursiveScenario);
    agent.holdAfter = eventIs("TOOL_CALL_ARGS", "parent-tool");
    const { container, runtime } = await mountRuntime(agent, assistantConfig, upstreamTaskCard);
    await act(async () => { void runtime.thread.append({ role: "user", content: [{ type: "text", text: "递归检查" }], startRun: true }); });
    const parent = () => toolPart(assistantMessages(runtime)[0], "parent-tool");
    const subagentA = () => parent().messages?.[0];
    const child = () => toolPart(subagentA(), "child-tool");
    const subagentB = () => child().messages?.[0];

    await agent.advanceTo(eventIs("REASONING_MESSAGE_CONTENT", "subagent-a"));
    await openTaskCards(container);
    expect(subagentA()?.status?.type).toBe("running");
    expect(partText(subagentA(), "reasoning").length).toBeGreaterThan(0);
    if (!upstreamTaskCard) {
      expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain(partText(subagentA(), "reasoning"));
    }
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);

    await agent.advanceTo(eventIs("TOOL_CALL_START", "child-tool"));
    expect(child().messages).toBeUndefined();
    expect(child().result).toBeUndefined();
    await agent.advanceTo(eventIs("SUBAGENT_STARTED", "subagent-b"));
    await openTaskCards(container);
    expect(subagentA()?.status?.type).toBe("running");
    expect(subagentB()?.status?.type).toBe("running");
    expect(child().messages).toHaveLength(1);
    const cards = [...container.querySelectorAll('[data-slot="task-card"]')];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.contains(cards[1]!)).toBe(true);
    expect(cards.every((card) => card.getAttribute("data-state") === "working")).toBe(true);
    const ids = [subagentA()?.id, subagentB()?.id];

    await agent.advanceTo(eventIs("REASONING_MESSAGE_CONTENT", "subagent-b"));
    expect(partText(subagentB(), "reasoning").length).toBeGreaterThan(0);
    if (!upstreamTaskCard) expect(cards[1]?.textContent).toContain(partText(subagentB(), "reasoning"));
    expect(agent.events.some(eventIs("SUBAGENT_FINISHED"))).toBe(false);

    await agent.advanceTo(eventIs("SUBAGENT_FINISHED", "subagent-b"));
    expect(subagentB()?.status?.type).toBe("complete");
    expect(subagentA()?.status?.type).toBe("running");
    expect(child().result).toBeUndefined();
    await agent.advanceTo(eventIs("TOOL_CALL_RESULT", "child-tool"));
    expect(cards[1]?.getAttribute("data-state")).toBe("done");
    expect(subagentA()?.status?.type).toBe("running");
    await agent.advanceTo(eventIs("SUBAGENT_FINISHED", "subagent-a"));
    expect(subagentA()?.status?.type).toBe("complete");
    expect(parent().result).toBeUndefined();
    await agent.finish();
    expect(runtime.thread.getState().isRunning).toBe(false);
    expect([subagentA()?.id, subagentB()?.id]).toEqual(ids);
    await openTaskCards(container);
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="aui_task-transcript-message"]')).toHaveLength(2);
    const lifecycle = agent.events.filter((event) => ["SUBAGENT_STARTED", "SUBAGENT_FINISHED", "RUN_FINISHED"].includes(event.type));
    expect(lifecycle.map((event) => [event.type, "subagentRunId" in event ? event.subagentRunId : undefined])).toEqual([
      ["SUBAGENT_STARTED", "subagent-a"], ["SUBAGENT_STARTED", "subagent-b"],
      ["SUBAGENT_FINISHED", "subagent-b"], ["SUBAGENT_FINISHED", "subagent-a"],
      ["RUN_FINISHED", undefined],
    ]);
  });

  it.each(taskPresentations)("$suite: terminates an existing streamed transcript on SUBAGENT_ERROR", async ({ upstreamTaskCard }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const agent = new StreamingScenarioAgent(nestedSubagentErrorScenario);
    agent.holdAfter = eventIs("TOOL_CALL_ARGS", "error-parent-tool");
    const { container, runtime } = await mountRuntime(agent, assistantConfig, upstreamTaskCard);
    await act(async () => { void runtime.thread.append({ role: "user", content: [{ type: "text", text: "检查错误分支" }], startRun: true }); });
    const parent = () => toolPart(assistantMessages(runtime)[0], "error-parent-tool");
    const nested = () => parent().messages?.[0];
    await agent.advanceTo(eventIs("SUBAGENT_STARTED", "subagent-error"));
    const startedMessageId = nested()?.id;
    expect(parent().messages).toHaveLength(1);
    expect(nested()?.status?.type).toBe("running");
    expect(container.querySelector('[data-slot="task-card"]')?.getAttribute("data-state")).toBe("working");
    await agent.advanceTo(eventIs("TEXT_MESSAGE_CONTENT", "subagent-error"));
    await openTaskCards(container);
    const card = container.querySelector('[data-slot="task-card"]');
    const message = container.querySelector('[data-slot="aui_task-transcript-message"]');
    const id = nested()?.id;
    expect(id).toBe(startedMessageId);
    const text = partText(nested(), "text");
    expect(text.length).toBeGreaterThan(0);
    expect(message?.textContent).toContain(text);
    expect(nested()?.status?.type).toBe("running");
    expect(message?.querySelector('[role="alert"]')).toBeNull();

    await agent.advanceTo(eventIs("SUBAGENT_ERROR", "subagent-error"));
    expect(nested()?.status).toMatchObject({ type: "incomplete", reason: "error" });
    expect(nested()?.metadata.custom.agui).toMatchObject({ errorCode: "SUBAGENT_RESEARCH_FAILED" });
    expect(nested()?.id).toBe(id);
    expect(container.querySelector('[data-slot="task-card"]')).toBe(card);
    expect(container.querySelector('[data-slot="aui_task-transcript-message"]')).toBe(message);
    expect(partText(nested(), "text").startsWith(text)).toBe(true);
    expect(message?.textContent).toContain("我已经定位到失败分支");
    if (!upstreamTaskCard) {
      expect(message?.querySelector('[role="alert"]')?.textContent).toContain("Researcher failed during runtime inspection");
    }
    expect(parent().result).toBeUndefined();
    expect(card?.getAttribute("data-state")).toBe("working");
    await agent.finish();
    expect(runtime.thread.getState().isRunning).toBe(false);
    await openTaskCards(container);
    expect(container.querySelector('[data-slot="task-card"]')?.getAttribute("data-state")).toBe("done");
    expect(nested()?.id).toBe(id);
    expect(parent().messages).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="aui_task-transcript-message"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);
    if (!upstreamTaskCard) {
      expect(container.querySelector('[data-slot="aui_task-transcript-message"] [role="alert"]')).not.toBeNull();
    }
  });

  it.each(["delay", "checkpoint"] as const)("aborts the scenario iterator while held at a %s on Observable unsubscribe", async (hold) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const agent = new StreamingScenarioAgent(nestedSubagentConversationScenario);
    if (hold === "checkpoint") agent.holdAfter = eventIs("TOOL_CALL_ARGS", "invoke-researcher-1");
    const subscription = agent.run(mockInput).subscribe();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.events.at(-1)?.type).toBe("TOOL_CALL_ARGS");
    const eventCount = agent.events.length;
    subscription.unsubscribe();
    expect(agent.signal?.aborted).toBe(true);
    await vi.runAllTimersAsync();
    expect(agent.events).toHaveLength(eventCount);
    expect(agent.events.some(eventIs("SUBAGENT_STARTED"))).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

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

    expect(runtimeFixture.container.querySelectorAll('[data-slot="task-card"]')).toHaveLength(1);
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
    expect(toolPart(assistantMessages(runtimeFixture.runtime)[0], "invoke-researcher-1").toolName)
      .toBe("customer_defined_agent_tool");
    expect(runtimeFixture.container.textContent).toContain("Inspect Conversation Runtime");
  });

  it("renders sibling nested subagents through the product TaskGroup facade", async () => {
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

describe("Upstream Presentation Gap Tests", () => {
  it("documents pinned assistant-ui TaskCard reasoning presentation gap", async () => {
    await expectPinnedTaskCardRevision();
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(await collectScenarioEvents()),
      assistantConfig,
      true,
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
    const canonicalMessage = toolPart(assistantMessages(runtimeFixture.runtime)[0], "invoke-researcher-1").messages?.[0];
    expect(partText(canonicalMessage, "reasoning")).toContain("我先检查 Conversation Runtime 和 Conversation Adapter");
    expect(nested?.textContent).not.toContain("我先检查 Conversation Runtime 和 Conversation Adapter");
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

  it("documents pinned assistant-ui TaskCard nested error presentation gap", async () => {
    await expectPinnedTaskCardRevision();
    const runtimeFixture = await mountRuntime(
      new ScenarioEventAgent(
        await collectScenarioEvents(nestedSubagentErrorScenario),
      ),
      assistantConfig,
      true,
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
    expect(errorAlert).toBeNull();
    expect(partText(errorMessage, "text")).toContain("我已经定位到失败分支");
    expect(runtimeFixture.container.textContent).toContain(
      "我已经定位到失败分支",
    );
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
