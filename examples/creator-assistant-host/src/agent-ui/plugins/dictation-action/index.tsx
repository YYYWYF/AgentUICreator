import { ConversationDictationActionPlugin as Implementation } from "@za38.03/agent-ui-plugins/dictation-action";
import type { ComponentProps } from "react";

export function ConversationDictationActionPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
