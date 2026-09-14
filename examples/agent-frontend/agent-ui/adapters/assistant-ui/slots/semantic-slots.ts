export const ASSISTANT_UI_CONVERSATION_SLOTS = {
  welcome: "conversation.empty.welcome",
  suggestions: "conversation.empty.suggestions",
  reasoning: "conversation.message.reasoning",
  toolActivity: "conversation.message.tool-activity",
  toolItem: "conversation.message.tool-item",
} as const;

/**
 * Dormant legacy plugin slots. They are retained for independent legacy
 * plugin implementations, but are not part of the assistant-ui Thread
 * composition contract.
 */
export const LEGACY_ASSISTANT_UI_CONVERSATION_SLOTS = {
  timeline: "conversation.timeline",
  composer: "conversation.composer",
  attachments: "conversation.message.attachments",
  sources: "conversation.message.sources",
} as const;

export type AssistantUiConversationSlotId =
  (typeof ASSISTANT_UI_CONVERSATION_SLOTS)[keyof typeof ASSISTANT_UI_CONVERSATION_SLOTS];

export type LegacyAssistantUiConversationSlotId =
  (typeof LEGACY_ASSISTANT_UI_CONVERSATION_SLOTS)[keyof typeof LEGACY_ASSISTANT_UI_CONVERSATION_SLOTS];
