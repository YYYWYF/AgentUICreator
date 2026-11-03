import { AgentUIProjectProvider, useAgentUIProject, type AgentUIProjectOptions } from "../project-context.js";
import { createAgentUILocaleService, type AgentUITheme, type AgentUILocaleOverrides } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_LOCALE_SERVICE } from "../services/agent-ui-locale.js";
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, type ConversationDataSource } from "../services/conversations.js";
import type { AppEventSchemas } from "../runtime/events/AppEventRegistry.js";
import type { ConversationWelcomeConfig } from "../presentation-config.js";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types.js";
import { usePreviewAgentEnvironment } from "./preview-environment.js";
import type { ConversationRuntimeProviderProps } from "@za38.03/agent-ui-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  ConversationRuntimeProvider, combineAgentFrontendToolSources,
  AgentUIProvider as RuntimeAgentUIProvider, AgentUIConversationBinding, AgentUIConnectionState,
  AgentUIOutlet, AgentUIHostUserProvider, useAgentUIUser, useAgentUISurfaceTarget, useOptionalAgentUI,
} from "@za38.03/agent-ui-runtime";

import type { AppAgentState } from "../agent-contract/agent-state.js";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools/index.js";
import type { RuntimeDiagnostic } from "../runtime/diagnostics/index.js";
import { publishAgentUIObservation, type AgentObservability } from "./observability.js";
import { useConversationServiceThreadBinding, type ConversationRunResumeProvider } from "../agent-ui/conversation/threads/conversation-service-thread-binding.js";
import { ApplicationSessionBoundary, useApplicationSessionEpoch } from "./ApplicationSessionBoundary.js";
import { AgentSurface, AgentEnvironment } from "./AgentSurface.js";
import { type AgentUser } from "./host-user.js";


export interface AgentProps extends Pick<ConversationRuntimeProviderProps,
  "attachments" | "dictation" | "feedback" | "attachmentAdapter" | "dictationAdapter" | "feedbackAdapter"> {
  appEventSchemas?: AppEventSchemas | undefined;
  locales?: Partial<Record<AgentUILocaleCode, AgentUILocaleOverrides>> | undefined;
  /** Initial language for uncontrolled internal switching. */
  defaultLocale?: AgentUILocaleCode | undefined;
  welcome?: ConversationWelcomeConfig | undefined;
  suggestions?: readonly import("@za38.03/agent-ui-runtime").ConversationStarterSuggestion[] |
    AgentUIProjectOptions["getConversationStarterSuggestions"] | undefined;
  enableMessageQueue?: boolean | undefined;
  assistantPanelWidth?: number | undefined;
  /** Project-owned history implementation; its enabled Plugin remains the service owner. */
  conversationDataSource?: ConversationDataSource | undefined;
  toolkit?: ConversationRuntimeProviderProps["toolkit"];
  frontendToolUIs?: ConversationRuntimeProviderProps["frontendToolUIs"];
  integrations?: ComponentType<{ children: ReactNode }> | undefined;
  /** Explicit Host-owned page operations, combined with the project tool allowlist. */
  frontendTools?: ConversationRuntimeProviderProps["frontendTools"];
  /** Read current Host data into AG-UI context on each run and interrupt resume. */
  getRunContext?: ConversationRuntimeProviderProps["getRunContext"];
  /** Host-controlled presentation theme; omitted starts with the built-in theme and allows internal switching. */
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
  /** The Host application's AG-UI endpoint. Defaults to /agent. */
  endpoint?: string;
  observability?: AgentObservability;
  /** Application errors and Agent run errors reported by the conversation provider. */
  onError?: ConversationRuntimeProviderProps["onError"];
  /** Optional application-owned durable run capability for persisted conversations. */
  runResumeProvider?: ConversationRunResumeProvider<AppAgentState> | undefined;
  /** Host-owned persisted thread to reopen after refresh; omitted starts a new conversation. */
  initialThreadId?: string | undefined;
}

