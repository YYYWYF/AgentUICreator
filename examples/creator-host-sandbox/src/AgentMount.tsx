import { useAgentUILocale, useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import { Agent } from "./agent-ui";
import { useEffect, useMemo, useState } from "react";
import { continuation, RUN_RESUME_API, type RunSnapshot } from "./RunResumeDemo";
import type { ConversationRunResumeProvider } from "./agent-ui/agent-ui/conversation/threads/conversation-service-thread-binding";

const resumeKey = "agent-ui-sandbox:durable-thread";
const createResumeProvider = (errorMessage: string): ConversationRunResumeProvider => async ({ threadId }) => {
  const response = await fetch(`${RUN_RESUME_API}/${encodeURIComponent(threadId)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(errorMessage);
  const run = await response.json() as RunSnapshot;
  if (!run.resumable && run.activity === undefined) return undefined;
  return { async *stream(signal) {
    if (run.activity !== undefined) yield { content: [{ type: "data", name: "agui-activity/agent-plan", data: run.activity }] };
    if (run.resumable) {
      try { yield* continuation(threadId, signal, run.scenarioId); }
      catch (error) { if (signal.aborted) throw error; throw new Error(errorMessage, { cause: error }); }
    }
  } };
};

export function AgentMount() {
  const locale = useAgentUILocaleCode();
  const attachmentMessages = useAgentUILocale("attachments");
  const demoAttachmentAdapter = useMemo(() => import.meta.env.DEV ? new DemoAttachmentAdapter(attachmentMessages) : undefined, [attachmentMessages]);
  const messages = useAgentUILocale("threadList");
  const resumeProvider = useMemo(() => createResumeProvider(messages.historyFailed), [messages.historyFailed]);
  const [restored, setRestored] = useState<{ initialThreadId?: string } | undefined>(import.meta.env.DEV ? undefined : {});
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    const remember = (event: Event) => {
      const id = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      if (id) { try { sessionStorage.setItem(resumeKey, id); } catch { /* Optional tab persistence. */ } }
    };
    window.addEventListener("agent-ui:preview-run-state", remember);
    let id: string | null = null;
    try { id = sessionStorage.getItem(resumeKey); } catch { /* Storage may be unavailable. */ }
    if (!id) setRestored({});
    else void fetch(`${RUN_RESUME_API}/${encodeURIComponent(id)}`).then(response => {
      if (active) setRestored(response.ok ? { initialThreadId: id! } : {});
    }).catch(() => { if (active) setRestored({}); });
    return () => { active = false; window.removeEventListener("agent-ui:preview-run-state", remember); };
  }, []);
  if (restored === undefined) return null;
  return <Agent locale={locale} attachmentAdapter={demoAttachmentAdapter} {...restored}
    runResumeProvider={import.meta.env.DEV ? resumeProvider : undefined} />;
}
