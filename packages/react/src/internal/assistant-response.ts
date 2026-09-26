import { projectConversationTurns, type ConversationTurnProjection } from "./conversation-turn.js";
import type { ThreadMessage } from "@assistant-ui/react";

/** Product grouping policy, independent of protocol runs and live-stream metadata. */
export interface AssistantResponseGroup {
  headMessageId: string;
  tailMessageId: string;
  messageIds: readonly string[];
  headIndex: number;
  tailIndex: number;
  requestMessageId: string | null;
}

export function resolveAssistantResponseGroup(
  messages: readonly ThreadMessage[],
  messageIndex: number,
): AssistantResponseGroup | null {
  if (!Number.isInteger(messageIndex) || messages[messageIndex]?.role !== "assistant") return null;
  const turn = [...projectConversationTurns(messages).values()]
    .find((turn) => turn.assistantMessageIds.includes(messages[messageIndex]!.id));
  return turn ? assistantResponseGroupFromTurn(messages, turn) : null;
}

/** Compatibility shape for existing response actions; boundaries come from turns. */
export function assistantResponseGroupFromTurn(
  messages: readonly ThreadMessage[], turn: ConversationTurnProjection,
): AssistantResponseGroup {
  return {
    headMessageId: turn.headAssistantMessageId,
    tailMessageId: turn.tailAssistantMessageId,
    messageIds: turn.assistantMessageIds,
    headIndex: messages.findIndex(({ id }) => id === turn.headAssistantMessageId),
    tailIndex: messages.findIndex(({ id }) => id === turn.tailAssistantMessageId),
    requestMessageId: turn.requestMessageId,
  };
}

export function getAssistantResponseText(
  messages: readonly ThreadMessage[],
  group: AssistantResponseGroup,
): string {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const texts = group.messageIds.map((id) =>
    byId.get(id)?.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n") ?? "",
  );
  return texts.some((text) => text.length > 0) ? texts.join("\n\n") : "";
}
