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
    convertLangChainMessages,
    false,
    {},
  ) as ConversationMessage[];
}
