import { ConversationRuntimeProvider, useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  useConversationServiceThreadBinding,
  type ConversationRunResumeProvider,
} from "./agent-ui/agent-ui/conversation/threads/conversation-service-thread-binding";
import type {
  ConversationDetail, ConversationService, ConversationSnapshot,
} from "./agent-ui/services/conversations";
import { continuation, readJson, RUN_RESUME_API, type RunSnapshot, type RunSummary } from "./RunResumeDemo";

const STORAGE_KEY = "agent-ui-production-resume-thread";

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

function ProductionThread({ summaries, initialThreadId }: {
  summaries: RunSummary[]; initialThreadId?: string;
}) {
  const service = useMemo(() => conversationService(summaries), [summaries]);
  const provider = useMemo<ConversationRunResumeProvider>(() => async ({ threadId }) => {
    const run = await readJson<RunSnapshot>(`${RUN_RESUME_API}/${encodeURIComponent(threadId)}`);
    return run.resumable ? { stream: signal => continuation(threadId, signal) } : undefined;
  }, []);
  const binding = useConversationServiceThreadBinding(provider, initialThreadId);
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, binding.getThreadId());
    return binding.attachConversationService(service);
  }, [binding, service]);
  return <ConversationRuntimeProvider endpoint="/agent?scenario=resumable-long-run" threadBinding={binding}>
    <ProductionConversation threadId={binding.getThreadId()} />
  </ConversationRuntimeProvider>;
}

function ProductionConversation({ threadId }: { threadId: string }) {
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
    <h1>Production binding refresh recovery</h1>
    <p data-testid="production-thread-id">{snapshot.conversation.id}</p>
    <p data-testid="production-run-count">Agent invocation count: {runCount}</p>
    <p data-testid="production-run-status">{snapshot.run.status}</p>
    <div data-testid="production-conversation-messages">{snapshot.messages.map(message =>
      message.role === "user" || message.role === "assistant" ?
        <p key={message.id} data-role={message.role}>
          {typeof message.content === "string" ? message.content : message.content?.map(part => part.text ?? "").join("")}
        </p> : null,
    )}</div>
    <button type="button" disabled={snapshot.run.status === "running"}
      onClick={() => void agentRuntime.sendMessage("执行一个长任务")}>发送</button>
  </main>;
}

export function RunResumeProductionDemo() {
  const [boot, setBoot] = useState<{ summaries: RunSummary[]; initialThreadId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readJson<{ threads: RunSummary[] }>(RUN_RESUME_API).then(({ threads }) => {
      if (cancelled) return;
      const saved = sessionStorage.getItem(STORAGE_KEY);
      setBoot({ summaries: threads, ...(saved === null ? {} : { initialThreadId: saved }) });
    }).catch(value => { if (!cancelled) setError(String(value)); });
    return () => { cancelled = true; };
  }, []);
  if (error !== null) return <p role="alert">{error}</p>;
  return boot === null ? <p>加载中……</p> : <ProductionThread {...boot} />;
}
