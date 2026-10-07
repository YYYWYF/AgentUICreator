import { useAgentUILocale } from "@agent-ui/react";
import { ConversationRuntimeProvider, useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import {
  AgentPlan,
  ConversationThread,
  DataMessageUIRegistration,
  defineDataMessageUI,
  type ConversationAgentPlanProps,
} from "@agent-ui/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  useConversationServiceThreadBinding,
  type ConversationRunResumeProvider,
} from "./agent-ui/agent-ui/conversation/threads/conversation-service-thread-binding";
import type {
  ConversationDetail, ConversationService, ConversationSnapshot,
} from "./agent-ui/services/conversations";
import { continuation, readJson, RUN_RESUME_API, type RunSnapshot, type RunSummary } from "./RunResumeDemo";

const agentPlanResumeDemoMessageUI = defineDataMessageUI<ConversationAgentPlanProps>({
  name: "agui-activity/agent-plan",
  render: ({ data }) => <div data-agent-ui-composition-part="plan"><AgentPlan {...data} /></div>,
});

const STORAGE_KEY = "agent-ui-production-resume-thread";
export type ProductionResumeScenario = "resumable-long-run" | "resumable-agent-plan";

function conversationService(summaries: RunSummary[]): ConversationService {
  const snapshot: ConversationSnapshot = {
    mode: "history", listStatus: "ready", detailStatus: "idle",
    conversations: summaries.map(item => ({ id: item.id, title: item.title })),
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    refresh: async () => {},
    deleteConversation: async () => {},
    async selectConversation(id) { return this.loadConversation(id); },
    async loadConversation(id): Promise<ConversationDetail> {
      const run = await readJson<RunSnapshot>(`${RUN_RESUME_API}/${encodeURIComponent(id)}`);
      return {
        id, title: "Durable run",
        history: { format: "langchain", messages: [
          { id: `${run.runId}-user`, type: "human", content: run.userText },
          { id: `${run.runId}-partial`, type: "ai", content: run.assistantText },
        ] },
      };
    },
    showConversation: () => {}, showLiveConversation: () => {}, resetForNewConversation: () => {},
  };
}

function ProductionThread({ summaries, initialThreadId, scenarioId }: {
  summaries: RunSummary[]; initialThreadId?: string;
  scenarioId: ProductionResumeScenario;
}) {
  const service = useMemo(() => conversationService(summaries), [summaries]);
  const provider = useMemo<ConversationRunResumeProvider>(() => async ({ threadId }) => {
    const run = await readJson<RunSnapshot>(`${RUN_RESUME_API}/${encodeURIComponent(threadId)}`);
    return run.resumable
      ? { stream: signal => continuation(threadId, signal, run.scenarioId ?? scenarioId) }
      : undefined;
  }, [scenarioId]);
  const binding = useConversationServiceThreadBinding(provider, initialThreadId);
  const storageKey = `${STORAGE_KEY}:${scenarioId}`;
  useEffect(() => {
    sessionStorage.setItem(storageKey, binding.getThreadId());
    return binding.attachConversationService(service);
  }, [binding, service, storageKey]);
  return <ConversationRuntimeProvider endpoint={`/agent?scenario=${scenarioId}`} threadBinding={binding}>
    {scenarioId === "resumable-agent-plan"
      ? <DataMessageUIRegistration definition={agentPlanResumeDemoMessageUI} />
      : null}
    <ProductionConversation threadId={binding.getThreadId()} scenarioId={scenarioId} />
  </ConversationRuntimeProvider>;
}

function ProductionConversation({ threadId, scenarioId }: {
  threadId: string;
  scenarioId: ProductionResumeScenario;
}) {
  const localeMessages = useAgentUILocale();
  const { agentRuntime } = useConversationRuntimeBridge();
  const snapshot = useSyncExternalStore(
    agentRuntime.subscribe.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime),
  );
  const [runCount, setRunCount] = useState(0);
  useEffect(() => {
    const refresh = () => { void readJson<{ threads: RunSummary[] }>(RUN_RESUME_API)
      .then(value => setRunCount(value.threads.find(item => item.id === threadId)?.runCount ?? 0)).catch(() => undefined); };
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [threadId]);
  return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
    <h1>{scenarioId === "resumable-agent-plan" ? localeMessages.examples.agentPlanActivityRefreshRecovery : localeMessages.examples.productionBindingRefreshRecovery}</h1>
    <p data-testid="production-thread-id">{snapshot.conversation.id}</p>
    <p data-testid="production-run-count">{localeMessages.examples.agentInvocationCount} {runCount}</p>
    <p data-testid="production-run-status">{snapshot.run.status}</p>
    <div data-testid="production-conversation-messages" style={{ height: 380 }}>
      <ConversationThread autoFocus={false} composer={null} />
    </div>
    <button type="button" disabled={snapshot.run.status === "running"}
      onClick={() => void agentRuntime.sendMessage(localeMessages.examples.runALongTask)}>{localeMessages.examples.send}</button>
  </main>;
}

export function RunResumeProductionDemo({ scenarioId = "resumable-long-run" }: {
  scenarioId?: ProductionResumeScenario;
}) {
  const localeMessages = useAgentUILocale();
  const storageKey = `${STORAGE_KEY}:${scenarioId}`;
  const [boot, setBoot] = useState<{ summaries: RunSummary[]; initialThreadId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readJson<{ threads: RunSummary[] }>(RUN_RESUME_API).then(({ threads }) => {
      if (cancelled) return;
      const saved = sessionStorage.getItem(storageKey);
      setBoot({ summaries: threads, ...(saved === null ? {} : { initialThreadId: saved }) });
    }).catch(value => { if (!cancelled) setError(String(value)); });
    return () => { cancelled = true; };
  }, [storageKey]);
  if (error !== null) return <p role="alert">{error}</p>;
  return boot === null ? <p>{localeMessages.examples.loading}</p> : <ProductionThread {...boot} scenarioId={scenarioId} />;
}
