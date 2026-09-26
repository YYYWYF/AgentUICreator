import {
  ConversationActionBarRoot,
  ConversationBranchPicker,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiMessageFooterPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const actions = renderSlot("actions", null, { layout: "inline" });

  return (
    <div
      className="flex items-center"
      data-ui-plugin="assistant-ui-message-footer"
      data-slot="aui_assistant-message-footer-plugin"
    >
      <ConversationBranchPicker />
      <ConversationActionBarRoot>{actions}</ConversationActionBarRoot>
    </div>
  );
}
