"use client";
import { useAuiState } from "@assistant-ui/react";
import { useAgentUILocale } from "../locale.js";
import { ThinkingIndicator } from "./adapters/assistant-ui/components/assistant-ui/elements/thinking-indicator.js";
import { thinkingPresentation, type ThinkingPresentationPolicy } from "./thinking-indicator-policy.js";
export function InternalConversationThinkingIndicator(policy: ThinkingPresentationPolicy) {
  const messages = useAgentUILocale("thinkingIndicator");
  const parts = useAuiState(s => s.message.parts);
  const status = useAuiState(s => s.message.status?.type);
  const tools = useAuiState(s => s.tools.toolUIs);
  const phase = thinkingPresentation(parts, status, policy, tools);
  if (!phase) return null;
  return <ThinkingIndicator role="status" aria-live="polite" label={messages[phase]}
    className="py-1 [&_span]:motion-reduce:animate-none [&_span]:motion-reduce:transition-none" />;
}
