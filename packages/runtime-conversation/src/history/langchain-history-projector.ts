import { unstable_convertExternalMessages as convertExternalMessages } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";

import type { ConversationMessage } from "../threads/types.js";

/** Official assistant-ui conversion boundary for persisted LangChain history. */
export function projectLangChainHistory(
  messages: readonly unknown[],
): ConversationMessage[] {
  return convertExternalMessages(
    [...messages] as LangChainMessage[],
    convertLangChainMessages,
    false,
    {},
  ) as ConversationMessage[];
}
