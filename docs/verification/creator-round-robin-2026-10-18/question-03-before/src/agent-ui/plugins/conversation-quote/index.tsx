import { ConversationQuotePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-quote";
import type { ComponentProps } from "react";

export function ConversationQuotePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
