import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AgentUIRoot, AgentUILocaleProvider, type AgentUITheme } from "@agent-ui/react";
import { useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import { AGENT_UI_LOCALES } from "../agent-ui/i18n/locale-registry";
import { AgentUILocaleBridge } from "../agent-ui/i18n/AgentUILocaleBridge";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { AgentRuntimeProvider } from "../runtime/context";
import { AppEventRegistry } from "../runtime/events";
import type { AppFrontendToolRuntime } from "../runtime/tools";
import { PluginServiceProvider, UIPluginRuntime } from "../runtime/plugins";
import { PluginDataMessageUIHost } from "../runtime/plugins/PluginDataMessageUIHost";
import { ModeShell } from "../runtime/mode-shell";
import { PluginDiagnosticProvider, type RuntimeDiagnostic, type RuntimeCompositionSnapshot as ObservedComposition } from "../runtime/diagnostics";
import { publishAgentUIObservation, type AgentObservability } from "./observability";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";
import { ConversationPresentationConfigProvider, conversationPresentationConfig } from "../agent-ui/conversation/config";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { usePluginService } from "../runtime/plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../services/agent-ui-theme";
import { useAgentUITheme } from "../agent-ui/theme/useAgentUITheme";
import { agentUIRuntimeConfig as generatedAgentUIRuntimeConfig } from "./runtime-config.generated";
import type { AgentUIMode } from "../framework/contracts/agent-ui-mode";
const agentUIRuntimeConfig: Readonly<{ mode: AgentUIMode }> = generatedAgentUIRuntimeConfig;
const appEventRegistry = new AppEventRegistry(appEventSchemas);

/** Canonical product composition shared by native React and compatibility Hosts. */
function AgentUIStyleSurface({ children, themeOverride }: { children: ReactNode; themeOverride?: AgentUITheme | undefined }) {
  const theme = useAgentUITheme();
  const themeService = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  useEffect(() => { if (themeOverride !== undefined) themeService?.setTheme(themeOverride); }, [themeService, themeOverride]);
  return <AgentUIRoot theme={themeOverride ?? theme}>{children}</AgentUIRoot>;
}

export function AgentSurface({ composition, observability, frontendToolRuntime, locale, presentationLocale, onLocaleChange, theme, mode = agentUIRuntimeConfig.mode }: {
  theme?: AgentUITheme | undefined;
  mode?: AgentUIMode | undefined;
  presentationLocale: AgentUILocaleCode;
  locale?: AgentUILocaleCode | undefined;
  onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined;
  frontendToolRuntime: AppFrontendToolRuntime;
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  observability?: AgentObservability | undefined;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const publish = () => window.dispatchEvent(new CustomEvent("agent-ui:preview-run-state", {
      detail: { running: ["running", "awaiting-input"].includes(agentRuntime.getSnapshot().run.status) },
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
    <AgentUILocaleProvider locale={locale ?? presentationLocale} messages={AGENT_UI_LOCALES[locale ?? presentationLocale]}>
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider
        actions={actions}
        applicationEventRegistry={appEventRegistry}
        applicationEventSource={agentRuntime}
        frontendTools={frontendToolRuntime}
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
      >
        <AgentUILocaleBridge locale={locale} onLocaleChange={onLocaleChange}>
        <AgentUIStyleSurface themeOverride={theme}>
          <PluginDataMessageUIHost model={composition.runtimeModel} registry={composition.activeRegistry} />
          <ConversationThreadBindingConnector />
          <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
            <ModeShell mode={mode}>
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
        </AgentUILocaleBridge>
      </PluginServiceProvider>
    </AgentRuntimeProvider>
    </AgentUILocaleProvider>
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
