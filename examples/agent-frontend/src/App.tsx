import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ConversationRuntimeProvider,
  useConversationRuntimeBridge,
} from "@agent-ui/runtime-conversation";
import type { AgentRuntime } from "@agent-ui/runtime-core";

import appUIJsonSource from "../app-ui/app-ui.json?raw";
import type { AppAgentState } from "../agent-contract/agent-state";
import { appEventSchemas } from "../agent-contract/agent-events";
import { appFrontendTools } from "../agent-contract/agent-tools";
import { resolveAgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { AgentRuntimeProvider } from "../runtime/context";
import { AppEventRegistry } from "../runtime/events";
import {
  AppFrontendToolRegistry,
  AppFrontendToolRuntime,
} from "../runtime/tools";
import {
  PluginServiceProvider,
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import {
  PluginDiagnosticProvider,
  RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticReporter,
} from "../runtime/diagnostics";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";
import { ModeShell } from "../runtime/mode-shell";
import { useAgentUIThemeMode } from "../agent-ui/theme/useAgentUITheme";
import {
  ConversationPresentationConfigProvider,
  resolveConversationPresentationConfig,
} from "../agent-ui/conversation/config";
import { ConversationThreadBindingConnector } from "../agent-ui/conversation/threads/ConversationThreadBindingConnector";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import {
  isMockAgentEndpoint,
  resolveAgentEndpoint,
  shouldRenderDevStudio,
} from "./agent-endpoint";
import { DevStudio } from "./dev/DevStudio/DevStudio";
import { PreviewCompositionBoundary } from "./PreviewCompositionBoundary";
import { runtimeCompositionStore } from "./runtime-composition-store";
import "../agent-ui/conversation/styles.css";
import "./preview-shell.css";

const projectConfigSources = import.meta.glob<string>(
  "../.agent-ui/project.json",
  { eager: true, import: "default", query: "?raw" },
);
const projectConfigJsonSource =
  projectConfigSources["../.agent-ui/project.json"];
const compositionRevisionSources = import.meta.glob<string>(
  "../app-ui/composition-revision.generated.json",
  { eager: true, import: "default", query: "?raw" },
);
const compositionRevisionSource =
  compositionRevisionSources[
    "../app-ui/composition-revision.generated.json"
  ];

export const currentAgentUIMode = resolveAgentUIProjectConfig(
  projectConfigJsonSource === undefined
    ? undefined
    : JSON.parse(projectConfigJsonSource),
).config.mode;

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
  composition,
  runtimeMode,
}: {
  actions: UIPluginRuntimeActions;
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  runtimeMode: string;
}) {
  const themeMode = useAgentUIThemeMode();

  return (
    <div
      className="agent-ui-conversation development-preview"
      data-agent-runtime={runtimeMode}
      data-composition-revision={composition.revision}
      data-theme={themeMode}
    >
      <UIPluginRuntime
        actions={actions}
        className="agent-template-shell"
        model={composition.runtimeModel}
        registry={composition.activeRegistry}
      />
      {shouldRenderDevStudio({ isDev: import.meta.env.DEV }) ? (
        <DevStudio endpoint={endpoint} />
      ) : null}
    </div>
  );
}

