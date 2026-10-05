import { useThreadRootElementRef } from "./quote-thread-root.js";
import { useEffect } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { QuoteIcon, XIcon } from "lucide-react";
import { ComposerQuotePreview, QuoteBlock, SelectionToolbar } from "./vendor/assistant-ui/components/assistant-ui/elements/quote.aui.js";

export function InternalConversationQuoteBlock({ text, messageId }: { text: string; messageId: string }) {
  return <QuoteBlock text={text} messageId={messageId} />;
}
export function InternalConversationComposerQuotePreview({ dismissLabel }: { dismissLabel: string }) {
  return <ComposerQuotePreview.Root>
    <ComposerQuotePreview.Icon />
    <ComposerQuotePreview.Text />
    <ComposerQuotePreview.Dismiss>
      <button type="button" aria-label={dismissLabel} className="shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"><XIcon className="size-3.5" /></button>
    </ComposerQuotePreview.Dismiss>
  </ComposerQuotePreview.Root>;
}
export function InternalConversationQuoteSelectionToolbar({ quoteLabel }: { quoteLabel: string }) {
  const root = useThreadRootElementRef();
  const disabled = useAuiState(s => s.thread.isDisabled || s.thread.isLoading || s.thread.composer.isEditing);
  if (disabled || root === null) return null;
  return <SelectionToolbar.Root><SelectionToolbar.Quote><QuoteIcon className="size-3.5" />{quoteLabel}</SelectionToolbar.Quote></SelectionToolbar.Root>;
}
/** Capture this thread's composer; cleanup must never clear another thread. */
export function useInternalConversationQuoteLifecycle() {
  const aui = useAui();
  const threadId = useAuiState(s => s.threads.mainThreadId);
  useEffect(() => {
    const composer = aui.thread.composer();
    return () => composer.setQuote(undefined);
  }, [aui, threadId]);
}
