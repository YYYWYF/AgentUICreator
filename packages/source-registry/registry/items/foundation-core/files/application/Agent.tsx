import type { ConversationRuntimeProviderProps } from "@agent-ui/runtime-conversation";
import { AgentUIRoot } from "@agent-ui/react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";

import appUIModelSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import { generatedFrontendToolUIs } from "../agent-ui/conversation/frontend-tool-uis.generated";
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
import { PluginDiagnosticProvider, type RuntimeDiagnostic, type RuntimeCompositionSnapshot as ObservedComposition } from "../runtime/diagnostics";
import { publishAgentUIObservation, type AgentObservability } from "./observability";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";
import {
  ConversationPresentationConfigProvider,
  conversationPresentationConfig,
  conversationStarterSuggestions,
} from "../agent-ui/conversation/config";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { useConversationServiceThreadBinding, type ConversationRunResumeProvider } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { GeneratedConversationIntegrations } from "../agent-ui/conversation/integrations.generated";
import { conversationToolkit as baseConversationToolkit } from "../agent-ui/conversation/toolkit";
import { useAgentUITheme } from "../agent-ui/theme/useAgentUITheme";
import { agentCompositionStore } from "./composition-store";
import { agentUIRuntimeConfig as generatedAgentUIRuntimeConfig } from "./runtime-config.generated";
import type { AgentUIMode } from "../framework/contracts/agent-ui-mode";

const agentUIRuntimeConfig: Readonly<{ mode: AgentUIMode }> = generatedAgentUIRuntimeConfig;

import "../agent-ui/conversation/styles.css";

// The revision descriptor is optional until the first project-control mutation.
const revisionSources = import.meta.glob<string>("../app-ui/composition-revision.generated.json", { eager: true, query: "?raw", import: "default" });
const revisionDescriptorSource = revisionSources["../app-ui/composition-revision.generated.json"];

const appEventRegistry = new AppEventRegistry(appEventSchemas);
const frontendToolRuntime = new AppFrontendToolRuntime(
  new AppFrontendToolRegistry(appFrontendTools),
);

export interface AgentProps {
  /** The Host application's AG-UI endpoint. Defaults to VITE_AGENT_ENDPOINT or /agent. */
  endpoint?: string;
  observability?: AgentObservability;
  /** Application-owned official assistant-ui attachment adapter. */
  feedbackAdapter?: ConversationRuntimeProviderProps["feedbackAdapter"];
  attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
  /** Application-owned official assistant-ui speech-to-text adapter. */
  dictationAdapter?: ConversationRuntimeProviderProps["dictationAdapter"];
  /** Optional application-owned durable run capability for persisted conversations. */
  runResumeProvider?: ConversationRunResumeProvider<AppAgentState>;
  /** Host-owned persisted thread to reopen after refresh; omitted starts a new conversation. */
  initialThreadId?: string;
}

function AgentUIStyleSurface({ children }: { children: ReactNode }) {
  const theme = useAgentUITheme();
  return <AgentUIRoot theme={theme}>{children}</AgentUIRoot>;
}

