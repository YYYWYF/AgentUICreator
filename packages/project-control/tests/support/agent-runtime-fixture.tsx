import type { ReactNode } from "react";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

import { AgentRuntimeProvider } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/context/index";
import {
  UIPluginRuntime,
  type UIPluginRuntimeProps,
} from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";

export type PluginRuntimeFixtureProps<TState = unknown> =
  UIPluginRuntimeProps<TState> & AgentRuntimeSnapshot<TState>;

export function createStaticAgentRuntime<TState>(
  snapshot: AgentRuntimeSnapshot<TState>,
): AgentRuntime<TState> {
  return {
    mode: "test",
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}

export function AgentRuntimeFixture<TState>({
  children,
  snapshot,
}: {
  children: ReactNode;
  snapshot: AgentRuntimeSnapshot<TState>;
}) {
  return (
    <AgentRuntimeProvider runtime={createStaticAgentRuntime(snapshot)}>
      {children}
    </AgentRuntimeProvider>
  );
}

export function PluginRuntimeFixture<TState = unknown>(
  props: PluginRuntimeFixtureProps<TState>,
) {
  const {
    conversation,
    messages,
    state,
    run,
    executions,
    interrupts,
    ...runtimeProps
  } = props;
  return (
    <AgentRuntimeFixture
      snapshot={{ conversation, messages, state, run, executions, interrupts }}
    >
      <UIPluginRuntime {...runtimeProps} />
    </AgentRuntimeFixture>
  );
}
