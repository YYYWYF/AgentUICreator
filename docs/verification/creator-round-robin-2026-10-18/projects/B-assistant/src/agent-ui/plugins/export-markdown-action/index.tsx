import { ConversationExportMarkdownActionPlugin as Implementation } from "@za38.03/agent-ui-plugins/export-markdown-action";
import type { ComponentProps } from "react";

export function ConversationExportMarkdownActionPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
