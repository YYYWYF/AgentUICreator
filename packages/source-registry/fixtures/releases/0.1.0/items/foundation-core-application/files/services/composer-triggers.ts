import type { ConversationMentionSource, ConversationSlashCommand, ConversationSlashCommandSource } from "@agent-ui/react";
export type { ConversationMentionSource, ConversationSlashCommand, ConversationSlashCommandSource } from "@agent-ui/react";
export const CONVERSATION_MENTION_SOURCE = "conversation.mention-source" as const;
export const CONVERSATION_COMMAND_SOURCE = "conversation.slash-command-source" as const;
export interface ConversationCommandRegistry extends ConversationSlashCommandSource {
  register(command: ConversationSlashCommand): () => void;
}
export function createConversationCommandRegistry(): ConversationCommandRegistry {
  const entries = new Map<string, ConversationSlashCommand>();
  const listeners = new Set<() => void>();
  let snapshot: readonly ConversationSlashCommand[] = Object.freeze([]);
  const publish = () => { snapshot = Object.freeze([...entries.values()]); listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    register(command) {
      if (!command.id || entries.has(command.id)) throw new Error(`Duplicate or invalid conversation command: ${command.id}`);
      entries.set(command.id, command); publish();
      return () => { if (entries.get(command.id) !== command) return; entries.delete(command.id); publish(); };
    },
  };
}
declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [CONVERSATION_MENTION_SOURCE]: ConversationMentionSource;
    [CONVERSATION_COMMAND_SOURCE]: ConversationCommandRegistry;
  }
}
