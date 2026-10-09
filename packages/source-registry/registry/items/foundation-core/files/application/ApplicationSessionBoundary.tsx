import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { AgentRuntime } from "@agent-ui/runtime-core";
import { AgentUIRoot, AgentUILocaleProvider } from "@agent-ui/react";
import { PluginServiceProvider, usePluginServiceRuntime } from "../runtime/plugins";
import { useApplicationLifecycleRuntime } from "../runtime/application/ApplicationLifecycleContext";
import { ApplicationGateSurface } from "../runtime/application/ApplicationGateSurface";
import { AppEventRegistry } from "../runtime/events";
import { appEventSchemas } from "../agent-contract/agent-events";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";
import type { AppAgentState } from "../agent-contract/agent-state";
import type { AppFrontendToolRuntime } from "../runtime/tools";
import type { UIPluginRuntimeActions } from "../runtime/plugins/PluginServiceRuntime";
import { AGENT_UI_LOCALES } from "../agent-ui/i18n/locale-registry";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types";
import { agentUILocaleConfig } from "../agent-ui/i18n/locale-config";
import { AgentUILocaleBridge } from "../agent-ui/i18n/AgentUILocaleBridge";
import { PluginDiagnosticProvider, type RuntimeDiagnostic, type RuntimeCompositionSnapshot as ObservedComposition } from "../runtime/diagnostics";
import { publishAgentUIObservation, type AgentObservability } from "./observability";
import { useAgentUITheme } from "../agent-ui/theme/useAgentUITheme";

type Connection = { attach(runtime: AgentRuntime<AppAgentState>): () => void; revoke(): void; actions: UIPluginRuntimeActions };
const SessionEpochContext = createContext(0);
export function useApplicationSessionEpoch() { return useContext(SessionEpochContext); }
const ConnectionContext = createContext<Connection | null>(null);

/** Bind canonical conversation only while the existing Application Gate is ready. */
export function useApplicationSessionConnection(runtime: AgentRuntime<AppAgentState>) {
  const connection = useContext(ConnectionContext);
  useLayoutEffect(() => connection?.attach(runtime), [connection, runtime]);
  return connection !== null;
}

export function ApplicationSessionBoundary({ composition, frontendTools, locale = agentUILocaleConfig.defaultLocale, observability, children }: {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  frontendTools: AppFrontendToolRuntime;
  locale?: AgentUILocaleCode | undefined;
  observability?: AgentObservability | undefined;
  children: ReactNode;
}) {
  const current = useRef<AgentRuntime<AppAgentState> | null>(null);
  const connection = useMemo<Connection>(() => {
    const required = () => { if (!current.current) throw new Error("APPLICATION_SESSION_NOT_READY"); return current.current; };
    return {
      attach(runtime) { current.current = runtime; return () => { if (current.current === runtime) current.current = null; }; },
      revoke() { const previous = current.current; current.current = null; previous?.abort(); previous?.dispose(); },
      actions: {
        sendMessage: input => required().sendMessage(input),
        resumeInterrupts: responses => required().resumeInterrupts(responses),
        startNewConversation: () => required().startNewConversation(),
        abortRun: () => current.current?.abort(),
      },
    };
  }, []);
  useLayoutEffect(() => () => connection.revoke(), [connection]);
  const eventRegistry = useMemo(() => new AppEventRegistry(appEventSchemas), []);
  const onRuntimeDiagnostic = useMemo(() => (diagnostic: RuntimeDiagnostic) => {
    observability?.onRuntimeDiagnostic?.(diagnostic);
    publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic });
  }, [observability]);
  const onRuntimeComposition = useMemo(() => (snapshot: ObservedComposition) => {
    observability?.onRuntimeComposition?.(snapshot);
    publishAgentUIObservation({ type: "runtime-composition", composition: snapshot });
  }, [observability]);
  const hasGate = Object.values(composition.runtimeModel.pluginInstances).some(instance =>
    instance.enabled && composition.activeRegistry.get(instance.pluginId)?.manifest.application?.gate !== undefined);
  // Ungated Hosts retain their original provider lifetime and refresh behavior.
  if (!hasGate) return children;
  const content = <AgentUILocaleProvider locale={locale} messages={AGENT_UI_LOCALES[locale]}>
    <PluginServiceProvider model={composition.runtimeModel} registry={composition.activeRegistry} actions={connection.actions} frontendTools={frontendTools} applicationEventRegistry={eventRegistry}>
      <ConnectionContext.Provider value={connection}>
        <SessionGate composition={composition} connection={connection} locale={locale}>{children}</SessionGate>
      </ConnectionContext.Provider>
    </PluginServiceProvider>
  </AgentUILocaleProvider>;
  if (!import.meta.env.DEV && observability === undefined) return content;
  return <PluginDiagnosticProvider model={composition.runtimeModel} registry={composition.activeRegistry}
    appUIModelHash={composition.appUIModelHash} compositionRevision={composition.revision}
    capabilityCatalogRevision={composition.capabilityCatalogRevision} publishedAt={composition.publishedAt}
    onRuntimeDiagnostic={onRuntimeDiagnostic}
    onRuntimeComposition={onRuntimeComposition}>
    {content}
  </PluginDiagnosticProvider>;
}

function SessionGate({ composition, connection, locale, children }: { composition: RuntimeCompositionSnapshot<AppAgentState>; connection: Connection; locale: AgentUILocaleCode; children: ReactNode }) {
  const lifecycle = useApplicationLifecycleRuntime();
  const services = usePluginServiceRuntime();
  const theme = useAgentUITheme();
  const projection = useMemo(() => {
    let previous = lifecycle.getSnapshot();
    let epoch = 0;
    let value = { phase: previous.phase, epoch };
    const update = () => {
      const next = lifecycle.getSnapshot();
      if (next === previous) return;
      if (next.phase !== "ready") {
        connection.revoke();
        if (previous.phase === "ready") epoch++;
      }
      previous = next;
      value = { phase: next.phase, epoch };
    };
    return { getSnapshot: () => { update(); return value; }, subscribe(listener: () => void) { return lifecycle.subscribe(() => { update(); listener(); }); } };
  }, [lifecycle, connection]);
  const state = useSyncExternalStore(projection.subscribe, projection.getSnapshot, projection.getSnapshot);
  // Every revoked ready epoch gets fresh conversation state, bindings, run and
  // caches. The Foundation service owner stays mounted throughout transitions.
  if (state.phase === "ready") return <SessionEpochContext.Provider key={state.epoch} value={state.epoch}>{children}</SessionEpochContext.Provider>;
  return <AgentUILocaleBridge locale={locale}><AgentUIRoot theme={theme}>
    <ApplicationGateSurface model={composition.runtimeModel} registry={composition.activeRegistry} actions={connection.actions}
      onPluginError={failure => services.applicationLifecycle.update({ ...services.applicationLifecycle.getSnapshot(), phase: "error", failure: { instanceId: failure.instanceId, pluginId: failure.pluginId, message: "APPLICATION_GATE_RENDER_FAILED" } })}
      onPluginReset={() => {}} />
  </AgentUIRoot></AgentUILocaleBridge>;
}
