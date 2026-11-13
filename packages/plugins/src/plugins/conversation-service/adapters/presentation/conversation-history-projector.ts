import {
  projectLangChainHistory,
  type ConversationMessage,
} from "@za38.03/agent-ui-runtime";

import type { ConversationDetail } from "./contract.js";

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

/** Normalize persisted backend/model quirks before the official Runtime converter. */
export function projectConversationDetail(
  detail: ConversationDetail,
): ConversationMessage[] {
  switch (detail.history.format) {
    case "langchain":
      return projectLangChainHistory(detail.history.messages.map(normalizeHistoryMessage))
        .filter(message => message.role !== "assistant" || message.content.length > 0);
  }
}
