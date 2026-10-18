import type { ComponentProps } from "react";
import { ConversationComposerAddAttachment } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationAddAttachmentActionPlugin({renderSlot:_renderSlot, renderScopedSlot:_renderScopedSlot, ...props}: UIPluginComponentProps & ComponentProps<typeof ConversationComposerAddAttachment>) { return <ConversationComposerAddAttachment {...props}/>; }
