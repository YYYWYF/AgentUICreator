import { useAgentUIAgentIdentity } from "../../host/AgentUIAgentsProvider.js";
import { useAgentUIProject } from "../project-context.js";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { AgentRuntime } from "@za38.03/agent-ui-core";
import { AgentUILocaleProvider } from "../../locale.js";
import { type AgentUITheme } from "../../presentation.js";
import { PluginServiceProvider, usePluginServiceRuntime } from "../runtime/plugins/index.js";
import { useApplicationLifecycleRuntime } from "../runtime/application/ApplicationLifecycleContext.js";
import { ApplicationGateSurface } from "../runtime/application/ApplicationGateSurface.js";
import { AppEventRegistry } from "../runtime/events/index.js";
import type { RuntimeCompositionSnapshot } from "../runtime/composition/index.js";
import type { AppAgentState } from "../agent-contract/agent-state.js";
import type { AppFrontendToolRuntime } from "../runtime/tools/index.js";
import type { UIPluginRuntimeActions } from "../runtime/plugins/PluginServiceRuntime.js";
import type { AgentUILocaleCode } from "../agent-ui/i18n/locale-types.js";
import { AgentUILocaleBridge } from "../agent-ui/i18n/AgentUILocaleBridge.js";
import { PluginDiagnosticProvider, type RuntimeDiagnostic, type RuntimeCompositionSnapshot as ObservedComposition } from "../runtime/diagnostics/index.js";
import { publishAgentUIObservation, type AgentObservability } from "./observability.js";
import { AgentUIThemeBridge } from "../agent-ui/theme/AgentUIThemeBridge.js";

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

export function ApplicationSessionBoundary({ composition, frontendTools, locale: requestedLocale, theme, onThemeChange, observability, children, renderGate }: {
  composition: RuntimeCompositionSnapshot<AppAgentState>;
  frontendTools: AppFrontendToolRuntime;
  locale?: AgentUILocaleCode | undefined;
  theme?: AgentUITheme | undefined;
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  observability?: AgentObservability | undefined;
  children: ReactNode;
  renderGate?: ((content: ReactNode, phase: string) => ReactNode) | undefined;
}) {
  const application = useAgentUIAgentIdentity();
  const { locales: AGENT_UI_LOCALES, appEventSchemas, defaultLocale, development, serviceOverrides } = useAgentUIProject();
  const locale = requestedLocale ?? defaultLocale;
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
  const eventRegistry = useMemo(() => new AppEventRegistry(appEventSchemas), [appEventSchemas]);
  const onRuntimeDiagnostic = useMemo(() => (diagnostic: RuntimeDiagnostic) => {
    observability?.onRuntimeDiagnostic?.(diagnostic);
    publishAgentUIObservation({ type: "runtime-diagnostic", diagnostic }, development, application);
  }, [observability, development, application]);
  const onRuntimeComposition = useMemo(() => (snapshot: ObservedComposition) => {
    observability?.onRuntimeComposition?.(snapshot);
    publishAgentUIObservation({ type: "runtime-composition", composition: snapshot }, development, application);
  }, [observability, development, application]);
  const content = <AgentUILocaleProvider locale={locale} messages={AGENT_UI_LOCALES[locale]}>
    <PluginServiceProvider model={composition.runtimeModel} registry={composition.activeRegistry} actions={connection.actions} frontendTools={frontendTools} applicationEventRegistry={eventRegistry} serviceOverrides={serviceOverrides}>
      <ConnectionContext.Provider value={connection}>
        <AgentUILocaleBridge locale={locale}>
        <SessionGate composition={composition} connection={connection} locale={locale} theme={theme} onThemeChange={onThemeChange} renderGate={renderGate}>{children}</SessionGate>
      </AgentUILocaleBridge>
      </ConnectionContext.Provider>
    </PluginServiceProvider>
  </AgentUILocaleProvider>;
  if (!development && observability === undefined) return content;
  return <PluginDiagnosticProvider model={composition.runtimeModel} registry={composition.activeRegistry}
    appUIModelHash={composition.appUIModelHash} compositionRevision={composition.revision}
    capabilityCatalogRevision={composition.capabilityCatalogRevision} publishedAt={composition.publishedAt}
    onRuntimeDiagnostic={onRuntimeDiagnostic}
    onRuntimeComposition={onRuntimeComposition}>
    {content}
  </PluginDiagnosticProvider>;
}

function SessionGate({ composition, connection, locale, theme, onThemeChange, children, renderGate }: { composition: RuntimeCompositionSnapshot<AppAgentState>; connection: Connection; locale: AgentUILocaleCode; theme?: AgentUITheme | undefined; onThemeChange?: ((theme: AgentUITheme) => void) | undefined; children: ReactNode; renderGate?: ((content: ReactNode, phase: string) => ReactNode) | undefined }) {
  const lifecycle = useApplicationLifecycleRuntime();
  const services = usePluginServiceRuntime();
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
  const gate = <AgentUILocaleBridge locale={locale}><AgentUIThemeBridge theme={theme} onThemeChange={onThemeChange}>
    <ApplicationGateSurface model={composition.runtimeModel} registry={composition.activeRegistry} actions={connection.actions}
      onPluginError={failure => services.applicationLifecycle.update({ ...services.applicationLifecycle.getSnapshot(), phase: "error", failure: { instanceId: failure.instanceId, pluginId: failure.pluginId, message: "APPLICATION_GATE_RENDER_FAILED" } })}
      onPluginReset={() => {}} />
  </AgentUIThemeBridge></AgentUILocaleBridge>;
  return renderGate ? renderGate(gate, state.phase) : gate;
}
