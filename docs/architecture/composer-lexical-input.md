# Optional Lexical Composer Input

The main thread Composer can replace its text input through the optional, single
`assistant-ui-composer.input` Slot. The capability is
`conversation-composer-input`; the default instance in assistant, embedded and
platform presets is `assistant-ui-lexical-composer-input-main`.

## Presentation and data contract

`ConversationCanonicalComposer` provides an internal `ComposerInputHostContext`
with its placeholder, accessible label and resolved autofocus. Both
`ConversationComposerTextareaInput` and `ConversationComposerLexicalInput`
consume that presentation contract. Attachments, Quote preview, triggers,
dropzone, leading/trailing actions and submit action stay in the Composer shell.
The historical message EditComposer continues to use its existing textarea.

The Source Plugin is a thin component importing only `@agent-ui/react/lexical`.
The optional facade passes `agentUIDirectiveFormatter` explicitly to the pinned
upstream `LexicalComposerInput`. Upstream owns the editor, atomic directive nodes,
selection, deletion, history, Runtime synchronization and keyboard/IME handling.
There is no second directive parser, text synchronization implementation, Agent
Runtime or Lexical JSON transport.

The product chip displays `@` plus the label for user/resource/file references,
and `/` plus the label for commands. Its `data-directive-type` and
`data-directive-id` retain the reference identity without displaying stable IDs.
Scoped CSS uses current theme tokens for light, dark and Violet; it only styles
the input and chips and does not change the Composer shell/background.

Runtime text, AG-UI requests, historical message rendering and backend resolution
continue to use `:user[张三]{name=employee_84721}` and the existing Directive Codec.
Slash actions still use the existing action path; Slash directives still use the
existing selection override and upstream SyncPlugin reconstruction.

## Removal and installation

The canonical Composer uses `input ?? <ComposerTextareaInput />`. Source Plugin
Slot rendering also supplies `<ConversationComposerTextareaInput />` as the
Slot fallback: SlotRuntime returns a React wrapper even when the Slot is empty,
so null coalescing alone is insufficient for composition removal. The fallback
renders inside the presentation provider and preserves the same Runtime draft.
Removing or disabling the Lexical instance only changes the input presentation.
Mention, Slash, Quote and backend semantics remain independent. Permanent source
removal uses existing Host Source purge; npm dependency garbage collection is
outside this change.

`conversation-lexical-input` installs the plugin through the existing official
Resource mechanism. Mention, Slash and Mention Context scenarios declare that
Resource. Composer source version 0.0.2 includes the input seam; existing managed
projects install it through the normal Source dependency transaction. Customized
source continues to follow existing conflict rules.

## Optional dependency boundary

- `@assistant-ui/react` stays at 0.15.23.
- `@assistant-ui/react-lexical` is pinned to 0.2.15.
- `lexical`, `@lexical/react`, `@lexical/utils`, `@lexical/history` and
  `@lexical/plain-text` are all pinned to 0.51.0.
- These packages are dev dependencies and optional peers of `@agent-ui/react`,
  and explicit requirements of the Lexical Source Item. They are not ordinary
  runtime dependencies of the main facade.
- `./lexical` has its own public declaration/JS export. Nothing in the main
  facade imports it. Build asset processing preserves its public declaration.
- `check:lexical-boundary` follows the main facade import graph, restricts upstream
  coupling to lexical facade/internal paths, forbids direct upstream imports in
  Source Plugins, checks optional peer/source pins, and rejects multiple Lexical
  versions in the workspace lockfile.

The upstream API was inspected at the current local pinned revision
`3542d602272a62eddeb8989befc910841c267022`. No vendored assistant-ui files are
modified by this integration.

## Validation status

Implementation regression tests cover actual Mention/Slash trigger integration,
chip identity, unchanged AG-UI text, external Runtime text updates, draft clear,
atomic deletion, Undo integrity, accessible labels, readonly/IME behavior and
textarea fallback. Preset and Resource tests cover default input placement and
installation. These tests are authored but have not been executed in this task.
Browser, real-model and behavioral acceptance were explicitly skipped at the
user's request. Package builds and architecture guards are compilation/static
checks, not evidence that the behavioral acceptance matrix has passed.
