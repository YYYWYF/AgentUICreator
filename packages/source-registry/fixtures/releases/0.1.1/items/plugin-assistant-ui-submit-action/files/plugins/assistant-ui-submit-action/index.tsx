import {
  ConversationComposerCancel,
  ConversationComposerSend,
} from "@za38.03/agent-ui-react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiSubmitActionPlugin(
  _props: UIPluginComponentProps,
) {
  return (
    <>
      <ConversationComposerSend />
      <ConversationComposerCancel />
    </>
  );
}
