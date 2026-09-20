import {
  ConversationActionReload,
  ConversationTooltipIconButton,
} from "@agent-ui/react";
import { RefreshCwIcon } from "lucide-react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiReloadActionPlugin(_props: UIPluginComponentProps) {
  const locale = useAgentUILocale("messageActions");

  return (
    <ConversationActionReload>
      <ConversationTooltipIconButton tooltip={locale.reload} type="button">
        <RefreshCwIcon />
      </ConversationTooltipIconButton>
    </ConversationActionReload>
  );
}
