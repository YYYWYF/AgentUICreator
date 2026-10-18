import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerQuotePreview, ConversationQuoteSelectionToolbar, useConversationQuoteLifecycle, useAgentUILocale } from "../../../../public.js";
export interface ConversationQuotePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  previewProps?: Partial<ComponentProps<typeof ConversationComposerQuotePreview>>;
  toolbarProps?: Partial<ComponentProps<typeof ConversationQuoteSelectionToolbar>>;
  renderPreview?: (props: ComponentProps<typeof ConversationComposerQuotePreview>) => ReactNode;
  renderToolbar?: (props: ComponentProps<typeof ConversationQuoteSelectionToolbar>) => ReactNode;
  children?: ReactNode;
}
export function CanonicalConversationQuote({ previewProps, toolbarProps, renderPreview, renderToolbar, children }: ConversationQuotePluginProps) {
  const labels = useAgentUILocale("conversationQuote");
  useConversationQuoteLifecycle();
  const preview = { dismissLabel: labels.dismiss, ...previewProps };
  const toolbar = { quoteLabel: labels.quote, ...toolbarProps };
  return <>{children ?? <>{renderPreview ? renderPreview(preview) : <ConversationComposerQuotePreview {...preview} />}{renderToolbar ? renderToolbar(toolbar) : <ConversationQuoteSelectionToolbar {...toolbar} />}</>}</>;
}
