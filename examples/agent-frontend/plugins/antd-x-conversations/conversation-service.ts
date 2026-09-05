import type { AgentMessage } from "../../framework/contracts/ui-plugin";
import type { AgentUIConversationService } from "../../services/conversations";

export function readConversationKey(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function messageBelongsToConversation(
  message: AgentMessage,
  activeKey: string | undefined,
): boolean {
  if (activeKey === undefined) {
    return true;
  }

  const metadata = message.metadata;
  const conversationKey =
    readConversationKey(metadata?.conversationId) ??
    readConversationKey(metadata?.threadId);

  // A live AG-UI runtime normally exposes only the current thread. Messages
  // without explicit history metadata therefore remain visible.
  return conversationKey === undefined || conversationKey === activeKey;
}

export function createAgentUIConversationService(
  activeKeyValue: unknown,
): AgentUIConversationService {
  const activeKey = readConversationKey(activeKeyValue);

  return {
    activeKey,
    includesMessage: (message) =>
      messageBelongsToConversation(message, activeKey),
  };
}
