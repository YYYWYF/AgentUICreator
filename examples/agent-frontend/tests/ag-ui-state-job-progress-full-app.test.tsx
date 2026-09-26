// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Observable } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentRuntimeBridge,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";
import {
  agentStateSyncScenario,
  runMockScenario,
} from "@agent-ui/mock-agent";
import type { AppAgentState } from "../agent-contract/agent-state";
import appUIJson from "../app-ui/app-ui.json";
import {
  ConversationPresentationConfigProvider,
  conversationPresentationConfig,
} from "../agent-ui/conversation/config";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { RuntimePanel } from "../src/dev/DevStudio/RuntimePanel";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { ModeShell } from "../runtime/mode-shell";
import { AgentRuntimeProvider } from "../runtime/context";
import {
  PluginServiceProvider,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import {
  buildRuntimeComposition,
  type RuntimeCompositionBuildResult,
} from "../runtime/composition";

const mountedRoots: Root[] = [];
const fullAppToolkit = createConversationToolkit({ mockAgentElements: true });

type IndexedEvent = {
  event: BaseEvent;
  index: number;
};

type EventWaiter = {
  type: EventType;
  afterIndex: number;
  resolve(value: IndexedEvent): void;
};

class ScenarioAgent extends AbstractAgent {
  readonly runInputs: RunAgentInput[] = [];
  readonly emittedEvents: BaseEvent[] = [];
  private readonly waiters: EventWaiter[] = [];

  constructor() {
    super({ threadId: "state-job-progress-full-app" });
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    this.runInputs.push(input);

    return new Observable<BaseEvent>((subscriber) => {
      let stopped = false;
      void (async () => {
        try {
          for await (const event of runMockScenario(
            input,
            agentStateSyncScenario,
            { timingScale: 0 },
          )) {
            if (stopped) return;
            const indexed: IndexedEvent = {
              event: event as BaseEvent,
              index: this.emittedEvents.length,
            };
            this.emittedEvents.push(indexed.event);
            subscriber.next(indexed.event);
            this.resolveWaiters(indexed);
            await Promise.resolve();
          }
          if (!stopped) subscriber.complete();
        } catch (error) {
          if (!stopped) subscriber.error(error);
        }
      })();

      return () => {
        stopped = true;
      };
    });
  }

  waitFor(type: EventType, afterIndex = -1): Promise<IndexedEvent> {
    const existingIndex = this.emittedEvents.findIndex(
      (event, index) => index > afterIndex && event.type === type,
    );
    const existing = this.emittedEvents[existingIndex];
    if (existing !== undefined) {
      return Promise.resolve({ event: existing, index: existingIndex });
    }

    return new Promise((resolve) => {
      this.waiters.push({ type, afterIndex, resolve });
    });
  }

  private resolveWaiters(indexed: IndexedEvent): void {
    for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.waiters[index];
      if (
        waiter === undefined ||
        waiter.type !== indexed.event.type ||
        waiter.afterIndex >= indexed.index
      ) {
        continue;
      }
      this.waiters.splice(index, 1);
      waiter.resolve(indexed);
    }
  }
}

function AssistantRuntimeCapture({
  onRuntime,
}: {
  onRuntime(runtime: AssistantRuntime): void;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error("assistant-ui Runtime was not created");
  }
  onRuntime(runtime);
  return null;
}

