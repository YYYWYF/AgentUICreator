import {
  projectLangChainHistory,
  type ConversationMessage,
} from "@za38.03/agent-ui-runtime-conversation";

import type { ConversationDetail } from "../../../services/conversations";

export function projectConversationDetail(
  detail: ConversationDetail,
): ConversationMessage[] {
  switch (detail.history.format) {
    case "langchain":
      return projectLangChainHistory(detail.history.messages);
  }
}
