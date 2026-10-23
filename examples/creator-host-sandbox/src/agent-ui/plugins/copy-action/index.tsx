import { ConversationCopyActionPlugin as Implementation } from "@za38.03/agent-ui-plugins/copy-action";
import type { ComponentProps } from "react";

export function ConversationCopyActionPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