function FullAppHarness({
  composition,
  onAssistantRuntime,
  onAgentRuntime,
}: {
  composition: RuntimeCompositionBuildResult<AppAgentState>;
  onAssistantRuntime(runtime: AssistantRuntime): void;
  onAgentRuntime(runtime: ConversationAgentRuntimeBridge<AppAgentState>): void;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  onAgentRuntime(agentRuntime);
  const actions = useMemo<UIPluginRuntimeActions>(
    () => ({
      sendMessage: (input) => agentRuntime.sendMessage(input),
      resumeInterrupts: (responses) => agentRuntime.resumeInterrupts(responses),
      startNewConversation: () => agentRuntime.startNewConversation(),
      abortRun: () => agentRuntime.abort(),
    }),
    [agentRuntime],
  );

  return (
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider
        actions={actions}
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
      >
        <ConversationThreadBindingConnector />
        <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
          <ModeShell mode="platform">
            <div className="agent-ui-conversation development-preview">
              <UIPluginRuntime
                actions={actions}
                className="agent-template-shell"
                model={composition.runtimeModel}
                registry={composition.activeRegistry}
              />
              <RuntimePanel
                endpoint="/__agent-ui/mock"
                mockEnabled
              />
            </div>
          </ModeShell>
        </ConversationPresentationConfigProvider>
      </PluginServiceProvider>
      <AssistantRuntimeCapture onRuntime={onAssistantRuntime} />
    </AgentRuntimeProvider>
  );
}

async function flushReact(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function applicationStatePanel(container: HTMLElement): HTMLElement | null {
  return Array.from(container.querySelectorAll("section")).find((section) =>
    section.querySelector("h4")?.textContent === "Application State",
  ) ?? null;
}

function transcriptJobProgress(container: HTMLElement): HTMLElement | null {
  return container.querySelector(
    '[data-slot="aui_message-group"] [data-slot="job-progress"], ' +
    '[data-slot="aui_assistant-message-root"] [data-slot="job-progress"]',
  );
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AG-UI State → JobProgress full application chain", () => {
  it("anchors the Tool UI in the transcript while State updates it in place", async () => {
    const composition = await buildRuntimeComposition({
      appUIModelSource: JSON.stringify(appUIJson),
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
    expect(composition.runtimeModel.pluginInstances["job-progress-main"])
      .toBeUndefined();
    expect(composition.activeRegistry.get("job-progress")).toBeUndefined();

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const agent = new ScenarioAgent();
    const binding = createConversationServiceThreadBinding<AppAgentState>();
    let assistantRuntime: AssistantRuntime | undefined;
    let agentRuntime: ConversationAgentRuntimeBridge<AppAgentState> | undefined;

    await act(async () => {
      root.render(
        <ConversationRuntimeProvider<AppAgentState>
          endpoint="/__agent-ui/mock"
          threadBinding={binding}
          toolkit={fullAppToolkit}
          unstable_agentFactory={() => agent}
        >
          <FullAppHarness
            composition={composition}
            onAssistantRuntime={(runtime) => {
              assistantRuntime = runtime;
            }}
            onAgentRuntime={(runtime) => {
              agentRuntime = runtime;
            }}
          />
        </ConversationRuntimeProvider>,
      );
      await flushReact();
    });

    if (assistantRuntime === undefined || agentRuntime === undefined) {
      throw new Error("The full application runtime was not captured");
    }
    const activeAssistantRuntime = assistantRuntime;
    const activeAgentRuntime = agentRuntime;

    const snapshot = agent.waitFor(EventType.STATE_SNAPSHOT);
    let sendPromise!: Promise<void>;
    await act(async () => {
      sendPromise = activeAgentRuntime.sendMessage("验证当前修改能否通过 CI");
      await flushReact();
    });
    let snapshotEvent!: IndexedEvent;
    await act(async () => {
      snapshotEvent = await snapshot;
      await flushReact();
    });

    const initialState = activeAgentRuntime.getSnapshot().state;
    expect(initialState).toEqual({
      jobs: {
        "ci-job-1": {
          stageIndex: 0,
          stageProgress: 0.1,
          eta: "about 4 min",
        },
      },
    });
    expect(activeAssistantRuntime.thread.getState().state).toEqual(initialState);

    const toolStart = await agent.waitFor(EventType.TOOL_CALL_START, snapshotEvent.index);
    const toolArgs = await agent.waitFor(EventType.TOOL_CALL_ARGS, toolStart.index);
    const toolEndPromise = agent.waitFor(EventType.TOOL_CALL_END, toolArgs.index);
    let toolEnd!: IndexedEvent;
    await act(async () => {
      toolEnd = await toolEndPromise;
      await flushReact();
    });

    expect(toolStart.event).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "ci-job-1",
      toolCallName: "run_ci_job",
    });
    expect(toolArgs.event).toMatchObject({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "ci-job-1",
    });
    if (!("delta" in toolArgs.event) || typeof toolArgs.event.delta !== "string") {
      throw new Error("CI tool arguments did not contain a string delta");
    }
    expect(JSON.parse(toolArgs.event.delta)).toEqual({
      target: "Verify the current change on CI",
      stages: [
        { name: "clone", weight: 1 },
        { name: "install", weight: 3 },
        { name: "build", weight: 3 },
        { name: "test", weight: 3 },
      ],
    });
    expect(toolEnd.event).toMatchObject({
      type: EventType.TOOL_CALL_END,
      toolCallId: "ci-job-1",
    });

    const initialJobProgress = transcriptJobProgress(container);
    expect(initialJobProgress).not.toBeNull();
    expect(initialJobProgress?.textContent).toContain("Verify the current change on CI");
    expect(initialJobProgress?.textContent).toContain("clone");
    expect(initialJobProgress?.textContent).toContain("install");
    expect(initialJobProgress?.textContent).toContain("build");
    expect(initialJobProgress?.textContent).toContain("test");
    expect(initialJobProgress?.textContent).toContain("about 4 min");
    expect(initialJobProgress?.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector(".conversation-surface-live-status")).toBeNull();

    const messagesBeforeDelta = assistantRuntime.thread.getState().messages;
    const firstDeltaPromise = agent.waitFor(EventType.STATE_DELTA, toolEnd.index);
    let firstDelta!: IndexedEvent;
    await act(async () => {
      firstDelta = await firstDeltaPromise;
      await flushReact();
    });
    expect(firstDelta.index).toBeGreaterThan(toolEnd.index);
    expect(agent.emittedEvents.slice(toolEnd.index + 1, firstDelta.index)
      .some(({ type }) => type === EventType.TOOL_CALL_RESULT)).toBe(false);
    expect(agentRuntime.getSnapshot().state).toMatchObject({
      jobs: {
        "ci-job-1": {
          stageIndex: 0,
          stageProgress: 0.7,
          eta: "about 3 min",
        },
      },
    });
    expect(assistantRuntime.thread.getState().messages).toBe(messagesBeforeDelta);
    expect(transcriptJobProgress(container)).toBe(initialJobProgress);

    let lastDelta = firstDelta;
    for (let count = 1; count < 5; count += 1) {
      const nextDeltaPromise = agent.waitFor(EventType.STATE_DELTA, lastDelta.index);
      await act(async () => {
        lastDelta = await nextDeltaPromise;
        await flushReact();
      });
    }
    expect(lastDelta.index).toBeGreaterThan(firstDelta.index);
    expect(agentRuntime.getSnapshot().state).toMatchObject({
      jobs: {
        "ci-job-1": {
          stageIndex: 4,
          stageProgress: 0,
          eta: "less than 1 min",
        },
      },
    });
    expect(transcriptJobProgress(container)).toBe(initialJobProgress);

    const toolResultPromise = agent.waitFor(EventType.TOOL_CALL_RESULT, lastDelta.index);
    let toolResult!: IndexedEvent;
    await act(async () => {
      toolResult = await toolResultPromise;
      await flushReact();
    });
    expect(toolEnd.index).toBeLessThan(firstDelta.index);
    expect(firstDelta.index).toBeLessThan(lastDelta.index);
    expect(lastDelta.index).toBeLessThan(toolResult.index);
    expect(toolResult.event).toMatchObject({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: "ci-job-1",
      content: JSON.stringify({
        success: true,
        summary: "All CI stages passed",
      }),
    });

    const finished = agent.waitFor(EventType.RUN_FINISHED, toolResult.index);
    await act(async () => {
      await finished;
      await sendPromise;
      await flushReact();
    });

    expect(agent.emittedEvents.filter(({ type }) => type === EventType.STATE_DELTA))
      .toHaveLength(5);
    const finalState = agentRuntime.getSnapshot().state;
    expect(finalState).toMatchObject({
      jobs: {
        "ci-job-1": {
          stageIndex: 4,
          stageProgress: 0,
        },
      },
    });
    expect(assistantRuntime.thread.getState().state).toEqual(finalState);
    expect(assistantRuntime.thread.getState().isRunning).toBe(false);

    const finalJobProgress = transcriptJobProgress(container);
    expect(finalJobProgress).toBe(initialJobProgress);
    expect(finalJobProgress?.textContent).toContain("done");
    expect(
      finalJobProgress?.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("100");
    expect(finalJobProgress?.querySelector('[aria-label="Cancel the job"]')).toBeNull();

    expect(container.textContent).toContain("CI 验证完成，所有阶段通过。");

    const assistantMessages = container.querySelectorAll(
      '[data-slot="aui_assistant-message-root"]',
    );
    expect(assistantMessages).toHaveLength(1);

    const footers = container.querySelectorAll(
      '[data-slot="aui_assistant-response-footer"]',
    );
    expect(footers).toHaveLength(1);

    const footerPlugins = container.querySelectorAll(
      '[data-slot="aui_assistant-response-footer-plugin"]',
    );
    expect(footerPlugins).toHaveLength(1);

    const assistantMessage = assistantMessages[0]!;
    expect(
      assistantMessage.querySelector('[data-slot="job-progress"]'),
    ).not.toBeNull();
    expect(assistantMessage.textContent).toContain("CI 验证完成，所有阶段通过。");
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();

    const statePanel = applicationStatePanel(container);
    expect(statePanel).not.toBeNull();
    expect(statePanel?.textContent).toContain("ci-job-1");
    expect(statePanel?.textContent).toContain('"stageIndex": 4');
  });
});
