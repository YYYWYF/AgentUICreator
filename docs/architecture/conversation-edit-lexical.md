# Historical message Lexical editing

`conversation-surface.userEditComposer` is an optional, message-scoped renderer
Slot with capability `conversation-user-edit-composer-renderer`. The assistant,
embedded and platform presets each install one
`assistant-ui-lexical-edit-composer-main` instance. It is independent of the
primary `assistant-ui-lexical-composer-input-main` instance and is exposed as
Official Resource `conversation-edit-lexical`.

The product-owned Thread composition adds `UserEditComposer` to its public
component seam. `ScopedUserEditComposer` renders the Slot with kind
`conversation.user-edit-composer` and an empty scope value. Message content,
identity and draft are read from the existing assistant-ui scope, never copied
into a second transport. Upstream vendored presentation remains unchanged.

`ConversationCanonicalUserEditComposer` always supplies the original message
wrapper, rounded shell, Cancel/Send primitives and textarea fallback. It hosts
an optional input using the shared `ComposerInputHostContext` with variant
`message-edit`. Primary inputs use `primary`. Edit Cancel, Update and input
labels come from the generated project's `conversation` locale namespace.

The optional `@agent-ui/react/lexical` facade exports
`ConversationUserEditLexicalComposer`. It reuses `LexicalComposerInput`,
`agentUIDirectiveFormatter` and `ConversationComposerDirectiveChip`. Known
user/resource/file/document directives display with `@`; command directives
use `/`. Historical display uses the same presentation prefixes without
changing canonical labels or stable IDs. Any parsed unsupported directive
causes the entire edit input to fall back to textarea and retain the raw text.

assistant-ui owns edit initialization, draft, atomic editing, history, IME,
Cancel, Send, Quote metadata and branches. The renderer does not call setText
to initialize a draft, register Mention/Slash pickers, create a Runtime, or
introduce an edit API. AG-UI still receives ordinary directive text. Backend
resolver and transport contracts are unchanged.

Disabling/removing the edit renderer resolves the scoped Slot's lazy canonical
fallback. The message Composer Runtime remains mounted, preserving the draft;
enabling/reinstalling the renderer rebuilds chips from that same text. Removing
primary Lexical input has no effect on historical rich editing, and vice versa.

Lexical remains confined to the optional facade, pinned to react-lexical
0.2.15 and Lexical 0.51.0; assistant-ui React remains 0.15.23. The existing local
upstream revision `3542d602272a62eddeb8989befc910841c267022` was inspected for
Lexical input and edit-runtime ownership. No upstream files were changed.

## Validation status

Regression tests are authored for the public seam, locale, known and unknown
directives, stable IDs, AG-UI text and backend resolution, Cancel, Quote parity,
branches, atomic deletion/Undo, multiline/IME/autofocus, readonly/running states,
and real Plugin Runtime disable/enable/remove/reinstall across all three presets.
They are not executed in this task: the user explicitly requested no acceptance.
Package compilation, test typechecking and static boundary checks establish
build compatibility only; browser/live-model behavior remains unaccepted.
