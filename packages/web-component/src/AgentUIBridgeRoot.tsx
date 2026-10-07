import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AgentUILocaleProvider, AgentUIRoot } from "@agent-ui/react";
import { ConversationRuntimeProvider, useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import type { ResolvedAgentUIConfig } from "./config";
import type { AgentUIEmit } from "./events";
import appUIModelSource from "../.generated/src/agent-ui/app-ui/app-ui.json?raw";
import type { AppAgentState } from "../.generated/src/agent-ui/agent-contract/agent-state";
import { appEventSchemas } from "../.generated/src/agent-ui/agent-contract/agent-events";
import { appFrontendTools } from "../.generated/src/agent-ui/agent-contract/agent-tools";
import { pluginCapabilityCatalog, capabilityCatalogRevision } from "../.generated/src/agent-ui/plugins";
import { createPluginCapabilityCatalog, createRuntimeCompositionStore, type RuntimeCompositionSnapshot } from "../.generated/src/agent-ui/runtime/composition";
import { AgentRuntimeProvider } from "../.generated/src/agent-ui/runtime/context";
import { AppEventRegistry } from "../.generated/src/agent-ui/runtime/events";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../.generated/src/agent-ui/runtime/tools";
import { PluginServiceProvider, UIPluginRuntime } from "../.generated/src/agent-ui/runtime/plugins";
import { PluginDataMessageUIHost } from "../.generated/src/agent-ui/runtime/plugins/PluginDataMessageUIHost";
import { ModeShell } from "../.generated/src/agent-ui/runtime/mode-shell";
import { ConversationPresentationConfigProvider, conversationPresentationConfig, getConversationStarterSuggestions } from "../.generated/src/agent-ui/agent-ui/conversation/config";
import { ConversationThreadBindingConnector } from "../.generated/src/agent-ui/agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { useConversationServiceThreadBinding } from "../.generated/src/agent-ui/agent-ui/conversation/threads/conversation-service-thread-binding";
import { GeneratedConversationIntegrations } from "../.generated/src/agent-ui/agent-ui/conversation/integrations.generated";
import { generatedFrontendToolUIs } from "../.generated/src/agent-ui/agent-ui/conversation/frontend-tool-uis.generated";
import { conversationToolkit } from "../.generated/src/agent-ui/agent-ui/conversation/toolkit";
import { AGENT_UI_LOCALES } from "../.generated/src/agent-ui/agent-ui/i18n/locale-registry";
import { AgentUILocaleBridge } from "../.generated/src/agent-ui/agent-ui/i18n/AgentUILocaleBridge";
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, createEmptyConversationDataSource, createHttpConversationDataSource } from "../.generated/src/agent-ui/services/conversations";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../.generated/src/agent-ui/services/agent-ui-theme";
import { usePluginService } from "../.generated/src/agent-ui/runtime/plugins";
import { useAgentUITheme } from "../.generated/src/agent-ui/agent-ui/theme/useAgentUITheme";

const eventRegistry = new AppEventRegistry(appEventSchemas);
type Props = { config: ResolvedAgentUIConfig; emit: AgentUIEmit };

/** Compatibility composition only: all conversation UI, plugins and wire
 * behavior come from the official generated embedded project. */
export function AgentUIBridgeRoot(props: Props) {
  // Changing connection identity starts a fresh session; presentation updates
  // preserve the current Runtime, draft, services and bindings.
  return <BridgeSession key={JSON.stringify([props.config.endpoint, props.config.threadId, props.config.conversationDataEndpoint])} {...props} />;
}

