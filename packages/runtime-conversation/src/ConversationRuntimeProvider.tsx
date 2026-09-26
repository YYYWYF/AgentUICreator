import type { AbstractAgent } from "@ag-ui/client";
import type { ConversationToolkit } from "@agent-ui/react";
import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import {
  AuiConfig,
  AssistantRuntimeProvider,
  Suggestions,
  Tools,
  useAssistantToolUI,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
  type ThreadHistoryAdapter,
  type ThreadMessage,
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
import { CancellationAwareHttpAgent } from "./compatibility/cancellation-aware-http-agent.js";
import { ConversationApplicationEventSource } from "./events/conversation-application-event-source.js";
import type {
  ConversationThreadBinding,
  ConversationLoadedThread,
} from "./threads/types.js";
import { createConversationRemoteThreadListAdapter } from "./threads/conversation-remote-thread-list-adapter.js";
import { createConversationFrontendToolPort, type ConversationFrontendToolUIRegistry } from "./tools/types.js";
import { createAssistantUiFrontendToolkit } from "./tools/assistant-ui-frontend-tool-adapter.js";
import type { ConversationStarterSuggestion } from "./conversation-types.js";

export interface ConversationAgentFactoryConfig {
  endpoint: string;
  threadId: string;
}

export type ConversationAgentFactory = (
  config: ConversationAgentFactoryConfig,
) => AbstractAgent;

export interface ConversationRuntimeProviderProps<TState = unknown> {
  endpoint: string;
  threadBinding: ConversationThreadBinding<TState>;
  frontendTools?: AgentFrontendToolSource | undefined;
  frontendToolUIs?: ConversationFrontendToolUIRegistry | undefined;
  toolkit?: ConversationToolkit | undefined;
  suggestions?: readonly ConversationStarterSuggestion[] | undefined;
  children: ReactNode;
  onError?: ((error: Error) => void) | undefined;
  /** Test seam; production callers should use the default per-thread HttpAgent. */
  unstable_agentFactory?: ConversationAgentFactory | undefined;
}

const defaultAgentFactory: ConversationAgentFactory = ({ endpoint, threadId }) =>
  new CancellationAwareHttpAgent({
    url: endpoint,
    threadId,
    headers: { Accept: "text/event-stream" },
  });

export function ConversationRuntimeProvider<TState = unknown>({
  endpoint,
  threadBinding,
  frontendTools,
  frontendToolUIs,
  toolkit,
  suggestions,
  children,
  onError,
  unstable_agentFactory = defaultAgentFactory,
}: Readonly<ConversationRuntimeProviderProps<TState>>) {
  const toolRevision = useSyncExternalStore(
    useCallback(listener => frontendTools?.subscribe(listener) ?? (() => {}), [frontendTools]),
    () => frontendTools?.getRevision() ?? 0,
    () => frontendTools?.getRevision() ?? 0,
  );
  const resolvedToolkit = useMemo(
    () => createAssistantUiFrontendToolkit(frontendTools, toolkit, frontendToolUIs),
    [frontendTools, toolkit, frontendToolUIs, toolRevision],
  );
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
    const aui = useAui();
    const item = aui.threadListItem().getState();
    // Pin ownership at mount. Optimistic assistant-ui IDs never become backend IDs.
    const [ownedId] = useState(() => persistence.identity(item.id, item.remoteId));
    const agent = useMemo(() => unstable_agentFactory({ endpoint, threadId: ownedId }), [endpoint, ownedId, unstable_agentFactory]);
    const bridgeRef = useRef<ConversationAgentRuntimeBridge<TState> | null>(null);
    const ownedBinding = useMemo<ConversationThreadBinding<TState>>(() => ({
      getThreadId: () => ownedId,
      subscribe: listener => threadBinding.subscribe(listener),
      createNewThread: () => threadBinding.createNewThread(),
    }), [ownedId, threadBinding]);
    const [historyFailed, setHistoryFailed] = useState(false);
    const history = useMemo<ThreadHistoryAdapter>(() => ({
      async load() {
        let loaded: ConversationLoadedThread<TState>;
        try {
          loaded = item.remoteId === undefined ? { messages: [] } :
            await (threadBinding.loadThread?.(ownedId) ?? threadBinding.selectThread?.(ownedId) ?? Promise.resolve({ messages: [] }));
        } catch (error) {
          setHistoryFailed(true);
          throw error;
        }
        return {
          messages: loaded.messages.map((message, index) => ({
            parentId: index === 0 ? null : loaded.messages[index - 1]!.id,
            message: message as unknown as ThreadMessage,
          })),
          ...(loaded.state === undefined ? {} : { state: loaded.state as never }),
        };
      },
      async append() { await aui.threadListItem().initialize(); },
    }), [aui, ownedId, threadBinding]);
    const isDisabled = useSyncExternalStore(
      ownedBinding.subscribe,
      () => threadBinding.getThreadIsDisabled?.(ownedId) ?? false,
      () => threadBinding.getThreadIsDisabled?.(ownedId) ?? false,
    );
    const runtime = useAgUiRuntime({
      agent, isDisabled: isDisabled || historyFailed, showThinking: true, unstable_enableMessageQueue: false,
      adapters: { history },
      onCancel: () => bridgeRef.current?.recordCancellation(),
      onError: error => {
        bridgeRef.current?.recordError(error);
        // A foreground callback must not project a background error into the current UI.
        if (outerRuntime.current?.threads.getState().mainThreadId === item.id) onError?.(error);
      },
    });
    const applicationEvents = useMemo(() => new ConversationApplicationEventSource(agent), [agent]);
    const agentRuntime = useMemo(() => createConversationAgentRuntimeBridge<TState>({
      runtime, threadBinding: ownedBinding, applicationEvents,
      switchToNewThread: () => outerRuntime.current!.threads.switchToNewThread(),
    }), [runtime, ownedBinding, applicationEvents]);
    bridgeRef.current = agentRuntime;
    const bridge = useMemo<ConversationRuntimeBridge<TState>>(() => ({
      agentRuntime, applicationEvents, observation: agentRuntime.observation, threadBinding,
      ...(frontendTools === undefined ? {} : { frontendTools: createConversationFrontendToolPort(frontendTools) }),
    }), [agentRuntime, applicationEvents, threadBinding, frontendTools]);
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
  }, [endpoint, unstable_agentFactory, threadBinding, persistence, sessions, frontendTools, onError]);
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
      {Object.entries(frontendToolUIs ?? {}).filter(([name]) => !Object.hasOwn(resolvedToolkit, name)).map(([name, ui]) => (
        <HistoricalFrontendToolUI key={name} name={name} ui={ui} />
      ))}
      <CurrentConversationBridge sessions={sessions} persistence={persistence} threadBinding={threadBinding}>
        {children}
      </CurrentConversationBridge>
    </AssistantRuntimeProvider>
  );
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

function CurrentConversationBridge<TState>({ sessions, persistence, threadBinding, children }: {
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
  return <ConversationRuntimeBridgeProvider bridge={currentBridge}>{children}</ConversationRuntimeBridgeProvider>;
}

/** Preserve history presentation when a capability is absent, without advertising a tool. */
function HistoricalFrontendToolUI({ name, ui }: { name: string; ui: ConversationFrontendToolUIRegistry[string] }) {
  useAssistantToolUI({ toolName: name, render: ui.render as never, ...(ui.display === undefined ? {} : { display: ui.display }) });
  return null;
}
