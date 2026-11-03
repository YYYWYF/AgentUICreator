import type { ComponentProps } from "react";
import { ConversationCanonicalResponseReloadAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";

export function ConversationReloadActionPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseReloadAction>) {
  return <ConversationCanonicalResponseReloadAction {...props} />;
}
