import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { ConversationCanonicalResponseFeedbackActions } from "@za38.03/agent-ui-plugins";
import { useAgentUILocale } from "@za38.03/agent-ui-plugins";

export function ConversationFeedbackActionsPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationCanonicalResponseFeedbackActions>>) {
  const labels = useAgentUILocale("conversationFeedback");
  return <ConversationCanonicalResponseFeedbackActions {...labels} {...props} />;
}
