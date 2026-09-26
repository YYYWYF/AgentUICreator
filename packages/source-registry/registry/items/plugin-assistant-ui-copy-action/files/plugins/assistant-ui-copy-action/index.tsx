import { ConversationCanonicalResponseCopyAction } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiCopyActionPlugin(_props: UIPluginComponentProps) {
  return <ConversationCanonicalResponseCopyAction />;
}
