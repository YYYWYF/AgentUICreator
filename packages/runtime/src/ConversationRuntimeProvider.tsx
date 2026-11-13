import { createAttachmentAdapter, createDictationAdapter, createFeedbackAdapter } from "./service-adapters.js";
import { useAgentUILocale } from "./locale.js";
import type { AttachmentConfig, DictationConfig, FeedbackConfig } from "./service-config.js";
import type { ConversationFeedbackAdapter } from "./feedback.js";
import { installConversationQuoteContext } from "./compatibility/conversation-quote-context-agent.js";
import { installConversationCommandForwarding } from "./compatibility/conversation-command-forwarding-agent.js";
import type { AbstractAgent } from "@ag-ui/client";
import { ConversationQuoteLifecycleProvider, ConversationComposerGuardProvider, ConversationCommandDecisionProvider, ConversationTransientMessageProvider, createConversationTransientMessageService, type ConversationCommandDecisionBinding, type ConversationTransientMessageService, type ConversationToolkit } from "./plugin-api/index.js";
import { fetchWithSseLineEndings } from "./compatibility/sse-line-endings.js";
import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import { useFrontendToolSource } from "./tools/use-frontend-tool-source.js";
import { installCancelledToolContinuationGuard } from "./compatibility/cancelled-tool-continuation.js";
import { installConversationOutgoingMessages } from "./compatibility/conversation-outgoing-messages.js";
import {
  AuiConfig,
  AssistantRuntimeProvider,
  Suggestions,
  Tools,
  useAui,
  useAuiEvent,
  useAuiState,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
  type AttachmentAdapter,
  type DictationAdapter,
  type FeedbackAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  type ChatModelRunResult,
} from "@assistant-ui/react";
import {
  useAgUiRuntime,
} from "@assistant-ui/react-ag-ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ConversationRuntimeBridgeProvider,
  type ConversationRuntimeBridge,
} from "./ConversationRuntimeBridgeContext.js";
import {
  createConversationAgentRuntimeBridge,
  type ConversationAgentRuntimeBridge,
} from "./compatibility/conversation-runtime-bridge.js";
import { HttpAgent } from "@ag-ui/client";
import { ConversationApplicationEventSource } from "./events/conversation-application-event-source.js";
import type {
  ConversationThreadBinding,
  ConversationLoadedThread,
  ConversationRunResume,
  ConversationAssistantRunUpdate,
} from "./threads/types.js";
import { createConversationRemoteThreadListAdapter } from "./threads/conversation-remote-thread-list-adapter.js";
import { createConversationFrontendToolPort, type ConversationFrontendToolUIRegistry } from "./tools/types.js";
import { createAssistantUiFrontendToolkit } from "./tools/assistant-ui-frontend-tool-adapter.js";
import type { ConversationRunContextGetter, ConversationStarterSuggestion } from "./conversation-types.js";

export interface ConversationAgentFactoryConfig {
  endpoint: string;
  threadId: string;
}

export type ConversationAgentFactory = (
  config: ConversationAgentFactoryConfig,
) => AbstractAgent;

export interface ConversationRuntimeProviderProps<TState = unknown> {
  transientMessages?: ConversationTransientMessageService | undefined;
  endpoint: string;
  threadBinding: ConversationThreadBinding<TState>;
  frontendTools?: AgentFrontendToolSource | undefined;
  frontendToolUIs?: ConversationFrontendToolUIRegistry | undefined;
  toolkit?: ConversationToolkit | undefined;
  suggestions?: readonly ConversationStarterSuggestion[] | undefined;
  getRunContext?: ConversationRunContextGetter | undefined;
  /** Built-in file handling, with optional upload service configuration. */
  attachments?: AttachmentConfig | false | undefined;
  /** Browser speech recognition or a configured transcription service. */
  dictation?: DictationConfig | false | undefined;
  /** In-session selection or a configured persistence service. */
  feedback?: FeedbackConfig | false | undefined;
  /** Advanced override of concrete file configuration. */
  attachmentAdapter?: AttachmentAdapter | undefined;
  /** Speech-to-text belongs to the application-provided upstream adapter. */
  dictationAdapter?: DictationAdapter | undefined;
  /** Ephemeral upstream follow-up queue; disabled by default for direct callers. */
  enableMessageQueue?: boolean | undefined;
  feedbackAdapter?: ConversationFeedbackAdapter | undefined;
  children: ReactNode;
  onError?: ((error: Error) => void) | undefined;
  /** Test seam; production callers should use the default per-thread HttpAgent. */
  unstable_agentFactory?: ConversationAgentFactory | undefined;
}

