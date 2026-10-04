import { ConversationRuntimeProvider, useConversationRuntimeBridge,
  type ConversationAssistantRunUpdate, type ConversationLoadedThread, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const API = "/__agent-ui/mock-data/run-resume/threads";
const STORAGE_KEY = "agent-ui-run-resume-demo-thread";

interface RunSummary { id: string; title: string; runCount: number }
interface RunSnapshot {
  threadId: string;
  runId: string;
  runCount: number;
  userText: string;
  assistantText: string;
  resumable: boolean;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mock run request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function* continuation(id: string, signal: AbortSignal): AsyncGenerator<ConversationAssistantRunUpdate, void, unknown> {
  const response = await fetch(`${API}/${encodeURIComponent(id)}/stream`, { signal });
  if (!response.ok || response.body === null) throw new Error(`Resume stream failed: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").find(line => line.startsWith("data: "))?.slice(6);
        if (data !== undefined) yield { content: [{ type: "text", text: (JSON.parse(data) as { text: string }).text }] };
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally { await reader.cancel().catch(() => undefined); }
}

function createBinding(id: string, summaries: RunSummary[]): ConversationThreadBinding {
  const persisted = new Set(summaries.map(item => item.id));
  return {
    getThreadId: () => id,
    subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    initializeThread: async threadId => threadId,
    getThreadListSnapshot: () => ({
      threads: summaries.map(item => ({ id: item.id, status: "regular" as const, title: item.title })),
      archivedThreads: [],
    }),
    async loadThread(threadId): Promise<ConversationLoadedThread> {
      if (!persisted.has(threadId)) return { messages: [] };
      const snapshot = await readJson<RunSnapshot>(`${API}/${encodeURIComponent(threadId)}`);
      const createdAt = new Date(0);
      return {
        messages: [
          { id: `${snapshot.runId}-user`, role: "user", content: [{ type: "text", text: snapshot.userText }],
            attachments: [], createdAt, metadata: { custom: {} } },
          { id: `${snapshot.runId}-partial`, role: "assistant", content: [{ type: "text", text: snapshot.assistantText }],
            status: snapshot.resumable ? { type: "incomplete", reason: "other" } : { type: "complete", reason: "stop" },
            createdAt, metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } },
        ],
        ...(snapshot.resumable ? { resume: { stream: (signal: AbortSignal) => continuation(threadId, signal) } } : {}),
      };
    },
  };
}

function DemoConversation({ id }: { id: string }) {
  const { agentRuntime } = useConversationRuntimeBridge();
  const snapshot = useSyncExternalStore(
    agentRuntime.subscribe.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime),
  );
  const [input, setInput] = useState("执行一个长任务");
  const [runCount, setRunCount] = useState(0);
  useEffect(() => {
    const refresh = () => { void readJson<{ threads: RunSummary[] }>(API)
      .then(value => setRunCount(value.threads.find(item => item.id === id)?.runCount ?? 0)).catch(() => undefined); };
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [id]);
  return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
    <h1>Run Resume Mock</h1>
    <p>发送长任务，看到第一段后刷新页面。Mock server 会继续执行同一个 Run。</p>
    <p data-testid="run-count">Agent invocation count: {runCount}</p>
    <p data-testid="run-status">{snapshot.run.status}</p>
    <div data-testid="conversation-messages">
      {snapshot.messages.map(message => {
        if (message.role !== "user" && message.role !== "assistant") return null;
        const content = message.content;
        return <p key={message.id} data-role={message.role}>
          {typeof content === "string" ? content : content?.map(part => part.text ?? "").join("")}
        </p>;
      })}
    </div>
    <form onSubmit={event => { event.preventDefault(); void agentRuntime.sendMessage(input); }}>
      <input aria-label="任务" value={input} onChange={event => setInput(event.target.value)} />
      <button type="submit" disabled={snapshot.run.status === "running"}>发送</button>
      <button type="button" onClick={() => agentRuntime.abort()}>Stop</button>
    </form>
  </main>;
}

export function RunResumeDemo() {
  const [boot, setBoot] = useState<{ id: string; summaries: RunSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readJson<{ threads: RunSummary[] }>(API).then(({ threads }) => {
      if (cancelled) return;
      const stored = sessionStorage.getItem(STORAGE_KEY);
      const id = stored ?? crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, id);
      setBoot({ id, summaries: threads });
    }).catch(value => { if (!cancelled) setError(String(value)); });
    return () => { cancelled = true; };
  }, []);
  const binding = useMemo(() => boot === null ? null : createBinding(boot.id, boot.summaries), [boot]);
  if (error !== null) return <p role="alert">{error}</p>;
  if (boot === null || binding === null) return <p>加载中……</p>;
  return <ConversationRuntimeProvider endpoint="/agent?scenario=resumable-long-run" threadBinding={binding}>
    <DemoConversation id={boot.id} />
  </ConversationRuntimeProvider>;
}
