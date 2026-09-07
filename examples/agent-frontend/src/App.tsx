import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { XProvider } from "@ant-design/x";
import { theme as antdTheme } from "antd";
import { createAgUiTransport } from "@agent-ui/runtime-agui";
import { createAgentRuntime } from "@agent-ui/runtime-core";

import appUIJsonSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import {
  parseAppUIModel,
  parseAppUIModelJson,
} from "../framework/contracts/app-ui-model";
import { pluginDefinitions } from "../plugins";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeMode,
  type AgentUIThemeService,
} from "../plugins/antd-x-theme-provider/theme-service";
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
  usePluginService,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import {
  PluginDiagnosticProvider,
  sha256Text,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticReporter,
} from "../runtime/diagnostics";
import { resolveAgentEndpoint } from "./agent-endpoint";
import "./styles.css";

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
const agentTransport = createAgUiTransport<AppAgentState>({
  endpoint,
  frontendTools: appFrontendToolRuntime,
});
const agentRuntime = createAgentRuntime<AppAgentState>({
  transport: agentTransport,
});

const sharedThemeTokens = {
  colorPrimary: "#7565ea",
  colorInfo: "#21b7aa",
  colorSuccess: "#35bc82",
  colorError: "#ec5f7b",
  borderRadius: 16,
  borderRadiusLG: 20,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const agentFrontendThemes = {
  dark: {
    algorithm: antdTheme.darkAlgorithm,
    token: {
      ...sharedThemeTokens,
      colorPrimary: "#8b7cff",
      colorInfo: "#4fe0d0",
      colorSuccess: "#57e6a5",
      colorError: "#ff6b8a",
      colorBgBase: "#07101d",
      colorBgContainer: "#0d192b",
      colorBgElevated: "#121f34",
      colorBorder: "#273755",
      colorBorderSecondary: "#1d2b44",
      colorText: "#f4f6ff",
      colorTextSecondary: "#9ba8c3",
    },
  },
  light: {
    algorithm: antdTheme.defaultAlgorithm,
    token: {
      ...sharedThemeTokens,
      colorBgBase: "#f5f7ff",
      colorBgContainer: "#ffffff",
      colorBgElevated: "#ffffff",
      colorBorder: "#d9def0",
      colorBorderSecondary: "#e8ebf5",
      colorText: "#18213a",
      colorTextSecondary: "#65708a",
    },
  },
} as const;

const subscribeToNothing = (): (() => void) => () => undefined;
const getDefaultThemeMode = (): AgentUIThemeMode => "dark";

function AgentFrontendSurface({
  actions,
  model,
}: {
  actions: UIPluginRuntimeActions;
  model: typeof initialAppUIModel;
}) {
  const themeService = usePluginService<AgentUIThemeService>(
    AGENT_UI_THEME_SERVICE,
  );
  const mode = useSyncExternalStore(
    themeService?.subscribe ?? subscribeToNothing,
    themeService?.getMode ?? getDefaultThemeMode,
    themeService?.getMode ?? getDefaultThemeMode,
  );

  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <main
      className="development-preview"
      data-agent-runtime={agentRuntime.mode}
      data-agent-ui-theme={mode}
    >
      <XProvider theme={agentFrontendThemes[mode]}>
        <UIPluginRuntime
          actions={actions}
          className="agent-template-shell"
          model={model}
          registry={pluginRegistry}
        />
      </XProvider>
    </main>
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

  const pluginActions = useMemo<UIPluginRuntimeActions>(
    () => ({
      sendMessage: (input) => agentRuntime.sendMessage(input),
      resumeInterrupts: (responses) => agentRuntime.resumeInterrupts(responses),
      startNewConversation: () => agentRuntime.startNewConversation(),
      abortRun: () => agentRuntime.abort(),
      updateInstanceProps,
    }),
    [updateInstanceProps],
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
    >
      <AgentRuntimeProvider runtime={agentRuntime}>
        <PluginServiceProvider
          actions={pluginActions}
          applicationEventRegistry={appEventRegistry}
          applicationEventSource={agentRuntime}
          frontendTools={appFrontendToolRuntime}
          model={model}
          registry={pluginRegistry}
        >
          <AgentFrontendSurface actions={pluginActions} model={model} />
        </PluginServiceProvider>
      </AgentRuntimeProvider>
    </PluginDiagnosticProvider>
  );
}
