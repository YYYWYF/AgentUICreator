import type { AgentSubscriber } from "@ag-ui/client";
import type {
  AgentApplicationEventListener,
  AgentRuntime,
} from "@agent-ui/runtime-core";

export interface AssistantUiSubscribableAgent {
  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void };
}

export class AssistantUiApplicationEventSource {
  private readonly listeners = new Set<AgentApplicationEventListener>();
  private unsubscribeFromAgent: (() => void) | undefined;

  constructor(private readonly agent: AssistantUiSubscribableAgent) {}

  start(): void {
    if (this.unsubscribeFromAgent !== undefined) return;
    const subscription = this.agent.subscribe({
      onCustomEvent: ({ event }) => {
        const applicationEvent = {
          name: event.name,
          payload: structuredClone(event.value),
          producer: event.subagentRunId === undefined
            ? { type: "root" as const }
            : { type: "subagent" as const, id: event.subagentRunId },
        };
        for (const listener of this.listeners) listener(applicationEvent);
      },
    });
    this.unsubscribeFromAgent = () => subscription.unsubscribe();
  }

  subscribe(listener: AgentApplicationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.unsubscribeFromAgent?.();
    this.unsubscribeFromAgent = undefined;
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }
}

export type AgentRuntimeApplicationEventSource = Pick<
  AgentRuntime,
  "subscribeApplicationEvents"
>;
