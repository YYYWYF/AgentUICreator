export const ASSISTANT_UI_CONVERSATION_SLOTS = {
  welcome: "conversation.empty.welcome",
  suggestions: "conversation.empty.suggestions",
} as const;

/**
 * Dormant legacy plugin slots. They are retained for independent legacy
 * plugin implementations, but are not part of the assistant-ui Thread
 * composition contract.
 */
export type AssistantUiConversationSlotId =
  (typeof ASSISTANT_UI_CONVERSATION_SLOTS)[keyof typeof ASSISTANT_UI_CONVERSATION_SLOTS];
