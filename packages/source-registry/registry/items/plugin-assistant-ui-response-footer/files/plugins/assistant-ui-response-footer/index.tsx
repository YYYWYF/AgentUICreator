import {
  ConversationResponseActionBarRoot,
  ConversationResponseBranchPicker,
} from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiResponseFooterPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const actions = renderSlot("actions", null, { layout: "inline" });

  return (
    <div
      className="flex items-center"
      data-ui-plugin="assistant-ui-response-footer"
      data-slot="aui_assistant-response-footer-plugin"
    >
      <ConversationResponseBranchPicker />
      <ConversationResponseActionBarRoot>{actions}</ConversationResponseActionBarRoot>
    </div>
  );
}
