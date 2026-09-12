import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AssistantUiConversationAdapter } from "../../agent-ui/adapters/assistant-ui/conversation";

export function ConversationSurfacePlugin({
  renderSlot,
}: UIPluginComponentProps) {
  return <AssistantUiConversationAdapter renderSlot={renderSlot} />;
}
