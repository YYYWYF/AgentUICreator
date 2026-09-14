export const ASSISTANT_UI_CONVERSATION_SLOTS = {
  welcome: "conversation.empty.welcome",
  suggestions: "conversation.empty.suggestions",
} as const;

export type AssistantUiConversationSlotId =
  (typeof ASSISTANT_UI_CONVERSATION_SLOTS)[keyof typeof ASSISTANT_UI_CONVERSATION_SLOTS];
