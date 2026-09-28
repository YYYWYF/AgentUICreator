import { unstable_convertExternalMessages as convertExternalMessages } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";

import type { ConversationMessage } from "../threads/types.js";

/**
 * The AgentUICreator boundary for the official persisted LangChain converter.
 *
 * LangGraph Runtime ownership stays with useAgUiRuntime. react-langgraph is
 * used here only for the official persisted LangChain message conversion.
 */
export function projectLangChainHistory(
  messages: readonly unknown[],
): ConversationMessage[] {
  return convertExternalMessages(
    [...messages] as LangChainMessage[],
    (message, metadata) => {
      const converted = convertLangChainMessages(message, metadata);
      // Preserve persisted assistant message identities; the Conversation turn
      // layer groups response actions without merging the underlying messages.
      const preserve = (part: Exclude<ReturnType<typeof convertLangChainMessages>, unknown[]>) =>
        part.role === "assistant" ? { ...part, convertConfig: { joinStrategy: "none" as const } } : part;
      return Array.isArray(converted) ? converted.map(preserve) : preserve(converted);
    },
    false,
    {},
  ) as ConversationMessage[];
}
