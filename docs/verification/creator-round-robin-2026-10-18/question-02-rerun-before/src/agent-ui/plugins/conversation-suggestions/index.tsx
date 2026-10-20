import { ConversationSuggestionsPlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-suggestions";
import type { ComponentProps } from "react";

export function ConversationSuggestionsPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
