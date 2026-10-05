# Conversation Quote / Reply

`conversation-quote` is one removable Feature Plugin, installed by the three default presets in `assistant-ui-composer.beforeInput`. Creator resolves `plugin/conversation-quote` through the Official Resource Registry and its manifest authoring intents/default placement. Removing its composition removes creation UI and clears the owned thread's pending quote. It does not erase history.

assistant-ui owns `composer.quote`, `setQuote`, and `metadata.custom.quote`. The public React facade exposes QuoteBlock, composer preview, selection toolbar, and a lifecycle hook without exporting assistant-ui types. QuoteBlock is permanently available in canonical user messages. The canonical assistant message marks text selectable and other parts excluded; nested interactive Markdown controls are explicitly excluded using the same upstream marker convention.

Quote Elements come from frozen assistant-ui revision `3542d602272a62eddeb8989befc910841c267022` and are formally tracked by the existing vendor inventory/lock/provenance. Their selection primitive import is a declared sync adaptation. The internal primitive adapter has separate `quote-selection-UPSTREAM.json` provenance. It preserves the upstream selection algorithm, mouse/selection/scroll lifecycle, thread scoping, and setQuote semantics; its only selection behavior difference is the AgentUIRoot Portal target. Private DOM helper/context imports are replaced with equivalent local React DOM helpers and the canonical thread ref. It does not patch node_modules. Readonly threads do not mount the actionable toolbar.

`ConversationRuntimeProvider` installs `ConversationQuoteContextAgent` with the public AG-UI Middleware API on the existing AbstractAgent. This wraps the real HttpAgent/custom agent without introducing a second transport, run lifecycle, or cancel owner. Immediately before transport `run`, it reads that thread's assistant-ui snapshot, aligns every quoted user message by message ID, and adds Markdown blockquote context to a copy of outbound RunAgentInput. String content becomes `> quote\n\nquestion`; multimodal content gains a leading text part while retaining all original parts. The UI message, agent-owned transcript and metadata are unchanged. No-quote input is returned by identity. Every send reconstructs all quoted historical user turns, including after Plugin removal.

Quote is user input semantics. There are no Quote AG-UI events, CUSTOM events, backend Quote API, dispatch transforms, runConfig modifications, or text parsing. `quote-reply` is a Frontend Presentation demo using ordinary text streaming only.

## Persistence boundary

Live conversation and outgoing transcript preserve structured quote semantics. Refresh/history replay restores QuoteBlock only when the existing history source returns `metadata.custom.quote`. LangChain checkpoint text alone does not establish this capability. No structured Quote metadata is inferred from text, and ConversationService's history contract is unchanged. Persistence support is a separate enhancement.

## Regression coverage

The committed tests cover canonical UI selection/preview/dismiss/send, scoped Portal mounting, plugin removal/pending cleanup/history retention, readonly behavior, upstream selection boundaries, two-turn outbound context, non-mutation, multimodal ordering, ordinary input identity, and frozen upstream adaptation provenance. The existing style-isolation regression remains applicable. Per the delivery instruction, tests, typecheck, build, UI checks and acceptance were not executed for this change.
