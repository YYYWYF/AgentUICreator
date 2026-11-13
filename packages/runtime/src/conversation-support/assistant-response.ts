import type { ConversationTurnGroup } from "./conversation-turn.js";
type ThreadMessage = {
  id: string;
  role: string;
  content: readonly { type: string; text?: string }[];
};

export function getAssistantResponseText(
  messages: readonly ThreadMessage[],
  group: ConversationTurnGroup,
): string {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const texts = group.assistantMessageIds.map((id) => {
    const message = byId.get(id);
    if (message?.role !== "assistant") return "";
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
  });
  return texts.some((text) => text.length > 0) ? texts.join("\n\n") : "";
}
