import { agentUILocaleConfig } from "../agent-ui/i18n/locale-config";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types";
import { usePreviewAgentEnvironment } from "./preview-environment";
import type { ConversationRuntimeProviderProps } from "@agent-ui/runtime-conversation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ConversationRuntimeProvider,
} from "@agent-ui/runtime-conversation";

import appUIModelSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appFrontendTools } from "../agent-contract/agent-tools";
import { generatedFrontendToolUIs } from "../agent-ui/conversation/frontend-tool-uis.generated";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools";
import type { RuntimeDiagnostic } from "../runtime/diagnostics";
import { publishAgentUIObservation, type AgentObservability } from "./observability";
import {
  getConversationStarterSuggestions,
  conversationMessageQueueEnabled,
} from "../agent-ui/conversation/config";
import { useConversationServiceThreadBinding, type ConversationRunResumeProvider } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { GeneratedConversationIntegrations } from "../agent-ui/conversation/integrations.generated";
import { conversationToolkit as baseConversationToolkit } from "../agent-ui/conversation/toolkit";
import { agentCompositionStore } from "./composition-store";
import { ApplicationSessionBoundary, useApplicationSessionEpoch } from "./ApplicationSessionBoundary";
import { AgentSurface } from "./AgentSurface";

import "../agent-ui/conversation/styles.css";

// The revision descriptor is optional until the first project-control mutation.
const revisionSources = import.meta.glob<string>("../app-ui/composition-revision.generated.json", { eager: true, query: "?raw", import: "default" });
const revisionDescriptorSource = revisionSources["../app-ui/composition-revision.generated.json"];

export interface AgentProps {
  /** Optional Host-owned presentation locale; never sent to AG-UI. */
  locale?: AgentUILocaleCode;
  /** The Host application's AG-UI endpoint. Defaults to VITE_AGENT_ENDPOINT or /agent. */
  endpoint?: string;
  observability?: AgentObservability;
  /** Application errors and Agent run errors reported by the conversation provider. */
  onError?: ConversationRuntimeProviderProps["onError"];
  /** Application-owned feedback persistence. */
  feedbackAdapter?: ConversationRuntimeProviderProps["feedbackAdapter"];
  /** Application-owned official assistant-ui attachment adapter. */
  attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
  /** Application-owned official assistant-ui speech-to-text adapter. */
  dictationAdapter?: ConversationRuntimeProviderProps["dictationAdapter"];
  /** Optional application-owned durable run capability for persisted conversations. */
  runResumeProvider?: ConversationRunResumeProvider<AppAgentState> | undefined;
  /** Host-owned persisted thread to reopen after refresh; omitted starts a new conversation. */
  initialThreadId?: string | undefined;
}

function AgentSession({ locale, endpoint = import.meta.env.VITE_AGENT_ENDPOINT || "/agent", observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId }: AgentProps = {}) {
  const [presentationLocale, setPresentationLocale] = useState<AgentUILocaleCode>(locale ?? agentUILocaleConfig.defaultLocale);
  const suggestions = useMemo(() => getConversationStarterSuggestions(locale ?? presentationLocale), [locale, presentationLocale]);
  const frontendToolRuntime = useMemo(() => new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools)), []);
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

  if (composition === undefined) return null;
  return (
    <ApplicationSessionBoundary composition={composition} frontendTools={frontendToolRuntime} observability={observability} locale={locale ?? presentationLocale}>
    <AuthenticatedConversation {...{ locale, endpoint, observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale, suggestions, frontendToolRuntime, composition, toolkit }} />
    </ApplicationSessionBoundary>
  );
}

function AuthenticatedConversation({ locale, endpoint, observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale, suggestions, frontendToolRuntime, composition, toolkit }: { [K in keyof AgentProps]: AgentProps[K] | undefined } & {
  endpoint: string;
  presentationLocale: AgentUILocaleCode;
  setPresentationLocale: (locale: AgentUILocaleCode) => void;
  suggestions: ReturnType<typeof getConversationStarterSuggestions>;
  frontendToolRuntime: AppFrontendToolRuntime;
  composition: NonNullable<ReturnType<typeof agentCompositionStore.getSnapshot>>;
  toolkit: typeof baseConversationToolkit;
}) {
  const epoch = useApplicationSessionEpoch();
  const threadBinding = useConversationServiceThreadBinding<AppAgentState>(runResumeProvider, epoch === 0 ? initialThreadId : undefined);
  return (
    <ConversationRuntimeProvider<AppAgentState>
      endpoint={endpoint}
      enableMessageQueue={conversationMessageQueueEnabled}
      feedbackAdapter={feedbackAdapter}
      onError={onError}
      attachmentAdapter={attachmentAdapter}
      dictationAdapter={dictationAdapter}
      frontendTools={frontendToolRuntime}
      frontendToolUIs={generatedFrontendToolUIs}
      suggestions={suggestions}
      threadBinding={threadBinding}
      toolkit={toolkit}
    >
      <GeneratedConversationIntegrations>
        {composition === undefined ? null : <AgentSurface presentationLocale={presentationLocale} locale={locale} onLocaleChange={setPresentationLocale} frontendToolRuntime={frontendToolRuntime} composition={composition} observability={observability} />}
      </GeneratedConversationIntegrations>
    </ConversationRuntimeProvider>
  );
}

/** Source changes start a new session, including bindings, services and tool state. */
export function Agent(props: AgentProps = {}) {
  const preview = usePreviewAgentEnvironment();
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("creator-preview") && !preview) return null;
  return <AgentSession key={preview?.identity ?? "product"} {...props} {...(preview ? { endpoint: preview.runtimeEndpoint, initialThreadId: undefined, ...(preview.conversationDataEndpointOverride ? { runResumeProvider: undefined } : {}) } : {})} />;
}
