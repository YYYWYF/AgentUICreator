import { ConversationCanonicalResponseReloadAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiReloadActionPlugin(_props: UIPluginComponentProps) {
  return <ConversationCanonicalResponseReloadAction />;
}
