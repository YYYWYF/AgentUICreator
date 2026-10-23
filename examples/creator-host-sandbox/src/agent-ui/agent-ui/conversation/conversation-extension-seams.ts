/**
 * Architecture contract for conversation extension ownership. This is a
 * source-level guard target, not a runtime registry or a second composition
 * mechanism.
 */
export const CONVERSATION_EXTENSION_SEAMS = {
  welcome: "thread-component",
  reasoning: "thread-component",
  toolActivity: "thread-component",
  toolItem: "thread-component",
  tool: "toolkit",
  suggestions: "runtime",
  readOnly: "runtime",
} as const;

export type ConversationExtensionSeam =
  (typeof CONVERSATION_EXTENSION_SEAMS)[keyof typeof CONVERSATION_EXTENSION_SEAMS];
