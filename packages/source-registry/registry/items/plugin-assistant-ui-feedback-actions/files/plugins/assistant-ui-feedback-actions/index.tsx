import { ConversationCanonicalResponseFeedbackActions } from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiFeedbackActionsPlugin() {
  const labels = useAgentUILocale("conversationFeedback");
  return <ConversationCanonicalResponseFeedbackActions {...labels} />;
}
