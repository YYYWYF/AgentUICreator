"use client";
import { useEffect, useRef, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useAgentUILocale, formatPresentationMessage } from "../locale.js";
import { ThinkingIndicator } from "./vendor/assistant-ui/components/assistant-ui/elements/thinking-indicator.js";
import { thinkingPresentation, type ThinkingPresentationPolicy } from "./thinking-indicator-policy.js";
export function InternalConversationThinkingIndicator(policy: ThinkingPresentationPolicy) {
  const messages = useAgentUILocale("thinkingIndicator");
  const parts = useAuiState(s => s.message.parts);
  const status = useAuiState(s => s.message.status?.type);
  const messageId = useAuiState(s => s.message.id);
  const threadId = useAuiState(s => s.threads.mainThreadId);
  const tools = useAuiState(s => s.tools.toolUIs);
  const phase = thinkingPresentation(parts, status, policy, tools);
  const active = status === "running";
  const start = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    start.current = active ? Date.now() : null;
    setSeconds(0);
    if (!active) return;
    // Page-local observation duration, never a historical/server duration.
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start.current!) / 1000)), 1000);
    return () => { clearInterval(timer); start.current = null; };
  }, [active, messageId, threadId]);
  if (!phase) return null;
  return <ThinkingIndicator role="status" aria-live="polite" label={messages[phase]}
    {...(seconds > 0 ? { elapsed: formatPresentationMessage(messages.elapsed, { seconds }) } : {})}
    className="py-1 [&_span]:motion-reduce:animate-none [&_span]:motion-reduce:transition-none" />;
}
