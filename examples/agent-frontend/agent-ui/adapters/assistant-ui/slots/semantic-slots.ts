export const ASSISTANT_UI_CONVERSATION_SLOTS = {
  welcome: "conversation.empty.welcome",
  suggestions: "conversation.empty.suggestions",
  timeline: "conversation.timeline",
  composer: "conversation.composer",
  reasoning: "conversation.message.reasoning",
  toolActivity: "conversation.message.tool-activity",
  toolItem: "conversation.message.tool-item",
  attachments: "conversation.message.attachments",
  sources: "conversation.message.sources",
} as const;

export type AssistantUiConversationSlotId =
  (typeof ASSISTANT_UI_CONVERSATION_SLOTS)[keyof typeof ASSISTANT_UI_CONVERSATION_SLOTS];