function AgentSurface({ composition, observability }: {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  observability?: AgentObservability | undefined;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  const actions = useMemo(() => ({
    sendMessage: (input: Parameters<typeof agentRuntime.sendMessage>[0]) => agentRuntime.sendMessage(input),
    resumeInterrupts: (responses: Parameters<typeof agentRuntime.resumeInterrupts>[0]) => agentRuntime.resumeInterrupts(responses),
    startNewConversation: () => agentRuntime.startNewConversation(),
    abortRun: () => agentRuntime.abort(),
  }), [agentRuntime]);

  const previewRoot = useRef<HTMLDivElement>(null);
  const observed = import.meta.env.DEV || observability !== undefined;
  const onRuntimeDiagnostic = useCallback((diagnostic: RuntimeDiagnostic) => {
    observability?.onRuntimeDiagnostic?.(diagnostic);
    publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic });
  }, [observability]);
  const onRuntimeComposition = useCallback((snapshot: ObservedComposition) => {
    observability?.onRuntimeComposition?.(snapshot);
    publishAgentUIObservation({ type: "runtime-composition", composition: snapshot });
  }, [observability]);
  useEffect(() => {
    const element = previewRoot.current;
    const root = agentUIRuntimeConfig.mode === "assistant" ? element?.parentElement : element;
    if (!observed || root == null) return;
    const previousHash = root.getAttribute("data-app-ui-model-hash");
    const hadPreviewMarker = root.hasAttribute("data-agent-ui-preview-root");
    root.setAttribute("data-agent-ui-preview-root", "");
    root.setAttribute("data-app-ui-model-hash", composition.appUIModelHash);
    observability?.onPreviewCommitted?.(composition.appUIModelHash, root);
    publishAgentUIObservation({ type: "preview-committed", appUIModelHash: composition.appUIModelHash, root });
    return () => {
      if (agentUIRuntimeConfig.mode !== "assistant") return;
      if (!hadPreviewMarker) root.removeAttribute("data-agent-ui-preview-root");
      if (previousHash === null) root.removeAttribute("data-app-ui-model-hash");
      else root.setAttribute("data-app-ui-model-hash", previousHash);
    };
  }, [observed, composition.appUIModelHash, observability]);

  const content = (
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider
        actions={actions}
        applicationEventRegistry={appEventRegistry}
        applicationEventSource={agentRuntime}
        frontendTools={frontendToolRuntime}
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
      >
        <AgentUIStyleSurface>
          <PluginDataMessageUIHost model={composition.runtimeModel} registry={composition.activeRegistry} />
          <ConversationThreadBindingConnector />
          <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
            <ModeShell mode={agentUIRuntimeConfig.mode}>
              <UIPluginRuntime
                actions={actions}
                appUIModelHash={observed ? composition.appUIModelHash : undefined}
                onRuntimeComposition={observed ? onRuntimeComposition : undefined}
                onRuntimeDiagnostic={observed ? onRuntimeDiagnostic : undefined}
                className="development-preview"
                model={composition.runtimeModel}
                registry={composition.activeRegistry}
              />
            </ModeShell>
          </ConversationPresentationConfigProvider>
        </AgentUIStyleSurface>
      </PluginServiceProvider>
    </AgentRuntimeProvider>
  );
  if (!observed) return content;
  return (
    <div ref={previewRoot}
      {...(agentUIRuntimeConfig.mode === "assistant" ? {} : { "data-agent-ui-preview-root": "", "data-app-ui-model-hash": composition.appUIModelHash })}
      style={agentUIRuntimeConfig.mode === "assistant" ? { display: "contents" } : { width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr)" }}>
      <PluginDiagnosticProvider
        appUIModelHash={composition.appUIModelHash}
        compositionRevision={composition.revision}
        capabilityCatalogRevision={composition.capabilityCatalogRevision}
        publishedAt={composition.publishedAt}
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
        onRuntimeComposition={onRuntimeComposition}
        onRuntimeDiagnostic={onRuntimeDiagnostic}
      >{content}</PluginDiagnosticProvider>
    </div>
  );
}

export function Agent({ endpoint = import.meta.env.VITE_AGENT_ENDPOINT || "/agent", observability, attachmentAdapter, dictationAdapter, feedbackAdapter, runResumeProvider, initialThreadId }: AgentProps = {}) {
  const composition = useSyncExternalStore(
    agentCompositionStore.subscribe,
    agentCompositionStore.getSnapshot,
    agentCompositionStore.getSnapshot,
  );
  useEffect(() => {
    if (!import.meta.env.DEV && observability === undefined) return;
    const report = () => {
      const candidate = agentCompositionStore.getCandidateDiagnostic();
      if (candidate?.appUIModelHash === undefined) return;
      const diagnostic: RuntimeDiagnostic = {
        kind: "runtime-composition", status: candidate.status,
        appUIModelHash: candidate.appUIModelHash, compositionRevision: candidate.revision,
        capabilityCatalogRevision: candidate.capabilityCatalogRevision, occurredAt: candidate.occurredAt,
        ...(candidate.errorMessage === undefined ? {} : { errorMessage: candidate.errorMessage }),
      };
      observability?.onRuntimeDiagnostic?.(diagnostic);
      publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic });
    };
    const unsubscribe = agentCompositionStore.subscribeDiagnostics(report);
    report();
    return unsubscribe;
  }, [observability]);
  const threadBinding = useConversationServiceThreadBinding<AppAgentState>(runResumeProvider, initialThreadId);
  const toolkit = composition?.conversationToolkit ?? baseConversationToolkit;

  useEffect(() => {
    agentCompositionStore.stageCandidate({
      baseConversationToolkit,
      appUIModelSource,
      revisionDescriptorSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
  }, [appUIModelSource, revisionDescriptorSource, capabilityCatalogRevision, pluginCapabilityCatalog, baseConversationToolkit]);

  return (
    <ConversationRuntimeProvider<AppAgentState>
      endpoint={endpoint}
      feedbackAdapter={feedbackAdapter}
      attachmentAdapter={attachmentAdapter}
      dictationAdapter={dictationAdapter}
      frontendTools={frontendToolRuntime}
      frontendToolUIs={generatedFrontendToolUIs}
      suggestions={conversationStarterSuggestions}
      threadBinding={threadBinding}
      toolkit={toolkit}
    >
      <GeneratedConversationIntegrations>
        {composition === undefined ? null : <AgentSurface composition={composition} observability={observability} />}
      </GeneratedConversationIntegrations>
    </ConversationRuntimeProvider>
  );
}
