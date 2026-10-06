import { ConversationActionMoreMenu, ConversationCanonicalResponseExportMarkdownAction } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiExportMarkdownActionPlugin(_props: UIPluginComponentProps) {
  const labels = useAgentUILocale("conversation");
  return <ConversationActionMoreMenu label={labels.moreActions}>
    <ConversationCanonicalResponseExportMarkdownAction menuLabel={labels.exportMarkdown} />
  </ConversationActionMoreMenu>;
}
