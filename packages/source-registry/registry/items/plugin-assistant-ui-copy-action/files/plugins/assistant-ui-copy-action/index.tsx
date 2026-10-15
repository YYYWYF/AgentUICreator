import { ConversationCanonicalResponseCopyAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiCopyActionPlugin(_props: UIPluginComponentProps) {
  return <ConversationCanonicalResponseCopyAction />;
}
