/** Stable shared contexts/services and shared attachment presentation for source-owned Composers.
 * This opt-in entry never exports the Composer implementation itself.
 */
export { useAgentUILocale } from "./locale.js";
export { ComposerHostConfigContext, ComposerInputHostContext } from "./internal/composer-input-host-context.js";
export { useConversationComposerAwaitingReply, useConversationComposerSendGuard } from "./internal/conversation-composer-guard.js";
export { ComposerAttachments } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/attachment.aui.js";
export { TooltipIconButton } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
export { ComposerPrimitive, QueueItemPrimitive, AuiIf } from "@assistant-ui/react";
export { XIcon } from "lucide-react";

export type ConversationComposerInputProps = import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Input>;
export type ConversationComposerRootProps = import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Root>;
export type ConversationComposerDropzoneProps = import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.AttachmentDropzone>;
