import type { ConversationWelcomeConfig, ConversationPresentationConfig } from "@za38.03/agent-ui-runtime/ui";
export type { ConversationWelcomeConfig, ConversationPresentationConfig } from "@za38.03/agent-ui-runtime/ui";

/**
 * Application-owned Conversation presentation defaults. This is high-code
 * application configuration, not an AppUIModel Plugin payload.
 */
export const conversationWelcomeConfig: ConversationWelcomeConfig = {
  // Omitted defaults resolve through locale in ConversationWelcomeFallback.
};

export const conversationPresentationConfig: ConversationPresentationConfig = {
  welcome: conversationWelcomeConfig,
};
