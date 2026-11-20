/** Stable shared contexts/services and shared attachment presentation for source-owned Composers.
 * This opt-in entry never exports the Composer implementation itself.
 */
export { useLocale } from "./locale.js";
export { ComposerHostConfigContext, ComposerInputHostContext } from "./internal/composer-input-host-context.js";
export { ComposerAttachments } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/attachment.aui.js";
export { TooltipIconButton } from "./internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
export { ComposerPrimitive, AuiIf, useAuiState, useAuiEvent } from "@assistant-ui/react";
export { XIcon } from "lucide-react";

export type ConversationComposerInputProps = Omit<
  import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Input>,
  "cacheMeasurements" | "submitOnEnter" | `unstable_${string}`
>;
export type ConversationComposerRootProps = import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Root>;
export type ConversationComposerDropzoneProps = import("react").ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.AttachmentDropzone>;

export { useComposer, type ComposerController, type ComposerState, type ComposerAttachment, type ComposerMessageDataAdapter, type ComposerRequestAdapter, type ComposerRequestAdapterInput, type ComposerData, type ComposerDataSource } from "./composer-data/request.js";
export { readComposerMessageData } from './composer-data/message-data.js';

export { createComposerInputController } from './composer-data/input-controller.js';
export { ConversationComposerDataContext } from './composer-data/request.js';
export type { ComposerDataOptions } from './composer-data/request.js';
export { InternalConversationQuoteLifecycleProvider, useInternalConversationQuoteLifecycle } from './internal/quote-lifecycle.js';
