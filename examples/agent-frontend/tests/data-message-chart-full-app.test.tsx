// @vitest-environment jsdom

import { AbstractAgent, type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import { act, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";
import { dataMessageChartScenario, runMockScenario } from "@agent-ui/mock-agent";
import appUIJson from "../app-ui/app-ui.json";
import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { buildRuntimeComposition } from "../runtime/composition";
import { PluginServiceProvider, type UIPluginRuntimeActions } from "../runtime/plugins";
import { PluginDataMessageUIHost } from "../runtime/plugins/PluginDataMessageUIHost";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class ChartScenarioAgent extends AbstractAgent {
  readonly events: BaseEvent[] = [];

  constructor() {
    super({ threadId: "data-message-chart" });
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      let stopped = false;
      void (async () => {
        try {
          for await (const event of runMockScenario(input, dataMessageChartScenario, { timingScale: 0 })) {
            if (stopped) return;
            this.events.push(event as BaseEvent);
            subscriber.next(event as BaseEvent);
            await Promise.resolve();
          }
          if (!stopped) subscriber.complete();
        } catch (error) {
          if (!stopped) subscriber.error(error);
        }
      })();
      return () => { stopped = true; };
    });
  }
}

function Harness({
  model,
  registry,
  onActions,
}: {
  model: Awaited<ReturnType<typeof buildRuntimeComposition>>["runtimeModel"];
  registry: Awaited<ReturnType<typeof buildRuntimeComposition>>["activeRegistry"];
  onActions(actions: UIPluginRuntimeActions): void;
}) {
  const { agentRuntime } = useConversationRuntimeBridge();
  const actions = useMemo<UIPluginRuntimeActions>(() => ({
    sendMessage: (input) => agentRuntime.sendMessage(input),
    resumeInterrupts: (responses) => agentRuntime.resumeInterrupts(responses),
    startNewConversation: () => agentRuntime.startNewConversation(),
    abortRun: () => agentRuntime.abort(),
  }), [agentRuntime]);
  onActions(actions);

  return (
    <PluginServiceProvider model={model} registry={registry} actions={actions}>
      <PluginDataMessageUIHost model={model} registry={registry} />
      <ConversationAdapter />
    </PluginServiceProvider>
  );
}

describe("AG-UI CUSTOM → Data Message UI", () => {
  it("renders the chart inside the assistant transcript from the mock stream", async () => {
    const composition = await buildRuntimeComposition({
      appUIModelSource: JSON.stringify(appUIJson),
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
    const agent = new ChartScenarioAgent();
    const threadBinding = createConversationServiceThreadBinding();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let actions: UIPluginRuntimeActions | undefined;
    try {
      await act(async () => {
        root.render(
          <ConversationRuntimeProvider
            endpoint="/__agent-ui/mock"
            threadBinding={threadBinding}
            unstable_agentFactory={() => agent}
          >
            <Harness
              model={composition.runtimeModel}
              registry={composition.activeRegistry}
              onActions={(value) => { actions = value; }}
            />
          </ConversationRuntimeProvider>,
        );
      });
      if (actions === undefined) throw new Error("Runtime actions were not mounted");
      await act(async () => { await actions.sendMessage("Show quarterly sales"); });

      expect(agent.events.some((event) => event.type === EventType.CUSTOM &&
        "name" in event && event.name === "chart")).toBe(true);
      const chart = container.querySelector(".agent-ui-chart-message");
      expect(chart).not.toBeNull();
      expect(chart?.closest('[data-slot="aui_assistant-message-root"]')).not.toBeNull();
      expect(chart?.textContent).toContain("Quarterly Sales");
      expect(chart?.textContent).toContain("Q4");
      expect(container.textContent).toContain("下面是季度销售情况：");
      expect(container.textContent).toContain("Q4 是当前最高季度。");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
