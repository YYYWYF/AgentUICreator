import { useAgentUIProject } from "../project-context.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentUIProvider, useAgentUI } from "@za38.03/agent-ui-runtime";
import type { ResolvedAgentUICompatibilityConfig, AgentUIEmit } from "./compatibility-config.js";
import { createRuntimeCompositionStore } from "../runtime/composition/index.js";
import type { AppAgentState } from "../agent-contract/agent-state.js";
import { AgentApplication, type AgentProps } from "./Agent.js";

type Props = {
  config: ResolvedAgentUICompatibilityConfig;
  emit: AgentUIEmit;
  /** React producer options use the same Agent API as native embedding. */
  agentProps?: Omit<AgentProps, "endpoint" | "locale" | "theme" | "initialThreadId" | "onThemeChange" | "onError">;
};

/** Web Component translates its Host properties to the canonical Agent entry. */
export function AgentUICompatibilityRoot(props: Props) {
  return <BridgeSession key={JSON.stringify([props.config.endpoint, props.config.threadId])} {...props} />;
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
  const ready = useRef(false);
  const lastThread = useRef<string | undefined>(undefined);
  useEffect(() => {
    const report = () => {
      const snapshot = host.getSnapshot();
      const threadId = snapshot.runtime?.conversation.id;
      if (snapshot.status !== "ready" || threadId === undefined) return;
      if (!ready.current) { ready.current = true; emit("agent-ready", { threadId }); }
      if (lastThread.current !== threadId) {
        lastThread.current = threadId;
        emit("thread-change", { threadId });
      }
    };
    report();
    return host.subscribe(report);
  }, [host, emit]);
  return null;
}
