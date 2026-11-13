import { useAgentUIProject } from "../project-context.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentUI } from "@za38.03/agent-ui-runtime";
import type { ResolvedAgentUICompatibilityConfig, AgentUIEmit } from "./compatibility-config.js";
import { createRuntimeCompositionStore } from "../runtime/composition/index.js";
import type { AppAgentState } from "../agent-contract/agent-state.js";
import { AgentApplication, type AgentProps } from "./Agent.js";
import { AgentUIApplication } from "./AgentUIApplication.js";
import { AgentUIProvider, useAgentUIAgents, useAgentUIAgentIdentity, type AgentUIAgents } from "../../host/AgentUIAgentsProvider.js";

type Props = {
  config: ResolvedAgentUICompatibilityConfig;
  emit: AgentUIEmit;
  onAgents?: ((agents: AgentUIAgents | null) => void) | undefined;
  /** React producer options use the same Agent API as native embedding. */
  agentProps?: Omit<AgentProps, "endpoint" | "locale" | "theme" | "initialThreadId" | "onThemeChange" | "onError">;
};

/** Web Component translates its Host properties to the canonical Agent entry. */
export function AgentUICompatibilityRoot(props: Props) {
  if (props.config.agents) return <MultiBridge {...props} />;
  return <BridgeSession key={JSON.stringify([props.config.endpoint, props.config.threadId])} {...props} />;
}

function MultiBridge(props: Props) {
  return <AgentUIProvider>
    <MultiBridgeContent {...props} />
  </AgentUIProvider>;
}
function MultiBridgeContent({ config, emit, agentProps, onAgents }: Props) {
  const project = useAgentUIProject();
  const agents = useAgentUIAgents();
  useEffect(() => { onAgents?.(agents); return () => onAgents?.(null); }, [agents, onAgents]);
  return <>{config.agents!.map(instance => <AgentUIApplication key={instance.agentId}
    {...agentProps} agentId={instance.agentId}
    project={instance.appUIModel ? { ...project, appUIModelSource: JSON.stringify(instance.appUIModel) } : project}
    endpoint={instance.endpoint} initialThreadId={instance.threadId} request={instance.request}
    locale={config.locale} theme={config.theme} hidden={instance.hidden}
    onThemeChange={theme => emit("theme-change", { theme, agentId: instance.agentId })}
    onError={error => emit("agent-error", { code: "AGENT_UI_RUNTIME_ERROR", error, agentId: instance.agentId })}>
    <BridgeEvents emit={emit} />
  </AgentUIApplication>)}</>;
}

function BridgeSession({ config, emit, agentProps }: Props) {
  const base = useAgentUIProject();
  const [compositionStore] = useState(() => createRuntimeCompositionStore<AppAgentState>());
  const project = useMemo(() => ({ ...base, compositionStore,
    appUIModelSource: config.appUIModel === undefined ? base.appUIModelSource : JSON.stringify(config.appUIModel),
  }), [base, compositionStore, config.appUIModel]);
  const onThemeChange = useCallback((theme: NonNullable<AgentProps["theme"]>) => emit("theme-change", { theme }), [emit]);
  const onError = useCallback((error: Error) => emit("agent-error", {
    code: compositionStore.getCandidateDiagnostic()?.status === "error" ? "AGENT_UI_CONFIG_ERROR" : "AGENT_UI_RUNTIME_ERROR", error,
  }), [emit, compositionStore]);
  return <AgentUIProvider>
    <BridgeEvents emit={emit} />
    <AgentApplication project={project} {...agentProps} endpoint={config.endpoint}
      locale={config.locale} theme={config.theme} initialThreadId={config.threadId}
      onThemeChange={onThemeChange} onError={onError} />
  </AgentUIProvider>;
}

function BridgeEvents({ emit }: Pick<Props, "emit">) {
  const host = useAgentUI();
  const instance = useAgentUIAgentIdentity();
  const ready = useRef(false);
  const lastThread = useRef<string | undefined>(undefined);
  useEffect(() => {
    const report = () => {
      const snapshot = host.getSnapshot();
      const threadId = snapshot.runtime?.conversation.id;
      if (snapshot.status !== "ready" || threadId === undefined) return;
      const identity = instance ? { agentId: instance.agentId } : {};
      if (!ready.current) { ready.current = true; emit("agent-ready", { threadId, ...identity }); }
      if (lastThread.current !== threadId) {
        lastThread.current = threadId;
        emit("thread-change", { threadId, ...identity });
      }
    };
    report();
    return host.subscribe(report);
  }, [host, emit, instance]);
  return null;
}
