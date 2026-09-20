import {
  ConversationActionExportMarkdown,
  ConversationTooltipIconButton,
} from "@agent-ui/react";
import { DownloadIcon } from "lucide-react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiExportMarkdownActionPlugin(_props: UIPluginComponentProps) {
  const locale = useAgentUILocale("messageActions");

  return (
    <ConversationActionExportMarkdown>
      <ConversationTooltipIconButton tooltip={locale.exportMarkdown} type="button">
        <DownloadIcon />
      </ConversationTooltipIconButton>
    </ConversationActionExportMarkdown>
  );
}
