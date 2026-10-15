import { ConversationCanonicalResponseFeedbackActions } from "@za38.03/agent-ui-plugins";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiFeedbackActionsPlugin() {
  const labels = useAgentUILocale("conversationFeedback");
  return <ConversationCanonicalResponseFeedbackActions {...labels} />;
}
