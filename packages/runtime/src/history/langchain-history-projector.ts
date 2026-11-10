import { unstable_convertExternalMessages as convertExternalMessages } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";

import type { ConversationMessage } from "../threads/types.js";

/** Legacy models persisted a leading think block inside the assistant text. */
function normalizeHistoryMessage(message: unknown): unknown {
  if (
    typeof message !== "object" || message === null ||
    !("type" in message) || message.type !== "ai" ||
    !("content" in message) || typeof message.content !== "string"
  ) return message;

  const content = message.content.trimStart();
  // Only interpret the model's leading envelope. Tags in user messages, code
  // examples, ordinary prose and already structured content are literal data.
  if (!content.startsWith("<think>")) return message;

  const end = content.indexOf("</think>", "<think>".length);
  const reasoning = content.slice("<think>".length, end < 0 ? undefined : end).trim();
  const text = end < 0 ? "" : content.slice(end + "</think>".length).trimStart();
  return {
    ...message,
    content: [
      ...(reasoning ? [{ type: "reasoning", reasoning }] : []),
      ...(text ? [{ type: "text", text }] : []),
    ],
  };
}

/**
 * The AgentUICreator boundary for the official persisted LangChain converter.
 *
 * LangGraph Runtime ownership stays with useAgUiRuntime. react-langgraph is
 * used here only for the official persisted LangChain message conversion.
 */
export function projectLangChainHistory(
  messages: readonly unknown[],
): ConversationMessage[] {
  const converted = convertExternalMessages(
    messages.map(normalizeHistoryMessage) as LangChainMessage[],
    convertLangChainMessages,
    false,
    {},
  ) as ConversationMessage[];
  // Keep tool-only and reasoning-only messages. Empty assistant envelopes have
  // no presentation, and must not produce a bubble or a response footer.
  return converted.filter(message => message.role !== "assistant" || message.content.length > 0);
}
