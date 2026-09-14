export const CONVERSATION_SLOTS = {
  welcome: "conversation.empty.welcome",
  suggestions: "conversation.empty.suggestions",
} as const;

export type ConversationSlotId =
  (typeof CONVERSATION_SLOTS)[keyof typeof CONVERSATION_SLOTS];
