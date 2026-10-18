import type { ComponentProps } from "react";
import { ConversationCanonicalResponseCopyAction } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

export function ConversationCopyActionPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseCopyAction>) {
  return <ConversationCanonicalResponseCopyAction {...props} />;
}