const defaultAgentFactory: ConversationAgentFactory = ({ endpoint, threadId }) =>
  new HttpAgent({
    url: endpoint,
    threadId,
    headers: { Accept: "text/event-stream" },
    fetch: fetchWithSseLineEndings,
  });

type ThreadOptions = Pick<ConversationRuntimeProviderProps, "onError" | "getRunContext" | "enableMessageQueue"> & {
  frontendTools: AgentFrontendToolSource | undefined;
  resolvedAttachments: AttachmentAdapter | undefined;
  resolvedDictation: DictationAdapter | undefined;
  resolvedFeedback: ConversationFeedbackAdapter | undefined;
};
function createThreadOptionsStore(initial: ThreadOptions) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next: ThreadOptions) { if (current === next) return; current = next; listeners.forEach(listener => listener()); },
  };
}

export function ConversationRuntimeProvider<TState = unknown>({
  transientMessages,
  endpoint,
  threadBinding,
  frontendTools: providedFrontendTools,
  frontendToolUIs,
  toolkit,
  suggestions,
  getRunContext,
  attachments,
  dictation,
  feedback: feedbackConfig,
  attachmentAdapter,
  dictationAdapter,
  feedbackAdapter,
  enableMessageQueue = false,
  children,
  onError,
  unstable_agentFactory = defaultAgentFactory,
}: Readonly<ConversationRuntimeProviderProps<TState>>) {
  const serviceMessages = useAgentUILocale("serviceAdapters");
  const frontendTools = useFrontendToolSource(providedFrontendTools);
  // Concrete configuration is serializable; inline JSX objects must not replace adapters on every render.
  const attachmentKey = JSON.stringify(attachments);
  const dictationKey = JSON.stringify(dictation);
  const feedbackKey = JSON.stringify(feedbackConfig);
  const attachmentTransfers = useRef(new Map<string, AbortController>());
  useEffect(() => () => { for (const controller of attachmentTransfers.current.values()) controller.abort(); attachmentTransfers.current.clear(); }, []);
  const resolvedAttachments = useMemo(() => attachmentAdapter ?? (attachments === false ? undefined : createAttachmentAdapter(attachments ?? {}, serviceMessages, attachmentTransfers.current)), [attachmentAdapter, attachmentKey, serviceMessages]);
  const resolvedDictation = useMemo(() => dictationAdapter ?? (dictation === false ? undefined : createDictationAdapter(dictation ?? {}, serviceMessages, onError)), [dictationAdapter, dictationKey, serviceMessages, onError]);
  const resolvedFeedback = useMemo(() => feedbackAdapter ?? (feedbackConfig === false ? undefined : createFeedbackAdapter(feedbackConfig ?? {}, serviceMessages)), [feedbackAdapter, feedbackKey, serviceMessages]);
  const [defaultTransientMessages] = useState(createConversationTransientMessageService);
  const transientMessageService = transientMessages ?? defaultTransientMessages;
  const toolRevision = useSyncExternalStore(
    useCallback(listener => frontendTools?.subscribe(listener) ?? (() => {}), [frontendTools]),
    () => frontendTools?.getRevision() ?? 0,
    () => frontendTools?.getRevision() ?? 0,
  );
  const resolvedToolkit = useMemo(
    () => createAssistantUiFrontendToolkit(frontendTools, toolkit, frontendToolUIs),
    [frontendTools, toolkit, frontendToolUIs, toolRevision],
  );
  // Updating presentation/adapters must update mounted threads, not replace the
  // upstream runtimeHook: a new hook identity retires every thread instance.
  const threadOptions = useMemo<ThreadOptions>(() => ({
    frontendTools, onError, getRunContext, resolvedAttachments, resolvedDictation,
    resolvedFeedback, enableMessageQueue,
  }), [frontendTools, onError, getRunContext, resolvedAttachments, resolvedDictation, resolvedFeedback, enableMessageQueue]);
  const [optionsStore] = useState(() => createThreadOptionsStore(threadOptions));
  useLayoutEffect(() => optionsStore.update(threadOptions), [optionsStore, threadOptions]);
  const config = useMemo(() => {
    const tools = Tools({ toolkit: resolvedToolkit });
    const staticSuggestions = suggestions === undefined
      ? undefined
      : Suggestions(
        suggestions.map((suggestion) => ({
          title: suggestion.title ?? suggestion.prompt,
          label: suggestion.label ?? "",
          prompt: suggestion.prompt,
        })),
      );
    if (tools === undefined && staticSuggestions === undefined) {
      return undefined;
    }
    return AuiConfig({
      ...(tools === undefined ? {} : { tools }),
      ...(staticSuggestions === undefined
        ? {}
        : { suggestions: staticSuggestions }),
    });
  }, [suggestions, resolvedToolkit]);
  const persistence = useMemo(() => createConversationRemoteThreadListAdapter(threadBinding), [threadBinding]);
  const sessions = useMemo(() => new ConversationThreadSessions<TState>(), [threadBinding]);
  const outerRuntime = useRef<AssistantRuntime | null>(null);
  const runtimeHook = useCallback(function useConversationThreadRuntime() {
    const { frontendTools, onError, getRunContext, resolvedAttachments, resolvedDictation,
      resolvedFeedback, enableMessageQueue } = useSyncExternalStore(optionsStore.subscribe, optionsStore.getSnapshot, optionsStore.getSnapshot);
    const aui = useAui();
    const item = aui.threadListItem().getState();
    // Pin ownership at mount. Optimistic assistant-ui IDs never become backend IDs.
    const [ownedId] = useState(() => persistence.identity(item.id, item.remoteId));
    // Observe upstream-owned user messages synchronously before transport starts.
    const quoteMessagesRef = useRef(new Map<string, ThreadMessage>());
    const commandForwarderRef = useRef<ReturnType<typeof installConversationCommandForwarding> | undefined>(undefined);
    const agent = useMemo(() => {
      const created = unstable_agentFactory({ endpoint, threadId: ownedId });
      commandForwarderRef.current = installConversationCommandForwarding(created);
      return installConversationQuoteContext(created, () => [...quoteMessagesRef.current.values()]);
    }, [endpoint, ownedId, unstable_agentFactory]);
    const bridgeRef = useRef<ConversationAgentRuntimeBridge<TState> | null>(null);
    const ownedBinding = useMemo<ConversationThreadBinding<TState>>(() => ({
      getThreadId: () => ownedId,
      subscribe: listener => threadBinding.subscribe(listener),
      createNewThread: () => threadBinding.createNewThread(),
    }), [ownedId, threadBinding]);
    const toolContinuation = useMemo(() => {
      const guard = installCancelledToolContinuationGuard(agent);
      installConversationOutgoingMessages(agent);
      return guard;
    }, [agent]);
    // Composer cancellation can stop a frontend tool after the wire run has
    // already finished, so AG-UI's onCancel will not fire. Mark this turn before
    // upstream publishes the tool cancellation receipt and attempts continuation.
    useAuiEvent("composer.cancel", () => toolContinuation.cancel());
    useLayoutEffect(() => () => toolContinuation.cancel(), [toolContinuation, frontendTools]);
    const [historyFailed, setHistoryFailed] = useState(false);
    const resumeRef = useRef<ConversationRunResume | undefined>(undefined);
    const history = useMemo<ThreadHistoryAdapter>(() => ({
      async load() {
        resumeRef.current = undefined;
        quoteMessagesRef.current.clear();
        let loaded: ConversationLoadedThread<TState>;
        try {
          loaded = item.remoteId === undefined ? { messages: [] } :
            await (threadBinding.loadThread?.(ownedId) ?? threadBinding.selectThread?.(ownedId) ?? Promise.resolve({ messages: [] }));
        } catch (error) {
          setHistoryFailed(true);
          throw error;
        }
        const messages = loaded.messages.map(message => message as unknown as ThreadMessage);
        for (const message of messages) {
          if (message.role === "user") quoteMessagesRef.current.set(message.id, message);
        }
        resumeRef.current = loaded.resume;
        if (loaded.resumeDiscoveryError !== undefined) {
          const error = loaded.resumeDiscoveryError;
          queueMicrotask(() => {
            bridgeRef.current?.recordError(error);
            if (outerRuntime.current?.threads.getState().mainThreadId === item.id) onError?.(error);
          });
        }
        return {
          messages: messages.map((message, index) => ({
            parentId: index === 0 ? null : messages[index - 1]!.id,
            message,
          })),
          ...(loaded.state === undefined ? {} : { state: loaded.state as never }),
          ...(resumeRef.current === undefined ? {} : { unstable_resume: true }),
        };
      },
      async *resume(options) {
        const capability = resumeRef.current;
        if (capability === undefined) throw new Error(`No resumable run for conversation ${ownedId}`);
        for await (const update of capability.stream(options.abortSignal)) {
          if (options.abortSignal.aborted) return;
          yield toAssistantRunResult(update);
        }
      },
      async append({ message }) {
        if (message.role === "user") quoteMessagesRef.current.set(message.id, message);
        await aui.threadListItem().initialize();
      },
    }), [aui, ownedId, threadBinding]);
    const isDisabled = useSyncExternalStore(
      ownedBinding.subscribe,
      () => threadBinding.getThreadIsDisabled?.(ownedId) ?? false,
      () => threadBinding.getThreadIsDisabled?.(ownedId) ?? false,
    );
    const feedback = useMemo<FeedbackAdapter | undefined>(() => resolvedFeedback === undefined ? undefined : ({
      submit({ message, type, comment }) {
        // Upstream owns optimistic selection. Catch both sync and async Host failures.
        const report = (cause: unknown) => {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          // Feedback persistence is an application error, never an inference failure.
          if (outerRuntime.current?.threads.getState().mainThreadId === item.id && onError !== undefined) {
            onError(error);
          } else {
            console.error("[agent-ui] feedback persistence failed", error);
          }
        };
        try {
          void Promise.resolve(resolvedFeedback.submit({
            threadId: ownedId, messageId: message.id, type,
            ...(comment === undefined ? {} : { comment }),
          })).catch(report);
        } catch (error) { report(error); }
      },
    }), [resolvedFeedback, ownedId, item.id, onError]);
    // Upstream reports getter errors through onError but still sends the run.
    // Keep that non-fatal error out of the bridge's inference-failure state.
    const contextError = useRef<Error | undefined>(undefined);
    const readRunContext = useMemo<ConversationRunContextGetter | undefined>(() => getRunContext === undefined ? undefined : input => {
      try { return getRunContext(input); }
      catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        contextError.current = error;
        throw error;
      }
    }, [getRunContext]);
    const runtime = useAgUiRuntime({
      agent, isDisabled: isDisabled || historyFailed, showThinking: true, unstable_enableMessageQueue: enableMessageQueue,
      resumeTranscript: "appended",
      ...(readRunContext === undefined ? {} : { getRunContext: readRunContext }),
      adapters: {
        history,
        ...(feedback === undefined ? {} : { feedback }),
        ...(resolvedAttachments === undefined ? {} : { attachments: resolvedAttachments }),
        ...(resolvedDictation === undefined ? {} : { dictation: resolvedDictation }),
      },
      onCancel: () => bridgeRef.current?.recordCancellation(),
      onError: error => {
        const isContextError = contextError.current === error;
        contextError.current = undefined;
        if (!isContextError) bridgeRef.current?.recordError(error);
        // A foreground callback must not project a background error into the current UI.
        if (outerRuntime.current?.threads.getState().mainThreadId === item.id) onError?.(error);
      },
    });
    useEffect(() => {
      // The initial controlled thread is already regular, so upstream does
      // not arm its new-thread trigger. Reuse the public title lifecycle once.
      if (item.remoteId === undefined) return;
      let requested = false;
      const updateTitle = () => {
        if (requested) return;
        const threads = outerRuntime.current?.threads;
        // Thread removal can notify the message subscription before effect cleanup.
        if (!threads?.getState().threadIds.includes(item.id)) return;
        const entry = threads.getItemById(item.id);
        const firstUser = runtime.thread.getState().messages.find(message => message.role === "user");
        if (!entry || entry.getState().title || !firstUser?.content.some(part => part.type === "text" && part.text.trim())) return;
        requested = true;
        void entry.generateTitle().catch(error => {
          requested = false;
          onError?.(error instanceof Error ? error : new Error(String(error)));
        });
      };
      const unsubscribe = runtime.thread.subscribe(updateTitle);
      updateTitle();
      return unsubscribe;
    }, [runtime, item.id, item.remoteId, onError]);
    const applicationEvents = useMemo(() => new ConversationApplicationEventSource(agent), [agent]);
    const commandForwarder = commandForwarderRef.current;
    const agentRuntime = useMemo(() => createConversationAgentRuntimeBridge<TState>({
      runtime, threadBinding: ownedBinding, applicationEvents, commandForwarder, onAbort: () => toolContinuation.cancel(),
      switchToNewThread: () => outerRuntime.current!.threads.switchToNewThread(),
    }), [runtime, ownedBinding, applicationEvents, commandForwarder, toolContinuation]);
    bridgeRef.current = agentRuntime;
    const bridge = useMemo<ConversationRuntimeBridge<TState>>(() => ({
      agentRuntime, applicationEvents, observation: agentRuntime.observation, threadBinding,
      clearPendingQuote: () => runtime.thread.composer.setQuote(undefined),
      ...(frontendTools === undefined ? {} : { frontendTools: createConversationFrontendToolPort(frontendTools) }),
    }), [agentRuntime, applicationEvents, threadBinding, frontendTools, runtime]);
    useLayoutEffect(() => {
      applicationEvents.start();
      agentRuntime.start();
      const unregister = sessions.register(item.id, bridge);
      return () => {
        unregister();
        agentRuntime.stop();
        applicationEvents.stop();
      };
    }, [agentRuntime, applicationEvents, bridge, item.id]);
    return runtime;
  }, [endpoint, unstable_agentFactory, threadBinding, persistence, sessions, optionsStore]);
  const [controlledThreadId, setControlledThreadId] = useState<string | undefined>(persistence.initialId);
  const assistantRuntime = useRemoteThreadListRuntime({
    adapter: persistence.adapter, runtimeHook,
    threadId: controlledThreadId, onThreadIdChange: setControlledThreadId,
  });
  outerRuntime.current = assistantRuntime;
  useEffect(() => {
    // Metadata refresh does not navigate or reload any mounted thread's history.
    let previous = threadBinding.getThreadListSnapshot?.();
    return threadBinding.subscribe(() => {
      const next = threadBinding.getThreadListSnapshot?.();
      if (next === previous) return;
      previous = next;
      void assistantRuntime.threads.reload();
    });
  }, [assistantRuntime, threadBinding]);
  return (
    <AssistantRuntimeProvider runtime={assistantRuntime} {...(config === undefined ? {} : { config })}>
      <CurrentConversationBridge sessions={sessions} persistence={persistence} threadBinding={threadBinding} transientMessages={transientMessageService}>
        {children}
      </CurrentConversationBridge>
    </AssistantRuntimeProvider>
  );
}

