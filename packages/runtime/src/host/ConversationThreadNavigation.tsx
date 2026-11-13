import { useMemo, useRef, useLayoutEffect } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { ConversationRuntimeBridge } from "../ConversationRuntimeBridgeContext.js";
import type { createConversationRemoteThreadListAdapter } from "../threads/conversation-remote-thread-list-adapter.js";
import { useAgentUIThreadNavigation } from "./AgentUIProvider.js";
import { AgentUiRuntimeBusyError } from "../errors.js";
import { withConversationEndpoint } from "../compatibility/conversation-request-routing.js";
import type { AgentUIThreadNavigation, AgentUISendOptions } from "./threads.js";

function abortable<T>(task: Promise<T>, signals: readonly AbortSignal[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signals.forEach(signal => signal.removeEventListener("abort", cancel));
    const cancel = () => { cleanup(); reject(new Error("AGENT_UI_SEND_CANCELLED")); };
    signals.forEach(signal => signal.addEventListener("abort", cancel, { once: true }));
    if (signals.some(signal => signal.aborted)) cancel();
    task.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function HostThreadNavigation<TState>({ runtime, sessions, persistence }: {
  runtime: AssistantRuntime;
  sessions: { get(id: string): ConversationRuntimeBridge<TState> | undefined; getByIdentity(id: string): ConversationRuntimeBridge<TState> | undefined; subscribe(listener: () => void): () => void };
  persistence: ReturnType<typeof createConversationRemoteThreadListAdapter<TState>>;
}) {
  const lifetime = useRef(new AbortController());
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const navigation = useMemo<AgentUIThreadNavigation>(() => {
    const ready = (id: string): Promise<string> => new Promise((resolve, reject) => {
      const signal = lifetime.current.signal;
      const target = runtime.threads.getById(id);
      const expected = persistence.identity(id, runtime.threads.getItemById(id).getState().remoteId);
      let stopSessions = () => {};
      let stopThread = () => {};
      const cleanup = () => { stopSessions(); stopThread(); signal.removeEventListener("abort", cancel); };
      const cancel = () => { cleanup(); reject(new Error("AGENT_UI_SESSION_ENDED")); };
      const update = () => {
        if (signal.aborted) return cancel();
        // Optimistic promotion can change the local ID during this commit.
        // Resolve its fixed backend identity, independently of later navigation.
        const state = target.getState();
        const bridge = sessions.getByIdentity(expected);
        if (!bridge || state.isLoading) return;
        cleanup();
        if (state.isDisabled) reject(new Error("AGENT_UI_NOT_READY"));
        else resolve(bridge.agentRuntime.getSnapshot().conversation.id);
      };
      stopSessions = sessions.subscribe(update);
      stopThread = target.subscribe(update);
      signal.addEventListener("abort", cancel, { once: true });
      update();
    });
    const submit = async (target: AssistantRuntime["thread"], options: AgentUISendOptions | undefined, signals: readonly AbortSignal[]) => {
      if (target.getState().isRunning) throw new AgentUiRuntimeBusyError();
      const composer = target.composer;
      const draft = composer.getState();
      if (target.getState().isDisabled || target.getState().isLoading) throw new Error("AGENT_UI_NOT_READY");
      if (draft.submission || draft.inTransit?.length) throw new AgentUiRuntimeBusyError();
      if (!draft.text.trim() && !draft.attachments.length) throw new Error("AGENT_UI_EMPTY_DRAFT");
      if (!draft.canSend) throw new AgentUiRuntimeBusyError();
      const originalConfig = draft.runConfig;
      const runConfig = withConversationEndpoint(originalConfig, options);
      composer.setRunConfig(runConfig);
      try {
        const previousMessages = new Set(target.getState().messages.map(message => message.id));
        const queued = composer.getState().queue.length;
        // The public native send action returns void. Observe its acceptance,
        // including asynchronous attachment preparation, before completing submission.
        await abortable(new Promise<void>((resolve, reject) => {
          let submitted = false;
          let settled = false;
          const cleanup = () => { settled = true; stopThread(); stopComposer(); signals.forEach(signal => signal.removeEventListener("abort", cancel)); };
          const cancel = () => { cleanup(); reject(new Error("AGENT_UI_SESSION_ENDED")); };
          const update = () => {
            if (!submitted || settled) return;
            const state = composer.getState();
            if (target.getState().messages.some(message => message.role === "user" && !previousMessages.has(message.id)) || state.queue.length > queued) {
              cleanup(); resolve();
            } else if (!state.submission && !state.inTransit?.length) {
              queueMicrotask(() => {
                if (settled) return;
                const latest = composer.getState();
                const failedAttachment = latest.attachments.some(attachment => attachment.status.type === "incomplete");
                const restoredDraft = latest.text === draft.text && (Boolean(latest.text) || latest.attachments.length > 0);
                if (!latest.submission && !latest.inTransit?.length && (failedAttachment || restoredDraft) && !target.getState().messages.some(message => message.role === "user" && !previousMessages.has(message.id)) && latest.queue.length <= queued) {
                  cleanup(); reject(new Error("AGENT_UI_DRAFT_NOT_SUBMITTED"));
                }
              });
            }
          };
          const stopThread = target.subscribe(update);
          const stopComposer = composer.subscribe(update);
          signals.forEach(signal => signal.addEventListener("abort", cancel, { once: true }));
          submitted = true;
          try { composer.send(); update(); } catch (error) { cleanup(); reject(error); }
        }), signals);
      } finally {
        // The route belongs to this submission, not to the next draft.
        if (composer.getState().runConfig === runConfig) composer.setRunConfig(originalConfig);
      }
    };
    return {
      async createThread() {
        // Native new-thread selection reuses an unused draft. Promote it first
        // so every explicit new conversation gets a distinct reserved backend ID.
        if (runtime.threads.mainItem.getState().status === "new") await runtime.threads.mainItem.initialize();
        await runtime.threads.switchToNewThread();
        return ready(runtime.threads.getState().mainThreadId);
      },
      async openThread(id: string) {
        await runtime.threads.switchToThread(persistence.localId(id));
        await ready(runtime.threads.getState().mainThreadId);
      },
      async sendComposer(options) {
        const localId = runtime.threads.getState().mainThreadId;
        const id = await ready(localId);
        if (sessions.getByIdentity(id)?.agentRuntime.getSnapshot().run.status === "awaiting-input") {
          throw new Error("AGENT_UI_PENDING_INTERRUPTS");
        }
        await submit(runtime.threads.getById(localId), options, [lifetime.current.signal]);
      },
    };
  }, [runtime, sessions, persistence]);
  useAgentUIThreadNavigation(navigation);
  return null;
}

