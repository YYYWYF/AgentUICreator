import { useAgentUILocale } from "@agent-ui/react";
import { ConversationRuntimeProvider, useConversationRuntimeBridge,
  type ConversationAssistantRunUpdate, type ConversationLoadedThread, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

export const RUN_RESUME_API = "/__agent-ui/mock-data/run-resume/threads";
const STORAGE_KEY = "agent-ui-run-resume-demo-thread";

export interface RunSummary { id: string; title: string; runCount: number }
export interface RunSnapshot {
  threadId: string;
  runId: string;
  runCount: number;
  userText: string;
  assistantText: string;
  resumable: boolean;
  scenarioId?: "resumable-long-run" | "resumable-agent-plan";
  activity?: Record<string, unknown>;
}

export async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mock run request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function* continuation(
  id: string,
  signal: AbortSignal,
  scenarioId: RunSnapshot["scenarioId"] = "resumable-long-run",
): AsyncGenerator<ConversationAssistantRunUpdate, void, unknown> {
  const response = await fetch(`${RUN_RESUME_API}/${encodeURIComponent(id)}/stream`, { signal });
  if (!response.ok || response.body === null) throw new Error(`Resume stream failed: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let activity: Record<string, unknown> | undefined;
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
        if (data !== undefined) {
          const event = JSON.parse(data) as Record<string, unknown>;
          if (scenarioId !== "resumable-agent-plan") {
            if (typeof event.text === "string") {
              yield { content: [{ type: "text", text: event.text }] };
            }
          } else if (
            event.type === "ACTIVITY_SNAPSHOT" &&
            event.activityType === "agent-plan" &&
            typeof event.content === "object" &&
            event.content !== null &&
            !Array.isArray(event.content)
          ) {
            activity = event.content as Record<string, unknown>;
            yield {
              content: [{ type: "data", name: "agui-activity/agent-plan", data: activity }],
              status: { type: "running" },
            };
          } else if (event.type === "ACTIVITY_DELTA" && activity !== undefined) {
            if (Array.isArray(event.patch)) {
              for (const operation of event.patch) {
                if (
                  typeof operation === "object" && operation !== null &&
                  "op" in operation && operation.op === "replace" &&
                  "path" in operation && operation.path === "/activeIndex" &&
                  "value" in operation && Number.isInteger(operation.value) &&
                  typeof operation.value === "number"
                ) {
                  activity = { ...activity, activeIndex: operation.value };
                }
              }
            }
            yield {
              content: [{ type: "data", name: "agui-activity/agent-plan", data: activity }],
              status: { type: "running" },
            };
          } else if (event.type === "RUN_FINISHED") {
            yield { status: { type: "complete", reason: "stop" } };
            return;
          }
        }
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
      const snapshot = await readJson<RunSnapshot>(`${RUN_RESUME_API}/${encodeURIComponent(threadId)}`);
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
  const localeMessages = useAgentUILocale();
  const { agentRuntime } = useConversationRuntimeBridge();
  const snapshot = useSyncExternalStore(
    agentRuntime.subscribe.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime), agentRuntime.getSnapshot.bind(agentRuntime),
  );
  const [input, setInput] = useState(localeMessages.examples.runALongTask);
  const [runCount, setRunCount] = useState(0);
  useEffect(() => {
    const refresh = () => { void readJson<{ threads: RunSummary[] }>(RUN_RESUME_API)
      .then(value => setRunCount(value.threads.find(item => item.id === id)?.runCount ?? 0)).catch(() => undefined); };
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [id]);
  return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
    <h1>{localeMessages.examples.runResumeMock}</h1>
    <p>{localeMessages.examples.sendALongTaskAndRefreshAfter}</p>
    <p data-testid="run-count">{localeMessages.examples.agentInvocationCount} {runCount}</p>
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
      <input aria-label={localeMessages.examples.task} value={input} onChange={event => setInput(event.target.value)} />
      <button type="submit" disabled={snapshot.run.status === "running"}>{localeMessages.examples.send}</button>
      <button type="button" onClick={() => agentRuntime.abort()}>{localeMessages.examples.stop}</button>
    </form>
  </main>;
}

export function RunResumeDemo() {
  const localeMessages = useAgentUILocale();
  const [boot, setBoot] = useState<{ id: string; summaries: RunSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readJson<{ threads: RunSummary[] }>(RUN_RESUME_API).then(({ threads }) => {
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
  if (boot === null || binding === null) return <p>{localeMessages.examples.loading}</p>;
  return <ConversationRuntimeProvider endpoint="/agent?scenario=resumable-long-run" threadBinding={binding}>
    <DemoConversation id={boot.id} />
  </ConversationRuntimeProvider>;
}