/** Keep the upstream run-result shape inside runtime. */
function toAssistantRunResult(update: ConversationAssistantRunUpdate): ChatModelRunResult {
  return {
    ...(update.content === undefined ? {} : { content: update.content as unknown as NonNullable<ChatModelRunResult["content"]> }),
    ...(update.status === undefined ? {} : { status: update.status as NonNullable<ChatModelRunResult["status"]> }),
    ...(update.metadata === undefined ? {} : { metadata: update.metadata as NonNullable<ChatModelRunResult["metadata"]> }),
  };
}

/** Observation registry only: never starts, switches, or keeps runtimes alive. */
class ConversationThreadSessions<TState> {
  private readonly bridges = new Map<string, ConversationRuntimeBridge<TState>>();
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = (id: string) => this.bridges.get(id);
  register(id: string, bridge: ConversationRuntimeBridge<TState>) {
    this.bridges.set(id, bridge);
    this.listeners.forEach(listener => listener());
    return () => {
      if (this.bridges.get(id) !== bridge) return;
      this.bridges.delete(id);
      this.listeners.forEach(listener => listener());
    };
  }
}

function CurrentConversationBridge<TState>({ sessions, persistence, threadBinding, transientMessages, children }: {
  transientMessages: ConversationTransientMessageService;
  sessions: ConversationThreadSessions<TState>;
  persistence: ReturnType<typeof createConversationRemoteThreadListAdapter<TState>>;
  threadBinding: ConversationThreadBinding<TState>;
  children: ReactNode;
}) {
  const id = useAuiState(s => s.threads.mainThreadId);
  const aui = useAui();
  const bridge = useSyncExternalStore(sessions.subscribe, () => sessions.get(id), () => sessions.get(id));
  const previousBridge = useRef<ConversationRuntimeBridge<TState> | undefined>(undefined);
  if (bridge !== undefined) previousBridge.current = bridge;
  useLayoutEffect(() => {
    if (bridge === undefined) return;
    const item = aui.threads().item({ id }).getState();
    threadBinding.activateThread?.(persistence.identity(id, item.remoteId));
  }, [aui, id, persistence, threadBinding, bridge]);
  // Keep host services mounted during the upstream attachment commit. The new
  // session registers in layout, before the browser can receive another event.
  const currentBridge = bridge ?? previousBridge.current;
  if (currentBridge === undefined) return null;
  return <ConversationRuntimeBridgeProvider bridge={currentBridge}>
    <ConversationComposerGuard bridge={currentBridge} transientMessages={transientMessages}>
      <ConversationQuoteLifecycleProvider clearPendingQuote={currentBridge.clearPendingQuote}>
        {children}
      </ConversationQuoteLifecycleProvider>
    </ConversationComposerGuard>
  </ConversationRuntimeBridgeProvider>;
}