function AgentSession({ frontendTools, getRunContext, transientMessages, theme, onThemeChange, locale, onLocaleChange, endpoint = "/agent", observability, onError, runResumeProvider, initialThreadId }: AgentProps = {}) {
  const { defaultLocale, appFrontendTools, appUIModelSource, revisionDescriptorSource, pluginCapabilityCatalog, capabilityCatalogRevision, baseConversationToolkit, compositionStore: agentCompositionStore, getConversationStarterSuggestions, development } = useAgentUIProject();
  const [presentationLocale, setPresentationLocale] = useState<AgentUILocaleCode>(locale ?? defaultLocale);
  const handleLocaleChange = useCallback((nextLocale: AgentUILocaleCode) => {
    setPresentationLocale(nextLocale);
    onLocaleChange?.(nextLocale);
  }, [onLocaleChange]);
  const suggestions = useMemo(() => getConversationStarterSuggestions(locale ?? presentationLocale), [locale, presentationLocale, getConversationStarterSuggestions]);
  const frontendToolRuntime = useMemo(() => new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools)), [appFrontendTools]);
  const combinedFrontendTools = useMemo(() => combineAgentFrontendToolSources(frontendToolRuntime, frontendTools), [frontendToolRuntime, frontendTools]);
  const composition = useSyncExternalStore(
    agentCompositionStore.subscribe,
    agentCompositionStore.getSnapshot,
    agentCompositionStore.getSnapshot,
  );
  useEffect(() => {
    if (!development && observability === undefined) return;
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
      publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic }, development);
    };
    const unsubscribe = agentCompositionStore.subscribeDiagnostics(report);
    report();
    return unsubscribe;
  }, [observability, agentCompositionStore, development]);
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
  }, [agentCompositionStore, appUIModelSource, revisionDescriptorSource, capabilityCatalogRevision, pluginCapabilityCatalog, baseConversationToolkit]);

  if (composition === undefined) return <AgentUIConnectionState status={candidate?.status === "error" ? "error" : "initializing"} />;
  return (
    <ApplicationSessionBoundary composition={composition} frontendTools={frontendToolRuntime} observability={observability} locale={locale ?? presentationLocale} theme={theme} onThemeChange={onThemeChange}
      renderGate={(content, phase) => <><AgentUIConnectionState status={phase === "error" ? "error" : phase === "blocked" ? "blocked" : "initializing"} /><AgentSurfacePortal>{content}</AgentSurfacePortal></>}>
    <AuthenticatedConversation {...{ frontendTools: combinedFrontendTools, getRunContext, transientMessages, theme, onThemeChange, locale, onLocaleChange, endpoint, observability, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale: handleLocaleChange, suggestions, frontendToolRuntime, composition, toolkit }} />
    </ApplicationSessionBoundary>
  );
}

