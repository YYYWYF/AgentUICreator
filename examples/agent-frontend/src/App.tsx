import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuiConfig, Suggestions, Tools } from "@assistant-ui/react";
import {
  AssistantUiAgUiRuntimeProvider,
  useAssistantUiRuntimeBridge,
} from "@agent-ui/runtime-assistant-ui";
import type { AgentRuntime } from "@agent-ui/runtime-core";

import appUIJsonSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import {
  parseAppUIModel,
  parseAppUIModelJson,
} from "../framework/contracts/app-ui-model";
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
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";
import { useAgentUIThemeMode } from "../agent-ui/theme/useAgentUITheme";
import {
  AssistantUiPresentationConfigProvider,
  resolveAssistantUiPresentationConfig,
} from "../agent-ui/adapters/assistant-ui/config";
import { resolveAgentEndpoint } from "./agent-endpoint";
import { AssistantUiConversationThreadBindingConnector } from "../agent-ui/adapters/assistant-ui/threads/AssistantUiConversationThreadBindingConnector";
import { createConversationServiceAssistantUiThreadBinding } from "../agent-ui/adapters/assistant-ui/threads/conversation-service-thread-binding";
import { assistantUiToolkit } from "../agent-ui/adapters/assistant-ui/toolkit";
import { AssistantUiRuntimeDebugOverlay } from "./dev/AssistantUiRuntimeDebugOverlay";
import "../agent-ui/adapters/assistant-ui/styles/globals.css";
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
const initialAppUIModel = parseAppUIModelJson(appUIJsonSource);
const pluginRegistry = createPluginRegistry<AppAgentState>(pluginDefinitions);
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
  model: typeof initialAppUIModel;
  runtimeMode: string;
}) {
  const themeMode = useAgentUIThemeMode();

  return (
    <AgentUIRoot
      theme={themeMode}
      className="development-preview"
      data-agent-runtime={runtimeMode}
    >
      <UIPluginRuntime
        actions={actions}
        className="agent-template-shell"
        model={model}
        registry={pluginRegistry}
      />
    </AgentUIRoot>
  );
}

function RuntimeConnectedApp({
  model,
  runtime,
  updateInstanceProps,
  integration,
}: {
  model: typeof initialAppUIModel;
  runtime: AgentRuntime<AppAgentState>;
  updateInstanceProps: (instanceId: string, props: Record<string, unknown>) => void;
  integration?: ReactNode;
}) {
  const pluginActions = useMemo<UIPluginRuntimeActions>(
    () => ({
      sendMessage: (input) => runtime.sendMessage(input),
      resumeInterrupts: (responses) => runtime.resumeInterrupts(responses),
      startNewConversation: () => runtime.startNewConversation(),
      abortRun: () => runtime.abort(),
      updateInstanceProps,
    }),
    [runtime, updateInstanceProps],
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

function AssistantUiRuntimeConnectedApp({
  model,
  updateInstanceProps,
}: {
  model: typeof initialAppUIModel;
  updateInstanceProps: (instanceId: string, props: Record<string, unknown>) => void;
}) {
  const { agentRuntime } = useAssistantUiRuntimeBridge<AppAgentState>();
  return (
    <RuntimeConnectedApp
      model={model}
      runtime={agentRuntime}
      updateInstanceProps={updateInstanceProps}
      integration={<AssistantUiConversationThreadBindingConnector />}
    />
  );
}

function AssistantUiRuntimeBoundary({
  model,
  updateInstanceProps,
}: {
  model: typeof initialAppUIModel;
  updateInstanceProps: (instanceId: string, props: Record<string, unknown>) => void;
}) {
  const threadBinding = useMemo(
    () => createConversationServiceAssistantUiThreadBinding<AppAgentState>(),
    [],
  );
  const presentationConfig = useMemo(
    () => resolveAssistantUiPresentationConfig(model),
    [model],
  );
  const assistantConfig = useMemo(
    () => AuiConfig({
      suggestions: Suggestions(
        presentationConfig.starterSuggestions.map(
          ({ label, prompt, title }) => ({
            title,
            label: label ?? "",
            prompt,
          }),
        ),
      ),
      tools: Tools({ toolkit: assistantUiToolkit }),
    }),
    [presentationConfig.starterSuggestions],
  );
  if (endpoint === undefined) {
    throw new Error("The assistant-ui mode requires an AG-UI endpoint.");
  }
  return (
    <AssistantUiAgUiRuntimeProvider<AppAgentState>
      config={assistantConfig}
      endpoint={endpoint}
      frontendTools={appFrontendToolRuntime}
      threadBinding={threadBinding}
    >
      <AssistantUiPresentationConfigProvider value={presentationConfig}>
        <AssistantUiRuntimeConnectedApp
          model={model}
          updateInstanceProps={updateInstanceProps}
        />
      </AssistantUiPresentationConfigProvider>
      {import.meta.env.DEV ? <AssistantUiRuntimeDebugOverlay /> : null}
    </AssistantUiAgUiRuntimeProvider>
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
  const [model, setModel] = useState(initialAppUIModel);
  const [appUIModelHash, setAppUIModelHash] = useState<string>();

  useEffect(() => {
    let active = true;
    void sha256Text(appUIJsonSource).then((hash) => {
      if (active) {
        setModel(initialAppUIModel);
        setAppUIModelHash(hash);
      }
    });
    return () => {
      active = false;
    };
  }, [appUIJsonSource]);

  const updateInstanceProps = useCallback(
    (instanceId: string, props: Record<string, unknown>) => {
      setModel((current) => {
        const instance = current.pluginInstances[instanceId];

        if (instance === undefined) {
          return current;
        }

        return parseAppUIModel({
          ...current,
          pluginInstances: {
            ...current.pluginInstances,
            [instanceId]: {
              ...instance,
              props: { ...instance.props, ...props },
            },
          },
        });
      });
    },
    [],
  );

  if (appUIModelHash === undefined) {
    return <main className="development-preview" aria-busy="true" />;
  }

  return (
    <PluginDiagnosticProvider
      appUIModelHash={appUIModelHash}
      model={model}
      onRuntimeComposition={onRuntimeComposition}
      onRuntimeDiagnostic={onRuntimeDiagnostic}
      registry={pluginRegistry}
    >
      <AssistantUiRuntimeBoundary
        model={model}
        updateInstanceProps={updateInstanceProps}
      />
    </PluginDiagnosticProvider>
  );
}
