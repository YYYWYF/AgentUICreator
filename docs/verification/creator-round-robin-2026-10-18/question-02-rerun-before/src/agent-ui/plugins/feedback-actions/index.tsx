import { ConversationFeedbackActionsPlugin as Implementation } from "@za38.03/agent-ui-plugins/feedback-actions";
import type { ComponentProps } from "react";

export function ConversationFeedbackActionsPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