function AuthenticatedConversation({ frontendTools, getRunContext, transientMessages, theme, onThemeChange, locale, endpoint, observability, onError, runResumeProvider, initialThreadId, presentationLocale, setPresentationLocale, suggestions, frontendToolRuntime, composition, toolkit }: { [K in keyof AgentProps]: AgentProps[K] | undefined } & {
  endpoint: string;
  presentationLocale: AgentUILocaleCode;
  setPresentationLocale: (locale: AgentUILocaleCode) => void;
  suggestions: ReturnType<AgentUIProjectOptions["getConversationStarterSuggestions"]>;
  frontendToolRuntime: AppFrontendToolRuntime;
  composition: NonNullable<ReturnType<AgentUIProjectOptions["compositionStore"]["getSnapshot"]>>;
  toolkit: import("@za38.03/agent-ui-plugins").ConversationToolkit;
}) {
  const { conversationMessageQueueEnabled, conversationServices, generatedFrontendToolUIs, Integrations: GeneratedConversationIntegrations } = useAgentUIProject();
  const epoch = useApplicationSessionEpoch();
  const threadBinding = useConversationServiceThreadBinding<AppAgentState>(runResumeProvider, epoch === 0 ? initialThreadId : undefined);
  return (
    <ConversationRuntimeProvider<AppAgentState>
      transientMessages={transientMessages}
      endpoint={endpoint}
      enableMessageQueue={conversationMessageQueueEnabled}
      {...conversationServices}
      onError={onError}
      frontendTools={frontendTools}
      getRunContext={getRunContext}
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

/** Project composition belongs to Agent; the optional shared Host provider comes from npm. */
function AgentContent({ user, ...props }: AgentProps) {
  const inheritedUser = useAgentUIUser();
  const project = useAgentUIProject();
  const { development } = project;
  const preview = usePreviewAgentEnvironment(development);
  const previewProject = useMemo(() => {
    if (!preview?.conversationDataEndpointOverride) return project;
    const serviceOverrides = { ...project.serviceOverrides };
    delete serviceOverrides[AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE];
    return { ...project, serviceOverrides };
  }, [project, preview?.conversationDataEndpointOverride]);
  const previewPending = development && new URLSearchParams(window.location.search).has("creator-preview") && preview === undefined;
  return <AgentUIHostUserProvider user={user === undefined ? inheritedUser : user}>
    <AgentUIOutlet />
    <AgentUIProjectProvider value={previewProject}>
      {previewPending ? null : <AgentSession key={JSON.stringify([preview?.identity ?? "product", props.endpoint ?? "/agent"])} {...props}
        {...(preview ? { endpoint: preview.runtimeEndpoint, initialThreadId: undefined, ...(preview.conversationDataEndpointOverride ? { runResumeProvider: undefined } : {}) } : {})} />}
    </AgentUIProjectProvider>
  </AgentUIHostUserProvider>;
}

/** Preserve conversation context while mounting the visible surface in the Host's chosen region. */
function AgentSurfacePortal({ children }: { children: ReactNode }) {
  const target = useAgentUISurfaceTarget();
  return target ? createPortal(children, target) : null;
}

/** Standalone by default; business code can opt into the package-owned shared Host provider. */
function Agent(props: AgentProps = {}) {
  const host = useOptionalAgentUI();
  if (host) return <AgentContent {...props} />;
  return <RuntimeAgentUIProvider><AgentContent {...props} /></RuntimeAgentUIProvider>;
}

/** Package-owned assembly, configured exclusively by the project application layer. */
export function AgentApplication({ project, ...props }: AgentProps & { project: AgentUIProjectOptions }) {
  const locales = useMemo(() => ({ ...project.locales, ...props.locales }), [project.locales, props.locales]);
  const [localeService] = useState(() => createAgentUILocaleService(props.locale ?? props.defaultLocale ?? project.defaultLocale, locales));
  useLayoutEffect(() => localeService.setMessages(locales), [localeService, locales]);
  const GeneratedIntegrations = project.Integrations;
  const HostIntegrations = props.integrations;
  const Integrations = useMemo(() => HostIntegrations === undefined ? GeneratedIntegrations
    : ({ children }: { children: ReactNode }) => <GeneratedIntegrations><HostIntegrations>{children}</HostIntegrations></GeneratedIntegrations>, [GeneratedIntegrations, HostIntegrations]);
  const serviceOverrides = useMemo(() => ({
    ...project.serviceOverrides, [AGENT_UI_LOCALE_SERVICE]: localeService,
    ...(props.conversationDataSource === undefined ? {} : { [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]: props.conversationDataSource }),
  }), [project.serviceOverrides, localeService, props.conversationDataSource]);
  const resolved = useMemo<AgentUIProjectOptions>(() => {
    const conversationServices = { ...project.conversationServices };
    for (const key of ["attachments", "dictation", "feedback", "attachmentAdapter", "dictationAdapter", "feedbackAdapter"] as const) {
      if (props[key] !== undefined) Object.assign(conversationServices, { [key]: props[key] });
    }
    const suggestions = props.suggestions;
    return { ...project, locales, conversationServices, serviceOverrides, Integrations,
      appEventSchemas: props.appEventSchemas ?? project.appEventSchemas,
      defaultLocale: props.locale ?? props.defaultLocale ?? project.defaultLocale,
      presentation: props.welcome === undefined ? project.presentation : { welcome: props.welcome },
      shell: props.assistantPanelWidth === undefined ? project.shell : { assistantPanelWidth: props.assistantPanelWidth },
      conversationMessageQueueEnabled: props.enableMessageQueue ?? project.conversationMessageQueueEnabled,
      getConversationStarterSuggestions: suggestions === undefined ? project.getConversationStarterSuggestions
        : typeof suggestions === "function" ? suggestions : () => suggestions,
      baseConversationToolkit: props.toolkit ?? project.baseConversationToolkit,
      generatedFrontendToolUIs: props.frontendToolUIs ?? project.generatedFrontendToolUIs,
    };
  }, [project, locales, serviceOverrides, Integrations, props.appEventSchemas, props.welcome, props.assistantPanelWidth,
    props.enableMessageQueue, props.suggestions, props.locale, props.defaultLocale, props.conversationDataSource, props.toolkit,
    props.frontendToolUIs, props.attachments, props.dictation, props.feedback,
    props.attachmentAdapter, props.dictationAdapter, props.feedbackAdapter]);
  return <AgentUIProjectProvider value={resolved}><Agent {...props} /></AgentUIProjectProvider>;
}