function BridgeSession({ config, emit }: Props) {
  const [store] = useState(() => createRuntimeCompositionStore<AppAgentState>());
  const composition = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [frontendTools] = useState(() => new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools)));
  const threadBinding = useConversationServiceThreadBinding<AppAgentState>(undefined, config.threadId);
  const onError = useCallback((error: Error) => emit("error", { code: "AGENT_UI_RUNTIME_ERROR", error }), [emit]);
  const suggestions = useMemo(() => getConversationStarterSuggestions(config.locale), [config.locale]);
  const catalog = useMemo(() => createPluginCapabilityCatalog<AppAgentState>(pluginCapabilityCatalog.list().map(entry => {
    if (entry.manifest.id !== "conversation-data-source") return entry;
    return { ...entry, async loadDefinition() {
      const definition = await entry.loadDefinition();
      return { ...definition, setup: ({ services }) => {
        // Same production conversation data implementation, configured per element.
        const source = config.conversationDataEndpoint === undefined
          ? createEmptyConversationDataSource()
          : createHttpConversationDataSource({ endpoint: config.conversationDataEndpoint });
        services.provide(AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, source);
      } };
    } };
  })), [config.conversationDataEndpoint]);

  useEffect(() => {
    const report = () => {
      const diagnostic = store.getCandidateDiagnostic();
      if (diagnostic?.status === "error") emit("error", { code: "AGENT_UI_CONFIG_ERROR", error: new Error(diagnostic.errorMessage) });
    };
    return store.subscribeDiagnostics(report);
  }, [store, emit]);
  useEffect(() => {
    store.stageCandidate({ appUIModelSource: config.appUIModel === undefined ? appUIModelSource : JSON.stringify(config.appUIModel),
      capabilityCatalog: catalog, capabilityCatalogRevision, baseConversationToolkit: conversationToolkit });
  }, [store, config.appUIModel, catalog]);
  // Wait for a valid composition before starting the canonical provider.
  if (composition === undefined) return null;
  return <ConversationRuntimeProvider<AppAgentState>
    endpoint={config.endpoint} threadBinding={threadBinding} frontendTools={frontendTools}
    frontendToolUIs={generatedFrontendToolUIs} toolkit={composition.conversationToolkit}
    attachmentAdapter={config.attachmentAdapter} suggestions={suggestions}
    onError={onError}>
    <GeneratedConversationIntegrations>
      <BridgeSurface config={config} emit={emit} composition={composition} frontendTools={frontendTools} />
    </GeneratedConversationIntegrations>
  </ConversationRuntimeProvider>;
}

function BridgeSurface({ config, emit, composition, frontendTools }: Props & {
  composition: RuntimeCompositionSnapshot<AppAgentState>; frontendTools: AppFrontendToolRuntime;
}) {
  const { agentRuntime, threadBinding } = useConversationRuntimeBridge<AppAgentState>();
  const activeRuntime = useRef(agentRuntime);
  activeRuntime.current = agentRuntime;
  const actions = useMemo(() => ({
    sendMessage: (input: Parameters<typeof agentRuntime.sendMessage>[0]) => activeRuntime.current.sendMessage(input),
    resumeInterrupts: (input: Parameters<typeof agentRuntime.resumeInterrupts>[0]) => activeRuntime.current.resumeInterrupts(input),
    startNewConversation: () => activeRuntime.current.startNewConversation(),
    abortRun: () => activeRuntime.current.abort(),
  }), []);
  useEffect(() => () => { activeRuntime.current.abort(); }, []);
  const ready = useRef(false);
  const lastThread = useRef<string | undefined>(undefined);
  useEffect(() => {
    const report = () => {
      const threadId = threadBinding.getThreadId();
      if (!ready.current) { ready.current = true; emit("ready", { threadId }); }
      if (lastThread.current !== threadId) {
        lastThread.current = threadId;
        emit("thread-change", { threadId });
      }
    };
    report();
    return threadBinding.subscribe(report);
  }, [threadBinding, emit]);
  return <AgentUILocaleProvider locale={config.locale} messages={AGENT_UI_LOCALES[config.locale]}>
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider actions={actions} applicationEventRegistry={eventRegistry}
        applicationEventSource={agentRuntime} frontendTools={frontendTools}
        model={composition.runtimeModel} registry={composition.activeRegistry}>
        <AgentUILocaleBridge locale={config.locale}>
          <StyleSurface config={config}>
            <PluginDataMessageUIHost model={composition.runtimeModel} registry={composition.activeRegistry} />
            <ConversationThreadBindingConnector />
            <ConversationPresentationConfigProvider value={conversationPresentationConfig}>
              <ModeShell mode="embedded">
                <UIPluginRuntime actions={actions} model={composition.runtimeModel} registry={composition.activeRegistry} />
              </ModeShell>
            </ConversationPresentationConfigProvider>
          </StyleSurface>
        </AgentUILocaleBridge>
      </PluginServiceProvider>
    </AgentRuntimeProvider>
  </AgentUILocaleProvider>;
}

function StyleSurface({ config, children }: { config: ResolvedAgentUIConfig; children: React.ReactNode }) {
  const themeService = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const theme = useAgentUITheme();
  useEffect(() => { themeService?.setTheme(config.theme); }, [themeService, config.theme]);
  // AgentUIRoot already owns all product Portal containers inside this Shadow DOM.
  return <AgentUIRoot theme={themeService === undefined ? config.theme : theme}>{children}</AgentUIRoot>;
}
