import type { ComponentProps } from "react";
import { ConversationActionMoreMenu, ConversationCanonicalResponseExportMarkdownAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { useAgentUILocale } from "@za38.03/agent-ui-plugins";

export function ConversationExportMarkdownActionPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>) {
  const labels = useAgentUILocale("conversation");
  return <ConversationActionMoreMenu label={labels.moreActions}>
    <ConversationCanonicalResponseExportMarkdownAction menuLabel={labels.exportMarkdown} {...props} />
  </ConversationActionMoreMenu>;
}
