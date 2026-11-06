import type { ReactNode } from 'react';
import {
  ConversationComposerQuotePreview,
  ConversationQuoteSelectionToolbar,
  useConversationQuoteLifecycle,
} from '../../../../public.js';
export interface ConversationQuotePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderPreview?: () => ReactNode;
  renderToolbar?: () => ReactNode;
  children?: ReactNode;
}
export function CanonicalConversationQuote({
  renderPreview,
  renderToolbar,
  children,
}: ConversationQuotePluginProps) {
  useConversationQuoteLifecycle();
  return (
    <>
      {children ?? (
        <>
          {renderPreview ? renderPreview() : <ConversationComposerQuotePreview />}
          {renderToolbar ? renderToolbar() : <ConversationQuoteSelectionToolbar />}
        </>
      )}
    </>
  );
}
