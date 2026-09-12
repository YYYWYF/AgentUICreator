import { HttpAgent, type AbstractAgent } from "@ag-ui/client";
import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
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
  type ComponentProps,
  type ReactNode,
} from "react";

import {
  AssistantUiRuntimeBridgeProvider,
  type AssistantUiRuntimeBridge,
} from "./RuntimeBridgeContext.js";
import {
  createAssistantUiAgentRuntimeBridge,
  type AssistantUiAgentRuntimeBridge,
} from "./compatibility/agent-runtime-bridge.js";
import { AssistantUiApplicationEventSource } from "./events/application-event-source.js";
import type { AssistantUiThreadBinding } from "./threads/types.js";
import { createAssistantUiFrontendToolPort } from "./tools/types.js";

export interface AssistantUiAgentFactoryConfig {
  endpoint: string;
  threadId: string;
}

export type AssistantUiAgentFactory = (
  config: AssistantUiAgentFactoryConfig,
) => AbstractAgent;

export interface AssistantUiAgUiRuntimeProviderProps<TState = unknown> {
  config?: ComponentProps<typeof AssistantRuntimeProvider>["config"];
  endpoint: string;
  threadBinding: AssistantUiThreadBinding<TState>;
  frontendTools?: AgentFrontendToolSource | undefined;
  children: ReactNode;
  onError?: ((error: Error) => void) | undefined;
  /** Test seam; production callers should use the default single HttpAgent. */
  unstable_agentFactory?: AssistantUiAgentFactory | undefined;
}

const defaultAgentFactory: AssistantUiAgentFactory = ({ endpoint, threadId }) =>
  new HttpAgent({
    url: endpoint,
    threadId,
    headers: { Accept: "text/event-stream" },
  });

export function AssistantUiAgUiRuntimeProvider<TState = unknown>({
  config,
  endpoint,
  threadBinding,
  frontendTools,
  children,
  onError,
  unstable_agentFactory = defaultAgentFactory,
}: Readonly<AssistantUiAgUiRuntimeProviderProps<TState>>) {
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
  const fallbackThreadListSnapshot = useMemo(
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
                messages: loaded.messages,
                ...(loaded.state === undefined ? {} : { state: loaded.state as never }),
              };
            },
          }),
    }),
    [agent, threadBinding, threadId, threadListSnapshot],
  );
  const bridgeRef = useRef<AssistantUiAgentRuntimeBridge<TState> | null>(null);
  const handleError = useCallback((error: Error) => {
    bridgeRef.current?.recordError(error);
    onError?.(error);
  }, [onError]);
  const assistantRuntime = useAgUiRuntime({
    agent,
    showThinking: true,
    unstable_enableMessageQueue: false,
    adapters: { threadList },
    onError: handleError,
  });
  const applicationEvents = useMemo(
    () => new AssistantUiApplicationEventSource(agent),
    [agent],
  );
  const agentRuntime = useMemo(
    () => createAssistantUiAgentRuntimeBridge<TState>({
      runtime: assistantRuntime,
      threadBinding,
      applicationEvents,
    }),
    [applicationEvents, assistantRuntime, threadBinding],
  );
  bridgeRef.current = agentRuntime;
  const bridge = useMemo<AssistantUiRuntimeBridge<TState>>(
    () => ({
      agentRuntime,
      applicationEvents,
      observation: agentRuntime.observation,
      threadBinding,
      ...(frontendTools === undefined
        ? {}
        : { frontendTools: createAssistantUiFrontendToolPort(frontendTools) }),
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
    <AssistantUiRuntimeBridgeProvider bridge={bridge}>
      <AssistantRuntimeProvider runtime={assistantRuntime} config={config}>
        {children}
      </AssistantRuntimeProvider>
    </AssistantUiRuntimeBridgeProvider>
  );
}
