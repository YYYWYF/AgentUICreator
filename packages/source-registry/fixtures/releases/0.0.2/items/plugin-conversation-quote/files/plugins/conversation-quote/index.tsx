import { ConversationComposerQuotePreview, ConversationQuoteSelectionToolbar, useConversationQuoteLifecycle } from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function ConversationQuotePlugin() {
  const labels = useAgentUILocale("conversationQuote");
  useConversationQuoteLifecycle();
  return <>
    <ConversationComposerQuotePreview dismissLabel={labels.dismiss} />
    <ConversationQuoteSelectionToolbar quoteLabel={labels.quote} />
  </>;
}
