import { HttpAgent, type AbstractAgent } from "@ag-ui/client";
import type { ConversationToolkit } from "@agent-ui/react";
import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import {
  AuiConfig,
  AssistantRuntimeProvider,
  Suggestions,
  Tools,
} from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type UseAgUiRuntimeAdapters,
} from "@assistant-ui/react-ag-ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { createCancellationAwareAgent } from "./compatibility/cancellation-aware-agent.js";
import { isExpectedCancellationError } from "./errors.js";
import { ConversationApplicationEventSource } from "./events/conversation-application-event-source.js";
import type {
  ConversationThreadBinding,
  ConversationThreadListSnapshot,
} from "./threads/types.js";
import { createConversationFrontendToolPort } from "./tools/types.js";
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
  toolkit?: ConversationToolkit | undefined;
  suggestions?: readonly ConversationStarterSuggestion[] | undefined;
  children: ReactNode;
  onError?: ((error: Error) => void) | undefined;
  /** Test seam; production callers should use the default single HttpAgent. */
  unstable_agentFactory?: ConversationAgentFactory | undefined;
}

const defaultAgentFactory: ConversationAgentFactory = ({ endpoint, threadId }) =>
  createCancellationAwareAgent(new HttpAgent({
    url: endpoint,
    threadId,
    headers: { Accept: "text/event-stream" },
  }));

export function ConversationRuntimeProvider<TState = unknown>({
  endpoint,
  threadBinding,
  frontendTools,
  toolkit,
  suggestions,
  children,
  onError,
  unstable_agentFactory = defaultAgentFactory,
}: Readonly<ConversationRuntimeProviderProps<TState>>) {
  const config = useMemo(() => {
    const tools = toolkit === undefined
      ? undefined
      : Tools({ toolkit: toolkit as never });
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
  }, [suggestions, toolkit]);
  const subscribeThreadBinding = useCallback(
    (listener: () => void) => threadBinding.subscribe(listener),
    [threadBinding],
  );
  const getThreadId = useCallback(
    () => threadBinding.getThreadId(),
    [threadBinding],
  );
  const threadId = useSyncExternalStore(
    subscribeThreadBinding,
    getThreadId,
    getThreadId,
  );
  const getIsDisabled = useCallback(
    () => threadBinding.getIsDisabled?.() ?? false,
    [threadBinding],
  );
  const isDisabled = useSyncExternalStore(
    subscribeThreadBinding,
    getIsDisabled,
    getIsDisabled,
  );
  const fallbackThreadListSnapshot = useMemo<ConversationThreadListSnapshot>(
    () => ({
      threads: [{ id: threadId, status: "regular" as const }],
      archivedThreads: [],
    }),
    [threadId],
  );
  const getThreadListSnapshot = useCallback(
    () =>
      threadBinding.getThreadListSnapshot?.() ?? fallbackThreadListSnapshot,
    [fallbackThreadListSnapshot, threadBinding],
  );
  const threadListSnapshot = useSyncExternalStore(
    subscribeThreadBinding,
    getThreadListSnapshot,
    getThreadListSnapshot,
  );
  const agent = useMemo(
    () => unstable_agentFactory({ endpoint, threadId }),
    [endpoint, unstable_agentFactory],
  );
  agent.threadId = threadId;

  const threadList = useMemo<NonNullable<UseAgUiRuntimeAdapters["threadList"]>>(
    () => ({
      threadId,
      ...(threadListSnapshot.isLoading === undefined
        ? {}
        : { isLoading: threadListSnapshot.isLoading }),
      threads: threadListSnapshot.threads,
      archivedThreads: threadListSnapshot.archivedThreads,
      onSwitchToNewThread: async () => {
        agent.threadId = await threadBinding.createNewThread();
      },
      ...(threadBinding.selectThread === undefined
        ? {}
        : {
            onSwitchToThread: async (nextThreadId: string) => {
              const loaded = await threadBinding.selectThread!(nextThreadId);
              agent.threadId = threadBinding.getThreadId();
              return {
                messages: loaded.messages as never,
                ...(loaded.state === undefined ? {} : { state: loaded.state as never }),
              };
            },
          }),
    }),
    [agent, threadBinding, threadId, threadListSnapshot],
  );
  const bridgeRef = useRef<ConversationAgentRuntimeBridge<TState> | null>(null);
  const handleCancel = useCallback(() => {
    bridgeRef.current?.recordCancellation();
  }, []);
  const handleError = useCallback((error: Error) => {
    if (isExpectedCancellationError(error)) {
      bridgeRef.current?.recordCancellation();
      return;
    }
    bridgeRef.current?.recordError(error);
    onError?.(error);
  }, [onError]);
  const assistantRuntime = useAgUiRuntime({
    agent,
    isDisabled,
    showThinking: true,
    unstable_enableMessageQueue: false,
    adapters: { threadList },
    onCancel: handleCancel,
    onError: handleError,
  });
  const applicationEvents = useMemo(
    () => new ConversationApplicationEventSource(agent),
    [agent],
  );
  const agentRuntime = useMemo(
    () => createConversationAgentRuntimeBridge<TState>({
      runtime: assistantRuntime,
      threadBinding,
      applicationEvents,
    }),
    [applicationEvents, assistantRuntime, threadBinding],
  );
  bridgeRef.current = agentRuntime;
  const bridge = useMemo<ConversationRuntimeBridge<TState>>(
    () => ({
      agentRuntime,
      applicationEvents,
      observation: agentRuntime.observation,
      threadBinding,
      ...(frontendTools === undefined
        ? {}
        : { frontendTools: createConversationFrontendToolPort(frontendTools) }),
    }),
    [agentRuntime, applicationEvents, frontendTools, threadBinding],
  );

  useEffect(() => {
    bridgeRef.current = agentRuntime;
    applicationEvents.start();
    agentRuntime.start();
    return () => {
      bridgeRef.current = null;
      agentRuntime.stop();
      applicationEvents.stop();
    };
  }, [agentRuntime, applicationEvents]);

  return (
    <ConversationRuntimeBridgeProvider bridge={bridge}>
      <AssistantRuntimeProvider
        runtime={assistantRuntime}
        {...(config === undefined ? {} : { config })}
      >
        {children}
      </AssistantRuntimeProvider>
    </ConversationRuntimeBridgeProvider>
  );
}