function RuntimeConnectedPreview({
  composition,
  onRuntimeComposition,
  onRuntimeDiagnostic,
  runtime,
}: {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
  runtime: AgentRuntime<AppAgentState>;
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
  const presentationConfig = useMemo(
    () => resolveConversationPresentationConfig(composition.runtimeModel),
    [composition.runtimeModel],
  );

  return (
    <PreviewCompositionBoundary
      revision={composition.revision}
      onError={(failure) => {
        try {
          onRuntimeDiagnostic?.({
            schemaVersion: RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
            kind: "preview-runtime",
            status: "error",
            appUIModelHash: composition.appUIModelHash,
            compositionRevision: composition.revision,
            capabilityCatalogRevision:
              composition.capabilityCatalogRevision,
            publishedAt: composition.publishedAt,
            occurredAt: new Date().toISOString(),
            errorMessage: failure.errorMessage,
            ...(failure.componentStack === undefined
              ? {}
              : { componentStack: failure.componentStack }),
          });
        } catch {
          // Development diagnostics cannot own the Preview lifecycle.
        }
      }}
    >
      <PluginDiagnosticProvider
        appUIModelHash={composition.appUIModelHash}
        capabilityCatalogRevision={composition.capabilityCatalogRevision}
        compositionRevision={composition.revision}
        model={composition.runtimeModel}
        onRuntimeComposition={onRuntimeComposition}
        onRuntimeDiagnostic={onRuntimeDiagnostic}
        publishedAt={composition.publishedAt}
        registry={composition.activeRegistry}
      >
        <PluginServiceProvider
          actions={pluginActions}
          applicationEventRegistry={appEventRegistry}
          applicationEventSource={runtime}
          frontendTools={appFrontendToolRuntime}
          model={composition.runtimeModel}
          registry={composition.activeRegistry}
        >
          <ConversationThreadBindingConnector />
          <ConversationPresentationConfigProvider value={presentationConfig}>
            <ModeShell mode={currentAgentUIMode}>
              <AgentFrontendSurface
                actions={pluginActions}
                composition={composition}
                runtimeMode={runtime.mode}
              />
            </ModeShell>
          </ConversationPresentationConfigProvider>
        </PluginServiceProvider>
      </PluginDiagnosticProvider>
    </PreviewCompositionBoundary>
  );
}

function RuntimeControlPlane({
  composition,
  onRuntimeComposition,
  onRuntimeDiagnostic,
}: {
  composition: RuntimeCompositionSnapshot<AppAgentState> | undefined;
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}) {
  const { agentRuntime } = useConversationRuntimeBridge<AppAgentState>();

  return (
    <AgentRuntimeProvider runtime={agentRuntime}>
      {composition === undefined ? (
        <main className="development-preview" aria-busy="true" />
      ) : (
        <RuntimeConnectedPreview
          composition={composition}
          onRuntimeComposition={onRuntimeComposition}
          onRuntimeDiagnostic={onRuntimeDiagnostic}
          runtime={agentRuntime}
        />
      )}
    </AgentRuntimeProvider>
  );
}

function ConversationRuntimeBoundary({
  composition,
  onRuntimeComposition,
  onRuntimeDiagnostic,
}: {
  composition: RuntimeCompositionSnapshot<AppAgentState> | undefined;
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}) {
  const threadBinding = useMemo(
    () => createConversationServiceThreadBinding<AppAgentState>(),
    [],
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
      <RuntimeControlPlane
        composition={composition}
        onRuntimeComposition={onRuntimeComposition}
        onRuntimeDiagnostic={onRuntimeDiagnostic}
      />
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
  const composition = useSyncExternalStore(
    runtimeCompositionStore.subscribe,
    runtimeCompositionStore.getSnapshot,
    runtimeCompositionStore.getSnapshot,
  );
  const candidateDiagnostic = useSyncExternalStore(
    runtimeCompositionStore.subscribeDiagnostics,
    runtimeCompositionStore.getCandidateDiagnostic,
    runtimeCompositionStore.getCandidateDiagnostic,
  );

  useEffect(() => {
    runtimeCompositionStore.stageCandidate({
      appUIModelSource: appUIJsonSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
      ...(compositionRevisionSource === undefined
        ? {}
        : { revisionDescriptorSource: compositionRevisionSource }),
    });
  }, [
    appUIJsonSource,
    capabilityCatalogRevision,
    compositionRevisionSource,
    pluginCapabilityCatalog,
  ]);

  useEffect(() => {
    if (candidateDiagnostic === undefined || onRuntimeDiagnostic === undefined) {
      return;
    }
    try {
      onRuntimeDiagnostic({
        schemaVersion: RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
        kind: "runtime-composition",
        status: candidateDiagnostic.status,
        appUIModelHash:
          composition?.appUIModelHash ??
          candidateDiagnostic.appUIModelHash ??
          "unknown",
        compositionRevision:
          composition?.revision ?? candidateDiagnostic.revision,
        capabilityCatalogRevision:
          composition?.capabilityCatalogRevision ??
          candidateDiagnostic.capabilityCatalogRevision,
        ...(composition?.publishedAt === undefined
          ? {}
          : { publishedAt: composition.publishedAt }),
        occurredAt: candidateDiagnostic.occurredAt,
        ...(candidateDiagnostic.errorMessage === undefined
          ? {}
          : { errorMessage: candidateDiagnostic.errorMessage }),
      });
    } catch {
      // Development diagnostics cannot own the Preview lifecycle.
    }
  }, [candidateDiagnostic, composition, onRuntimeDiagnostic]);

  return (
    <ConversationRuntimeBoundary
      composition={composition}
      onRuntimeComposition={onRuntimeComposition}
      onRuntimeDiagnostic={onRuntimeDiagnostic}
    />
  );
}
