import {
  ConversationActionBarRoot,
  ConversationBranchPicker,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiMessageFooterPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const locale = useAgentUILocale("messageActions");
  const actions = renderSlot("actions", null, { layout: "inline" });

  return (
    <div
      data-ui-plugin="assistant-ui-message-footer"
      data-slot="aui_assistant-message-footer-plugin"
    >
      <ConversationBranchPicker
        nextLabel={locale.next}
        previousLabel={locale.previous}
      />
      <ConversationActionBarRoot>{actions}</ConversationActionBarRoot>
    </div>
  );
}
