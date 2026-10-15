import { useThreadRootElementRef } from "./quote-thread-root.js";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { QuoteIcon, XIcon } from "lucide-react";
import { ComposerQuotePreview, QuoteBlock, SelectionToolbar } from "./adapters/assistant-ui/components/assistant-ui/elements/quote.aui.js";

export function InternalConversationQuoteBlock({ text, messageId }: { text: string; messageId: string }) {
  return <QuoteBlock text={text} messageId={messageId} />;
}
export function InternalConversationComposerQuotePreview({ dismissLabel }: { dismissLabel: string }) {
  return <ComposerQuotePreview.Root>
    <ComposerQuotePreview.Icon />
    <ComposerQuotePreview.Text />
    <ComposerQuotePreview.Dismiss>
      <button data-agent-ui-owned="" type="button" aria-label={dismissLabel} className="shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"><XIcon className="size-3.5" /></button>
    </ComposerQuotePreview.Dismiss>
  </ComposerQuotePreview.Root>;
}
export function InternalConversationQuoteSelectionToolbar({ quoteLabel }: { quoteLabel: string }) {
  const root = useThreadRootElementRef();
  // A thread composer is always editing (it accepts a new draft). That flag
  // does not indicate a historical message edit and must not suppress Quote.
  const disabled = useAuiState(s => s.thread.isDisabled || s.thread.isLoading);
  if (disabled || root === null) return null;
  return <SelectionToolbar.Root><SelectionToolbar.Quote><QuoteIcon className="size-3.5" />{quoteLabel}</SelectionToolbar.Quote></SelectionToolbar.Root>;
}
/** The canonical runtime supplies a callback bound to one concrete thread. */
const QuoteCleanupContext = createContext<(() => void) | undefined>(undefined);
export function InternalConversationQuoteLifecycleProvider({ clearPendingQuote, children }: {
  clearPendingQuote: () => void;
  children: ReactNode;
}) {
  return <QuoteCleanupContext.Provider value={clearPendingQuote}>{children}</QuoteCleanupContext.Provider>;
}
/** Capture this thread's cleanup; never resolve the mutable main thread on unmount. */
export function useInternalConversationQuoteLifecycle() {
  const clearPendingQuote = useContext(QuoteCleanupContext);
  useEffect(() => clearPendingQuote, [clearPendingQuote]);
}
