export interface ConversationWelcomeConfig {
  title?: string;
  description?: string;
}

export interface ConversationPresentationConfig {
  welcome: ConversationWelcomeConfig;
}

/**
 * Application-owned Conversation presentation defaults. This is high-code
 * application configuration, not an AppUIModel Plugin payload.
 */
export const conversationWelcomeConfig: ConversationWelcomeConfig = {
  title: "How can I help you today?",
};

export const conversationPresentationConfig: ConversationPresentationConfig = {
  welcome: conversationWelcomeConfig,
};