function ConversationComposerGuard({ bridge, transientMessages, children }: { bridge: ConversationRuntimeBridge; transientMessages: ConversationTransientMessageService; children: ReactNode }) {
  const snapshot = useSyncExternalStore(bridge.agentRuntime.subscribe, bridge.agentRuntime.getSnapshot, bridge.agentRuntime.getSnapshot);
  const commandDecisions = new Map<string, ConversationCommandDecisionBinding>();
  for (const execution of snapshot.executions) {
    const request = bridge.agentRuntime.getCommandDecisionRequest(execution.id);
    if (request !== undefined) commandDecisions.set(execution.id, {
      request,
      submit: decisionType => bridge.agentRuntime.submitCommandDecision(execution.id, decisionType),
    });
  }
  const pendingToolCallIds = snapshot.run.status === "awaiting-input"
    ? snapshot.executions.filter(execution => execution.type === "tool" && execution.status === "awaiting-result").map(execution => execution.id)
    : [];
  return <ConversationTransientMessageProvider service={transientMessages} conversationId={snapshot.conversation.id}>
    <ConversationComposerGuardProvider awaitingReply={snapshot.run.status === "awaiting-input"} interruptKey={JSON.stringify([
      ...snapshot.interrupts.map(interrupt => interrupt.id),
      ...pendingToolCallIds,
    ].sort())}>
      <ConversationCommandDecisionProvider decisions={commandDecisions}>
        {children}
      </ConversationCommandDecisionProvider>
    </ConversationComposerGuardProvider>
  </ConversationTransientMessageProvider>;
}
