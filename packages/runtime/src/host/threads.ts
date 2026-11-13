import type { AgentRuntime, AgentRuntimeSnapshot, AgentUserInput, AgentInterruptResponse } from "@za38.03/agent-ui-core";
export interface AgentUISendOptions {
  /** Override the default endpoint for this send and its continuations. */
  endpoint?: string | undefined;
}
/** A handle to one upstream-owned thread. Reading it never navigates the UI. */
export interface AgentUIThread {
  getSnapshot(): AgentRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeApplicationEvents: AgentRuntime["subscribeApplicationEvents"];
  sendMessage(input: string | AgentUserInput, options?: AgentUISendOptions): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  abortRun(): void;
}

/** Installed by the canonical conversation provider, not by Plugins. */
export interface AgentUIThreadNavigation {
  createThread(): Promise<string>;
  openThread(threadId: string): Promise<void>;
  /** Send the native draft, including its attachments and quote. */
  sendComposer(options?: AgentUISendOptions): Promise<void>;
}

export type AgentUIThreadRuntime = Omit<AgentRuntime, "sendMessage"> & Pick<AgentUIThread, "sendMessage">;

/** Observation and delegation only; assistant-ui owns storage and lifetime. */
export class HostThreads {
  private sources = new Map<string, AgentUIThread>();
  private snapshot: readonly AgentRuntimeSnapshot[] = [];
  private listeners = new Set<() => void>();
  navigation: AgentUIThreadNavigation | undefined;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = (id: string) => this.sources.get(id);
  private publish = () => {
    this.snapshot = [...this.sources.values()].map(source => source.getSnapshot());
    for (const listener of [...this.listeners]) listener();
  };
  register(runtime: AgentUIThreadRuntime) {
    const id = runtime.getSnapshot().conversation.id;
    // Upstream may commit the replacement bridge before retiring the previous
    // one (including optimistic identity promotion). Cleanup is owner-checked.
    const handle: AgentUIThread = {
      getSnapshot: runtime.getSnapshot.bind(runtime), subscribe: runtime.subscribe.bind(runtime),
      subscribeApplicationEvents: runtime.subscribeApplicationEvents.bind(runtime),
      sendMessage: runtime.sendMessage.bind(runtime), resumeInterrupts: runtime.resumeInterrupts.bind(runtime),
      abortRun: runtime.abort.bind(runtime),
    };
    this.sources.set(id, handle);
    const unsubscribe = runtime.subscribe(this.publish);
    this.publish();
    return () => {
      unsubscribe();
      if (this.sources.get(id) !== handle) return;
      this.sources.delete(id);
      this.publish();
    };
  }
}
