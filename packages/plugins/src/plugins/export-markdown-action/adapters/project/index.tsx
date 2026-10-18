import type { ComponentProps } from "react";
import { ConversationActionMoreMenu, ConversationCanonicalResponseExportMarkdownAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function ConversationExportMarkdownActionPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>) {
  const labels = useAgentUILocale("conversation");
  return <ConversationActionMoreMenu label={labels.moreActions}>
    <ConversationCanonicalResponseExportMarkdownAction menuLabel={labels.exportMarkdown} {...props} />
  </ConversationActionMoreMenu>;
}
