import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { ConversationToolFallback, type ConversationToolFallbackProps, type ToolFallbackPresentationProps } from "@za38.03/agent-ui-plugins";
export function ConversationToolFallbackPlugin({ tool, ...props }: UIPluginComponentProps & { tool?: ConversationToolFallbackProps } & ToolFallbackPresentationProps) {
  return tool ? <ConversationToolFallback {...tool} {...props} /> : null;
}
