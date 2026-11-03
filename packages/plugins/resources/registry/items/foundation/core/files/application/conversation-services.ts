import type { ConversationRuntimeProviderProps } from "@za38.03/agent-ui-runtime";

/** Project-owned business integrations. Creator edits this implementation when
 * an upload, transcription or feedback service is needed. Do not expose service
 * URLs or credentials as Agent props. Empty options retain the built-in defaults.
 * Special protocols can use the adapter overrides here without copying Runtime.
 */
export const conversationServices: Pick<ConversationRuntimeProviderProps,
  "attachments" | "dictation" | "feedback" |
  "attachmentAdapter" | "dictationAdapter" | "feedbackAdapter"
> = {};
