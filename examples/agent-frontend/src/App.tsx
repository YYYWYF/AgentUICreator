import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";
import type { AgentRuntime } from "@agent-ui/runtime-core";

import appUIJsonSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { resolveAgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import { pluginDefinitions } from "../plugins";
import { AgentRuntimeProvider } from "../runtime/context";
import { AppEventRegistry } from "../runtime/events";
import {
  AppFrontendToolRegistry,
  AppFrontendToolRuntime,
} from "../runtime/tools";
import {
  createPluginRegistry,
  createPluginCompositionCatalog,
  PluginServiceProvider,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import {
  PluginDiagnosticProvider,
  sha256Text,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticReporter,
} from "../runtime/diagnostics";
import { ModeShell } from "../runtime/mode-shell";
import { useAgentUIThemeMode } from "../agent-ui/theme/useAgentUITheme";
import {
  ConversationPresentationConfigProvider,
  resolveConversationPresentationConfig,
} from "../agent-ui/conversation/config";
import {
  isMockAgentEndpoint,
  resolveAgentEndpoint,
  shouldRenderDevStudio,
} from "./agent-endpoint";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { DevStudio } from "./dev/DevStudio/DevStudio";
import "../agent-ui/conversation/styles.css";
import "./preview-shell.css";

const projectConfigSources = import.meta.glob<string>(
  "../.agent-ui/project.json",
  { eager: true, import: "default", query: "?raw" },
);
const projectConfigJsonSource =
  projectConfigSources["../.agent-ui/project.json"];
export const currentAgentUIMode = resolveAgentUIProjectConfig(
  projectConfigJsonSource === undefined
    ? undefined
    : JSON.parse(projectConfigJsonSource),
).config.mode;
const pluginRegistry = createPluginRegistry<AppAgentState>(pluginDefinitions);
const pluginCompositionCatalog = createPluginCompositionCatalog(pluginRegistry);
const initialAppUIModel = parseAppUIModelJson(appUIJsonSource);
const initialRuntimeModel = compileAppUIModel(
  initialAppUIModel,
  pluginCompositionCatalog,
);
const appEventRegistry = new AppEventRegistry(appEventSchemas);
const appFrontendToolRegistry = new AppFrontendToolRegistry(appFrontendTools);
const appFrontendToolRuntime = new AppFrontendToolRuntime(
  appFrontendToolRegistry,
);
const endpoint = resolveAgentEndpoint({
  configuredEndpoint: import.meta.env.VITE_AGENT_ENDPOINT,
  isDev: import.meta.env.DEV,
  search: window.location.search,
});

function AgentFrontendSurface({
  actions,
  model,
  runtimeMode,
}: {
  actions: UIPluginRuntimeActions;
  model: typeof initialRuntimeModel;
  runtimeMode: string;
}) {
  const themeMode = useAgentUIThemeMode();

  return (
    <div
      className="agent-ui-conversation development-preview"
      data-agent-runtime={runtimeMode}
      data-theme={themeMode}
    >
      <UIPluginRuntime
        actions={actions}
        className="agent-template-shell"
        model={model}
        registry={pluginRegistry}
      />
      {shouldRenderDevStudio({ isDev: import.meta.env.DEV }) ? (
        <DevStudio endpoint={endpoint} />
      ) : null}
    </div>
  );
}

function RuntimeConnectedApp({
  model,
  runtime,
  integration,
}: {
  model: typeof initialRuntimeModel;
  runtime: AgentRuntime<AppAgentState>;
  integration?: ReactNode;
}) {
  const pluginActions = useMemo<UIPluginRuntimeActions>(
    () => ({
      sendMessage: (input) => runtime.sendMessage(input),
      resumeInterrupts: (responses) => runtime.resumeInterrupts(responses),
      startNewConversation: () => runtime.startNewConversation(),
      abortRun: () => runtime.abort(),
    }),
    [runtime],
  );

  return (
    <AgentRuntimeProvider runtime={runtime}>
      <PluginServiceProvider
        actions={pluginActions}
        applicationEventRegistry={appEventRegistry}
        applicationEventSource={runtime}
        frontendTools={appFrontendToolRuntime}
        model={model}
        registry={pluginRegistry}
      >
        {integration}
        <ModeShell mode={currentAgentUIMode}>
          <AgentFrontendSurface
            actions={pluginActions}
            model={model}
            runtimeMode={runtime.mode}
          />
        </ModeShell>
      </PluginServiceProvider>
    </AgentRuntimeProvider>
  );
}

function ConversationRuntimeConnectedApp({
  model,
}: {
  model: typeof initialRuntimeModel;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();
  return (
    <RuntimeConnectedApp
      model={model}
      runtime={agentRuntime}
      integration={<ConversationThreadBindingConnector />}
    />
  );
}

function ConversationRuntimeBoundary({
  model,
}: {
  model: typeof initialRuntimeModel;
}) {
  const threadBinding = useMemo(
    () => createConversationServiceThreadBinding<AppAgentState>(),
    [],
  );
  const presentationConfig = useMemo(
    () => resolveConversationPresentationConfig(model),
    [model],
  );
  const toolkit = useMemo(
    () => createConversationToolkit({
      mockAgentElements: isMockAgentEndpoint(endpoint),
    }),
    [],
  );
  if (endpoint === undefined) {
    throw new Error("The Conversation mode requires an AG-UI endpoint.");
  }
  return (
    <ConversationRuntimeProvider<AppAgentState>
      endpoint={endpoint}
      frontendTools={appFrontendToolRuntime}
      toolkit={toolkit}
      threadBinding={threadBinding}
    >
      <ConversationPresentationConfigProvider value={presentationConfig}>
        <ConversationRuntimeConnectedApp
          model={model}
        />
      </ConversationPresentationConfigProvider>
    </ConversationRuntimeProvider>
  );
}

export interface AppProps {
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}

export function App({
  onRuntimeComposition,
  onRuntimeDiagnostic,
}: AppProps = {}) {
  const [appUIModel, setAppUIModel] = useState(initialAppUIModel);
  const [appUIModelHash, setAppUIModelHash] = useState<string>();
  const runtimeModel = useMemo(
    () => compileAppUIModel(appUIModel, pluginCompositionCatalog),
    [appUIModel],
  );

  useEffect(() => {
    let active = true;
    void sha256Text(appUIJsonSource).then((hash) => {
      if (active) {
        setAppUIModel(initialAppUIModel);
        setAppUIModelHash(hash);
      }
    });
    return () => {
      active = false;
    };
  }, [appUIJsonSource]);

  if (appUIModelHash === undefined) {
    return <main className="development-preview" aria-busy="true" />;
  }

  return (
    <PluginDiagnosticProvider
      appUIModelHash={appUIModelHash}
      model={runtimeModel}
      onRuntimeComposition={onRuntimeComposition}
      onRuntimeDiagnostic={onRuntimeDiagnostic}
      registry={pluginRegistry}
    >
      <ConversationRuntimeBoundary
        model={runtimeModel}
      />
    </PluginDiagnosticProvider>
  );
}
