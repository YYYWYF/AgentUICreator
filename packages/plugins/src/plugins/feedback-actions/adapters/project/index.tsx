import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { ConversationCanonicalResponseFeedbackActions } from "@za38.03/agent-ui-plugins";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function ConversationFeedbackActionsPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationCanonicalResponseFeedbackActions>>) {
  const labels = useAgentUILocale("conversationFeedback");
  return <ConversationCanonicalResponseFeedbackActions {...labels} {...props} />;
}
