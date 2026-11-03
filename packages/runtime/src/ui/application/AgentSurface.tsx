import { type AgentUIShellProps, useAgentUIProject } from "../project-context.js";
import { useCallback, useEffect, useMemo, useRef, useLayoutEffect, createContext, useContext, type ReactNode, useState } from "react";
import { AgentUILocaleProvider, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import { useConversationRuntimeBridge } from "@za38.03/agent-ui-runtime";
import { AgentUILocaleBridge } from "../agent-ui/i18n/AgentUILocaleBridge.js";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types.js";
import type { AppAgentState } from "../agent-contract/agent-state.js";
import { AgentRuntimeProvider } from "../runtime/context/index.js";
import { AppEventRegistry } from "../runtime/events/index.js";
import type { AppFrontendToolRuntime } from "../runtime/tools/index.js";
import { PluginServiceProvider, UIPluginRuntime } from "../runtime/plugins/index.js";
import { PluginDataMessageUIHost } from "../runtime/plugins/PluginDataMessageUIHost.js";
import { PluginDiagnosticProvider, type RuntimeDiagnostic, type RuntimeCompositionSnapshot as ObservedComposition } from "../runtime/diagnostics/index.js";
import { publishAgentUIObservation, type AgentObservability } from "./observability.js";
import type { RuntimeCompositionSnapshot } from "../runtime/composition/index.js";
import { ConversationPresentationConfigProvider } from "../presentation-config.js";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector.js";
import { useApplicationSessionConnection } from "./ApplicationSessionBoundary.js";
import { useOptionalPluginServiceRuntime } from "../runtime/plugins/PluginServiceContext.js";
import { AgentUIThemeBridge } from "../agent-ui/theme/AgentUIThemeBridge.js";

interface AgentEnvironmentProps {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  frontendToolRuntime: AppFrontendToolRuntime;
  locale?: AgentUILocaleCode | undefined;
  presentationLocale: AgentUILocaleCode;
  children: ReactNode;
}
const AgentEnvironmentContext = createContext<{ actions: import("../runtime/plugins/PluginServiceRuntime.js").UIPluginRuntimeActions } | null>(null);

/** Nonvisual project binding. Services and history stay connected while the panel is closed. */
export function AgentEnvironment(props: AgentEnvironmentProps) {
  const inherited = useContext(AgentEnvironmentContext);
  return inherited ? <>{props.children}</> : <AgentEnvironmentOwner {...props} />;
}
function AgentEnvironmentOwner({ composition, frontendToolRuntime, locale, presentationLocale, children }: AgentEnvironmentProps) {
  const { locales: AGENT_UI_LOCALES, appEventSchemas, development, serviceOverrides } = useAgentUIProject();
  const appEventRegistry = useMemo(() => new AppEventRegistry(appEventSchemas), [appEventSchemas]);
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  useApplicationSessionConnection(agentRuntime);
  const inheritedServices = useOptionalPluginServiceRuntime();
  useLayoutEffect(() => inheritedServices?.applicationEvents.connect(agentRuntime), [inheritedServices, agentRuntime]);
  useEffect(() => {
    if (!development) return;
    const publish = () => window.dispatchEvent(new CustomEvent("agent-ui:preview-run-state", {
      detail: { running: ["running", "awaiting-input"].includes(agentRuntime.getSnapshot().run.status), threadId: agentRuntime.getSnapshot().conversation.id },
    }));
    publish();
    const unsubscribe = agentRuntime.subscribe(publish);
    window.addEventListener("agent-ui:preview-run-request", publish);
    return () => { window.removeEventListener("agent-ui:preview-run-request", publish); unsubscribe(); window.dispatchEvent(new CustomEvent("agent-ui:preview-run-state", { detail: { running: false } })); };
  }, [agentRuntime]);
  const activeAgentRuntime = useRef(agentRuntime);
  activeAgentRuntime.current = agentRuntime;
  // Thread switches replace the conversation bridge, not application services.
  // Keep Plugin setup actions stable while dispatching to the active thread.
  const actions = useMemo(() => ({
    sendMessage: (input: Parameters<typeof agentRuntime.sendMessage>[0]) => activeAgentRuntime.current.sendMessage(input),
    resumeInterrupts: (responses: Parameters<typeof agentRuntime.resumeInterrupts>[0]) => activeAgentRuntime.current.resumeInterrupts(responses),
    startNewConversation: () => activeAgentRuntime.current.startNewConversation(),
    abortRun: () => activeAgentRuntime.current.abort(),
  }), []);

  return <AgentUILocaleProvider locale={locale ?? presentationLocale} messages={AGENT_UI_LOCALES[locale ?? presentationLocale]}>
    <AgentRuntimeProvider runtime={agentRuntime}>
      <SurfaceServiceProvider actions={actions} applicationEventRegistry={appEventRegistry} applicationEventSource={agentRuntime}
        frontendTools={frontendToolRuntime} model={composition.runtimeModel} registry={composition.activeRegistry} serviceOverrides={serviceOverrides}>
        <AgentEnvironmentContext.Provider value={{ actions }}>
          <PluginDataMessageUIHost model={composition.runtimeModel} registry={composition.activeRegistry} />
          <ConversationThreadBindingConnector />
          {children}
        </AgentEnvironmentContext.Provider>
      </SurfaceServiceProvider>
    </AgentRuntimeProvider>
  </AgentUILocaleProvider>;
}

export function AgentSurface(props: Parameters<typeof AgentSurfaceView>[0]) {
  return <AgentEnvironment {...props}><AgentSurfaceView {...props} /></AgentEnvironment>;
}

function AgentSurfaceView({ composition, observability, frontendToolRuntime, locale, presentationLocale, onLocaleChange, theme, onThemeChange }: {
  theme?: AgentUITheme | undefined;
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  presentationLocale: AgentUILocaleCode;
  locale?: AgentUILocaleCode | undefined;
  onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined;
  frontendToolRuntime: AppFrontendToolRuntime;
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  observability?: AgentObservability | undefined;
}) {
  const { locales: AGENT_UI_LOCALES, Shell = InlineSurface, shell: agentUIShellConfig, presentation: conversationPresentationConfig, development } = useAgentUIProject();
  const environment = useContext(AgentEnvironmentContext);
  const actions = environment!.actions;
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const observed = development || observability !== undefined;
  const onRuntimeDiagnostic = useCallback((diagnostic: RuntimeDiagnostic) => {
    observability?.onRuntimeDiagnostic?.(diagnostic);
    publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic }, development);
  }, [observability, development]);
  const onRuntimeComposition = useCallback((snapshot: ObservedComposition) => {
    observability?.onRuntimeComposition?.(snapshot);
    publishAgentUIObservation({ type: "runtime-composition", composition: snapshot }, development);
  }, [observability, development]);
  useEffect(() => {
    const root = surface;
    if (!observed || root == null) return;
    const previousHash = root.getAttribute("data-app-ui-model-hash");
    const hadPreviewMarker = root.hasAttribute("data-agent-ui-preview-root");
    root.setAttribute("data-agent-ui-preview-root", "");
    root.setAttribute("data-app-ui-model-hash", composition.appUIModelHash);
    observability?.onPreviewCommitted?.(composition.appUIModelHash, root);
    publishAgentUIObservation({ type: "preview-committed", appUIModelHash: composition.appUIModelHash, root }, development);
    return () => {
      if (!hadPreviewMarker) root.removeAttribute("data-agent-ui-preview-root");
      if (previousHash === null) root.removeAttribute("data-app-ui-model-hash");
      else root.setAttribute("data-app-ui-model-hash", previousHash);
    };
  }, [observed, surface, composition.appUIModelHash, observability, development]);

  const content = (
    <AgentUILocaleProvider locale={locale ?? presentationLocale} messages={AGENT_UI_LOCALES[locale ?? presentationLocale]}>
        <AgentUILocaleBridge locale={locale} onLocaleChange={onLocaleChange}>
        <AgentUIThemeBridge theme={theme} onThemeChange={onThemeChange}>
          <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
            <Shell surfaceRef={observed ? setSurface : undefined} assistantPanelWidth={agentUIShellConfig.assistantPanelWidth}>
              <UIPluginRuntime
                actions={actions}
                appUIModelHash={observed ? composition.appUIModelHash : undefined}
                onRuntimeComposition={observed ? onRuntimeComposition : undefined}
                onRuntimeDiagnostic={observed ? onRuntimeDiagnostic : undefined}
                className="development-preview"
                model={composition.runtimeModel}
                registry={composition.activeRegistry}
              />
            </Shell>
          </ConversationPresentationConfigProvider>
        </AgentUIThemeBridge>
        </AgentUILocaleBridge>
    </AgentUILocaleProvider>
  );
  if (!observed) return content;
  return (
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
  );
}

/** Reuse the Application Foundation owner outside the conversation lifetime. */
function SurfaceServiceProvider(props: import("../runtime/plugins/PluginServiceProvider.js").PluginServiceProviderProps<AppAgentState>) {
  const inherited = useOptionalPluginServiceRuntime();
  return inherited ? <>{props.children}</> : <PluginServiceProvider {...props} />;
}

/** Without a project shell, render inline without imposing product UI. */
function InlineSurface({ children, surfaceRef }: AgentUIShellProps) { return <div ref={surfaceRef}>{children}</div>; }
