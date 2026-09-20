import { ConversationCanonicalExportMarkdownAction } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function AssistantUiExportMarkdownActionPlugin(_props: UIPluginComponentProps) {
  return <ConversationCanonicalExportMarkdownAction />;
}
