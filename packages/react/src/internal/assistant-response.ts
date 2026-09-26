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
  let headIndex = messageIndex;
  let tailIndex = messageIndex;
  while (messages[headIndex - 1]?.role === "assistant") headIndex--;
  while (messages[tailIndex + 1]?.role === "assistant") tailIndex++;
  return {
    headMessageId: messages[headIndex]!.id,
    tailMessageId: messages[tailIndex]!.id,
    messageIds: messages.slice(headIndex, tailIndex + 1).map(({ id }) => id),
    headIndex,
    tailIndex,
    requestMessageId: messages[headIndex - 1]?.id ?? null,
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
