"use client";
import type { ComponentProps } from "react";
import { useAuiState, useAgentUILocale, ThinkingIndicator } from "../../../../plugin-support.js";
import { thinkingPresentation, type ThinkingPresentationPolicy } from "./policy.js";
export interface ConversationThinkingIndicatorProps extends ThinkingPresentationPolicy, Partial<ComponentProps<typeof ThinkingIndicator>> {}
export function InternalConversationThinkingIndicator({reasoningVisible, timelineVisible, className, ...indicatorProps}: ConversationThinkingIndicatorProps) {
  const messages = useAgentUILocale("thinkingIndicator");
  const parts = useAuiState(s => s.message.parts);
  const status = useAuiState(s => s.message.status?.type);
  const tools = useAuiState(s => s.tools.toolUIs);
  const phase = thinkingPresentation(parts, status, { reasoningVisible, timelineVisible }, tools);
  if (!phase) return null;
  return <ThinkingIndicator role="status" aria-live="polite" label={messages[phase]}
    {...indicatorProps} className={["py-1 [&_span]:motion-reduce:animate-none [&_span]:motion-reduce:transition-none", className].filter(Boolean).join(" ")} />;
}

export {InternalConversationThinkingIndicator as ConversationThinkingIndicator};
