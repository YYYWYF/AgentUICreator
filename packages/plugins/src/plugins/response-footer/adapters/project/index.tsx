import type { ComponentProps } from "react";
import { ConversationCanonicalResponseFooter } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
export function ConversationResponseFooterPlugin({renderSlot, renderScopedSlot:_renderScopedSlot, ...props}: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseFooter>) {
  const actions=renderSlot("actions",null,{layout:"inline"});
  return <ConversationCanonicalResponseFooter actions={actions} {...props}/>;
}
