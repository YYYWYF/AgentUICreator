import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";

import appUIModelSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { AgentRuntimeProvider } from "../runtime/context";
import { AppEventRegistry } from "../runtime/events";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools";
import { PluginServiceProvider, UIPluginRuntime } from "../runtime/plugins";
import { PluginDataMessageUIHost } from "../runtime/plugins/PluginDataMessageUIHost";
import { ModeShell } from "../runtime/mode-shell";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";
import {
  ConversationPresentationConfigProvider,
  conversationPresentationConfig,
  conversationStarterSuggestions,
} from "../agent-ui/conversation/config";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { resolvePluginConversationToolkit } from "../runtime/plugins/plugin-conversation-toolkit";
import { agentCompositionStore } from "./composition-store";
import { agentUIRuntimeConfig } from "./runtime-config.generated";

import "../agent-ui/conversation/styles.css";

const appEventRegistry = new AppEventRegistry(appEventSchemas);
const frontendToolRuntime = new AppFrontendToolRuntime(
  new AppFrontendToolRegistry(appFrontendTools),
);

export interface AgentProps {
  /** The Host application's AG-UI endpoint. Defaults to VITE_AGENT_ENDPOINT or /agent. */
  endpoint?: string;
}

function AgentSurface({ composition }: {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  const actions = useMemo(() => ({
    sendMessage: (input: Parameters<typeof agentRuntime.sendMessage>[0]) => agentRuntime.sendMessage(input),
    resumeInterrupts: (responses: Parameters<typeof agentRuntime.resumeInterrupts>[0]) => agentRuntime.resumeInterrupts(responses),
    startNewConversation: () => agentRuntime.startNewConversation(),
    abortRun: () => agentRuntime.abort(),
  }), [agentRuntime]);

  return (
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider
        actions={actions}
        applicationEventRegistry={appEventRegistry}
        applicationEventSource={agentRuntime}
        frontendTools={frontendToolRuntime}
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
      >
        <PluginDataMessageUIHost model={composition.runtimeModel} registry={composition.activeRegistry} />
        <ConversationThreadBindingConnector />
        <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
          <ModeShell mode={agentUIRuntimeConfig.mode}>
            <UIPluginRuntime
              actions={actions}
              className="development-preview"
              model={composition.runtimeModel}
              registry={composition.activeRegistry}
            />
          </ModeShell>
        </ConversationPresentationConfigProvider>
      </PluginServiceProvider>
    </AgentRuntimeProvider>
  );
}

export function Agent({ endpoint = import.meta.env.VITE_AGENT_ENDPOINT || "/agent" }: AgentProps = {}) {
  const composition = useSyncExternalStore(
    agentCompositionStore.subscribe,
    agentCompositionStore.getSnapshot,
    agentCompositionStore.getSnapshot,
  );
  const threadBinding = useMemo(
    () => createConversationServiceThreadBinding<AppAgentState>(),
    [],
  );
  const toolkit = useMemo(() => composition === undefined ? createConversationToolkit()
    : resolvePluginConversationToolkit(composition.runtimeModel, composition.activeRegistry, createConversationToolkit()), [composition]);

  useEffect(() => {
    agentCompositionStore.stageCandidate({
      appUIModelSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
  }, [appUIModelSource, capabilityCatalogRevision, pluginCapabilityCatalog]);

  return (
    <ConversationRuntimeProvider<AppAgentState>
      endpoint={endpoint}
      frontendTools={frontendToolRuntime}
      suggestions={conversationStarterSuggestions}
      threadBinding={threadBinding}
      toolkit={toolkit}
    >
      {composition === undefined ? null : <AgentSurface composition={composition} />}
    </ConversationRuntimeProvider>
  );
}
