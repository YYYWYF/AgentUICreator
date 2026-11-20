import { useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  ConversationComposerDataContext,
  useComposer,
} from '@za38.03/agent-ui-plugins/composer-support';
import { PluginInstanceContext } from '@za38.03/agent-ui-runtime/plugin-api';
import {
  ConversationComposerQuotePreview,
  ConversationQuoteSelectionToolbar,
  useConversationQuoteLifecycle,
  useLocale,
} from '../../../../public.js';
export interface ConversationQuoteData {
  readonly text: string;
  readonly messageId: string;
}
export interface ConversationQuotePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderPreview?: () => ReactNode;
  renderToolbar?: () => ReactNode;
}
export function CanonicalConversationQuote({
  renderPreview,
  renderToolbar,
}: ConversationQuotePluginProps) {
  useConversationQuoteLifecycle();
  const context = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const composer = useComposer(instance?.instance.pluginId === 'conversation-quote' ? undefined : 'quote');
  const [failed, setFailed] = useState(false);
  const labels = useLocale('conversationQuote');
  useLayoutEffect(() => {
    if (!context) return;
    setFailed(false);
    let previous: ConversationQuoteData | undefined;
    let release: (() => void) | undefined;
    let busy = false;
    const update = () => {
      if (busy) return;
      const quote = composer.getState().quote;
      if (quote === previous) return;
      busy = true;
      if (!quote) {
        previous = undefined;
        const clear = release;
        // Native send detaches quote before dispatch. Let its runConfig scope settle.
        queueMicrotask(() => {
          clear?.();
        });
      } else {
        try {
          const raw = { text: quote.text, messageId: quote.messageId };
          release = composer.setData(raw, { quote: raw });
          previous = quote;
          setFailed(false);
        } catch {
          composer.setQuote(previous);
          setFailed(true);
        }
      }
      busy = false;
    };
    const stop = composer.subscribe(update);
    update();
    return () => {
      stop();
      release?.();
    };
  }, [composer, context?.runtime]);
  return (
    <>
      {
        <>
          {renderPreview ? renderPreview() : <ConversationComposerQuotePreview />}
          {renderToolbar ? renderToolbar() : <ConversationQuoteSelectionToolbar />}
        </>
      }
      {failed && <p role='alert'>{labels.requestFailed}</p>}
    </>
  );
}
