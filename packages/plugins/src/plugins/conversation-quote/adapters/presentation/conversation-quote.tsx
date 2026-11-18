import { useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { ConversationComposerDataContext, PluginInstanceContext, useComposer, type ComposerData } from '@za38.03/agent-ui-runtime/plugin-api';
import {
  ConversationComposerQuotePreview,
  ConversationQuoteSelectionToolbar,
  useConversationQuoteLifecycle,
  useAgentUILocale,
} from '../../../../public.js';
export interface ConversationQuoteData { readonly text: string; readonly messageId: string }
export type ConversationQuoteRequestAdapter = (quote: ConversationQuoteData) => ComposerData;
export interface ConversationQuotePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderPreview?: () => ReactNode;
  renderToolbar?: () => ReactNode;
  children?: ReactNode;
  requestAdapter?: ConversationQuoteRequestAdapter | undefined;
}
export function CanonicalConversationQuote({
  renderPreview, renderToolbar, children, requestAdapter,
}: ConversationQuotePluginProps) {
  useConversationQuoteLifecycle();
  const context = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const composer = useComposer(instance?.instance.pluginId === 'conversation-quote' ? undefined : 'quote');
  const [failed, setFailed] = useState(false);
  const labels = useAgentUILocale('conversationQuote');
  useLayoutEffect(() => {
    if (!context && !requestAdapter) return;
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
        queueMicrotask(() => { clear?.(); });
      } else {
        try {
          const raw = { text: quote.text, messageId: quote.messageId };
          const data = requestAdapter ? requestAdapter({ ...raw }) : raw;
          release = composer.setData(data, { quote: raw, selection: raw, includeInRequest: requestAdapter !== undefined,
            ...(!requestAdapter ? { defaultTextPrefix: raw.text.trim() && raw.messageId.trim() ? raw.text.split('\n').map(line => `> ${line}`).join('\n') + '\n\n' : '' } : {}),
          });
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
    return () => { stop(); release?.(); };
  }, [composer, context?.runtime, requestAdapter]);
  return <>
    {children ?? <>
      {renderPreview ? renderPreview() : <ConversationComposerQuotePreview />}
      {renderToolbar ? renderToolbar() : <ConversationQuoteSelectionToolbar />}
    </>}
    {failed && <p role='alert'>{labels.requestFailed}</p>}
  </>;
}
