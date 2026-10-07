import { AgentSurface } from "./AgentSurface";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConversationRuntimeProvider, useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import type { ResolvedAgentUICompatibilityConfig as ResolvedAgentUIConfig, AgentUIEmit } from "./compatibility-config";
import appUIModelSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appFrontendTools } from "../agent-contract/agent-tools";
import { pluginCapabilityCatalog, capabilityCatalogRevision } from "../plugins";
import { createPluginCapabilityCatalog, createRuntimeCompositionStore, type RuntimeCompositionSnapshot } from "../runtime/composition";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools";
import { getConversationStarterSuggestions } from "../agent-ui/conversation/config";
import { useConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { GeneratedConversationIntegrations } from "../agent-ui/conversation/integrations.generated";
import { generatedFrontendToolUIs } from "../agent-ui/conversation/frontend-tool-uis.generated";
import { conversationToolkit } from "../agent-ui/conversation/toolkit";
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE, createEmptyConversationDataSource, createHttpConversationDataSource } from "../services/conversations";

type Props = { config: ResolvedAgentUIConfig; emit: AgentUIEmit };

/** Compatibility composition only: all conversation UI, plugins and wire
 * behavior come from the official generated embedded project. */
export function AgentUICompatibilityRoot(props: Props) {
  // Changing connection identity starts a fresh session; presentation updates
  // preserve the current Runtime, draft, services and bindings.
  return <BridgeSession key={JSON.stringify([props.config.endpoint, props.config.threadId, props.config.conversationDataEndpoint])} {...props} />;
}

function BridgeSession({ config, emit }: Props) {
  const [store] = useState(() => createRuntimeCompositionStore<AppAgentState>());
  const composition = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [frontendTools] = useState(() => new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools)));
  const threadBinding = useConversationServiceThreadBinding<AppAgentState>(undefined, config.threadId);
  const onError = useCallback((error: Error) => emit("agent-error", { code: "AGENT_UI_RUNTIME_ERROR", error }), [emit]);
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
      if (diagnostic?.status === "error") emit("agent-error", { code: "AGENT_UI_CONFIG_ERROR", error: new Error(diagnostic.errorMessage) });
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
  useEffect(() => () => { activeRuntime.current.abort(); }, []);
  const ready = useRef(false);
  const lastThread = useRef<string | undefined>(undefined);
  useEffect(() => {
    const report = () => {
      const threadId = threadBinding.getThreadId();
      if (!ready.current) { ready.current = true; emit("agent-ready", { threadId }); }
      if (lastThread.current !== threadId) {
        lastThread.current = threadId;
        emit("thread-change", { threadId });
      }
    };
    report();
    return threadBinding.subscribe(report);
  }, [threadBinding, emit]);
  return <AgentSurface composition={composition} frontendToolRuntime={frontendTools}
    locale={config.locale} presentationLocale={config.locale} theme={config.theme} mode="embedded" />;
}
