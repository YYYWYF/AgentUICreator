import { unstable_convertExternalMessages as convertExternalMessages } from "@assistant-ui/react";
import { convertLangChainMessages, type LangChainMessage } from "@assistant-ui/react-langgraph";
import type { ConversationMessage } from "../threads/types.js";

/** Official assistant-ui conversion only; backend/model compatibility belongs to Plugins. */
export function projectLangChainHistory(messages: readonly unknown[]): ConversationMessage[] {
  return convertExternalMessages(messages as LangChainMessage[], convertLangChainMessages, false, {}) as ConversationMessage[];
}
