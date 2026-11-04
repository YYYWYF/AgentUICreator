import { ConversationNewPlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-new";
import type { ComponentProps } from "react";

export function ConversationNewPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
