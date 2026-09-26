import { ConversationCanonicalResponseReloadAction } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiReloadActionPlugin(_props: UIPluginComponentProps) {
  return <ConversationCanonicalResponseReloadAction />;
}
