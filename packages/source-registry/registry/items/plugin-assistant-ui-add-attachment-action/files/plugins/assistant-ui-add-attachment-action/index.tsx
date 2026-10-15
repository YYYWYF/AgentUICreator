import { ConversationComposerAddAttachment } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiAddAttachmentActionPlugin(
  _props: UIPluginComponentProps,
) {
  return <ConversationComposerAddAttachment />;
}
