import { ConversationComposerAddAttachment } from "@za38.03/agent-ui-react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiAddAttachmentActionPlugin(
  _props: UIPluginComponentProps,
) {
  return <ConversationComposerAddAttachment />;
}
