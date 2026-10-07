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
  // Omitted defaults resolve through locale in ConversationWelcomeFallback.
};

export const conversationPresentationConfig: ConversationPresentationConfig = {
  welcome: conversationWelcomeConfig,
};
