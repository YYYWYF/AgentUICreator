export const CONVERSATION_SLOTS = {
  welcome: "emptyWelcome",
  suggestions: "emptySuggestions",
} as const;

export type ConversationSlotId =
  (typeof CONVERSATION_SLOTS)[keyof typeof CONVERSATION_SLOTS];
