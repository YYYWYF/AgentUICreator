import type { AgentUITheme } from "@za38.03/agent-ui-plugins";
import { agentUILocaleConfig } from "../agent-ui/i18n/locale-config";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types";
import { usePreviewAgentEnvironment } from "./preview-environment";
import type { ConversationRuntimeProviderProps } from "@za38.03/agent-ui-runtime";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ConversationRuntimeProvider,
  AgentUIProvider as RuntimeAgentUIProvider, AgentUIConversationBinding, AgentUIConnectionState,
  AgentUIOutlet, useAgentUISurfaceTarget, useOptionalAgentUI,
} from "@za38.03/agent-ui-runtime";

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
import { AgentSurface, AgentEnvironment } from "./AgentSurface";
import { type AgentUser } from "./host-user";

import "../agent-ui/conversation/styles.css";

// The revision descriptor is optional until the first operator mutation.
const revisionSources = import.meta.glob<string>("../app-ui/composition-revision.generated.json", { eager: true, query: "?raw", import: "default" });
const revisionDescriptorSource = revisionSources["../app-ui/composition-revision.generated.json"];

export interface AgentProps {
  /** Host-controlled presentation theme; omitted uses the project theme service/default. */
  theme?: AgentUITheme | undefined;
  /** Reports theme changes requested by the UI. Update theme to accept a controlled change. */
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  /** Host-owned profile for account presentation. null shows the signed-out profile; omitted uses auth.session. */
  user?: AgentUser | null | undefined;
  /** Optional Host-owned page-memory notice service. Never persisted or sent to the Agent. */
  transientMessages?: ConversationRuntimeProviderProps["transientMessages"];
  /** Optional Host-owned presentation locale; never sent to AG-UI. */
  locale?: AgentUILocaleCode;
  /** Reports language changes initiated by the UI, including locale-switch. */
  onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined;
  /** The Host application's AG-UI endpoint. Defaults to VITE_AGENT_ENDPOINT or /agent. */
  endpoint?: string;
  observability?: AgentObservability;
  /** Application errors and Agent run errors reported by the conversation provider. */
  onError?: ConversationRuntimeProviderProps["onError"];
  /** Application-owned feedback persistence. */
  feedbackAdapter?: ConversationRuntimeProviderProps["feedbackAdapter"];
  /** Application-owned official Agent UI attachment adapter. */
  attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
  /** Application-owned official Agent UI speech-to-text adapter. */
  dictationAdapter?: ConversationRuntimeProviderProps["dictationAdapter"];
  /** Optional application-owned durable run capability for persisted conversations. */
  runResumeProvider?: ConversationRunResumeProvider<AppAgentState> | undefined;
  /** Host-owned persisted thread to reopen after refresh; omitted starts a new conversation. */
  initialThreadId?: string | undefined;
}

function AgentSession({ transientMessages, theme, onThemeChange, locale, onLocaleChange, endpoint = import.meta.env.VITE_AGENT_ENDPOINT || "/agent", observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId }: AgentProps = {}) {
  const [presentationLocale, setPresentationLocale] = useState<AgentUILocaleCode>(locale ?? agentUILocaleConfig.defaultLocale);
  const handleLocaleChange = useCallback((nextLocale: AgentUILocaleCode) => {
    setPresentationLocale(nextLocale);
    onLocaleChange?.(nextLocale);
  }, [onLocaleChange]);
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
  const candidate = useSyncExternalStore(agentCompositionStore.subscribeDiagnostics, agentCompositionStore.getCandidateDiagnostic, agentCompositionStore.getCandidateDiagnostic);
  useEffect(() => {
    if (candidate?.status === "error") onError?.(new Error(candidate.errorMessage ?? "AGENT_UI_COMPOSITION_ERROR"));
  }, [candidate, onError]);
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

  if (composition === undefined) return <AgentUIConnectionState status={candidate?.status === "error" ? "error" : "initializing"} />;
  return (
    <ApplicationSessionBoundary composition={composition} frontendTools={frontendToolRuntime} observability={observability} locale={locale ?? presentationLocale} theme={theme} onThemeChange={onThemeChange}
      renderGate={(content, phase) => <><AgentUIConnectionState status={phase === "error" ? "error" : phase === "blocked" ? "blocked" : "initializing"} /><AgentSurfacePortal>{content}</AgentSurfacePortal></>}>
    <AuthenticatedConversation {...{ transientMessages, theme, onThemeChange, locale, onLocaleChange, endpoint, observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale: handleLocaleChange, suggestions, frontendToolRuntime, composition, toolkit }} />
    </ApplicationSessionBoundary>
  );
}

function AuthenticatedConversation({ transientMessages, theme, onThemeChange, locale, endpoint, observability, attachmentAdapter, dictationAdapter, feedbackAdapter, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale, suggestions, frontendToolRuntime, composition, toolkit }: { [K in keyof AgentProps]: AgentProps[K] | undefined } & {
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
      transientMessages={transientMessages}
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
        <AgentEnvironment composition={composition} frontendToolRuntime={frontendToolRuntime} locale={locale} presentationLocale={presentationLocale}>
          <AgentUIConversationBinding />
          <AgentSurfacePortal><AgentSurface theme={theme} onThemeChange={onThemeChange} presentationLocale={presentationLocale} locale={locale} onLocaleChange={setPresentationLocale} frontendToolRuntime={frontendToolRuntime} composition={composition} observability={observability} /></AgentSurfacePortal>
        </AgentEnvironment>
      </GeneratedConversationIntegrations>
    </ConversationRuntimeProvider>
  );
}

/** Project-only binding; the Host API and lifecycle implementation live in the runtime package. */
export interface AgentUIProviderProps extends AgentProps { children: ReactNode; }
export function AgentUIProvider({ children, user, ...props }: AgentUIProviderProps) {
  const preview = usePreviewAgentEnvironment();
  const previewPending = import.meta.env.DEV && new URLSearchParams(window.location.search).has("creator-preview") && !preview;
  return <RuntimeAgentUIProvider user={user}>
    {children}
    {previewPending ? null : <AgentSession key={JSON.stringify([preview?.identity ?? "product", props.endpoint ?? "/agent"])} {...props}
      {...(preview ? { endpoint: preview.runtimeEndpoint, initialThreadId: undefined, ...(preview.conversationDataEndpointOverride ? { runResumeProvider: undefined } : {}) } : {})} />}
  </RuntimeAgentUIProvider>;
}

/** Preserve conversation context while mounting the visible surface in the Host's chosen region. */
function AgentSurfacePortal({ children }: { children: ReactNode }) {
  const target = useAgentUISurfaceTarget();
  return target ? createPortal(children, target) : null;
}

/** Reuse an enclosing Host provider, or retain the standalone entry for existing projects. */
export function Agent(props: AgentProps = {}) {
  const host = useOptionalAgentUI();
  if (host) {
    if (Object.keys(props).length > 0) throw new Error("AGENT_UI_CONFIGURE_OUTER_PROVIDER");
    return <AgentUIOutlet />;
  }
  return <AgentUIProvider {...props}><AgentUIOutlet /></AgentUIProvider>;
}
