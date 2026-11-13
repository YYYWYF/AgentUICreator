import { createContext, useContext, useEffect, type ReactNode } from "react";
/** The canonical runtime supplies a callback bound to one concrete thread. */
const QuoteCleanupContext = createContext<(() => void) | undefined>(undefined);
export function InternalConversationQuoteLifecycleProvider({
  clearPendingQuote,
  children,
}: {
  clearPendingQuote: () => void;
  children: ReactNode;
}) {
  return (
    <QuoteCleanupContext.Provider value={clearPendingQuote}>
      {children}
    </QuoteCleanupContext.Provider>
  );
}
/** Capture this thread's cleanup; never resolve the mutable main thread on unmount. */
export function useInternalConversationQuoteLifecycle() {
  const clearPendingQuote = useContext(QuoteCleanupContext);
  useEffect(() => clearPendingQuote, [clearPendingQuote]);
}
