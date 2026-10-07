# Product localization ownership

`vendor-owned code must remain locale-agnostic and unmodified; all product localization is owned by AgentUICreator composition, adapters, plugins, and host UI.`

The supported locales are `en-US` and `zh-CN`. Locale affects presentation only:
never translate plugin/command IDs, enums, schema keys, API fields, persisted field
names, tool names, capabilities, or AG-UI events. Agent messages, user input,
recording transcripts, sample payloads and backend diagnostic details remain data.

## Message owners

- Generated projects keep their existing `agent-ui/i18n` registry and namespace
  hook. `locale-provider` remains the locale service owner. The composition bridge
  inherits the public presentation defaults and feeds its selected locale and
  messages into the product React wrappers. Hosts can override those defaults
  in their existing generated locale dictionaries. Host `Agent.locale`
  can control this presentation setting without recreating the runtime, services,
  or AppUIModel. Preset starter suggestions follow the locale; custom welcome
  content remains Host-owned.
- `@agent-ui/react` owns default presentation messages for its composition and
  adapters. `AgentUILocaleProvider` also supports partial Host message overrides.
  New facade APIs require `@agent-ui/react >=0.1.1`; generated foundation
  dependency metadata records that minimum. Its standalone default stays `en-US`; generated projects explicitly bridge
  their configured default (`zh-CN`). Plugins continue using the existing
  generated namespace hook and declare locale service consumption where needed.
- Creator is a separate development tool. Its tool-host locale provider and
  domain dictionaries live in `packages/creator/src/ui/i18n`. The UI export
  accepts a controlled `locale` and `onLocaleChange`, and Settings offers a
  language selector. Generated projects never import Creator or its messages.
- Example Hosts select language independently and pass it to their Agent. Their
  product UI and theme showcase use the same public presentation context.

Components consume messages; pure presentation helpers receive messages as an
argument. Fallbacks resolve missing keys through the default dictionary, keep
production rendering usable, and warn once per missing key in development.
Placeholder replacement preserves inserted values as data. Language changes
must preserve composer drafts, connection drafts, selections, and runtime state.
Do not use a translated label to make a domain or protocol decision.

## Inventory and maintenance

The initial inventory was collected before editing and classified by semantic
ownership. `initial-ui-copy-inventory.json` records that baseline, including
untranslated developer diagnostics and mock/example content. Its line numbers
refer to the starting working tree, which included pending independent changes.
The committed implementation also localizes the clean branch's corresponding
UI; pending changes are kept separate.

Run `pnpm check:i18n` for recursive key parity, non-empty messages and placeholder
parity. `pnpm audit:ui-copy` writes an AST-based inventory of current owned
surfaces, duplicate values and potentially unused keys. The latter findings are
advisory: whole namespace forwarding and dynamic Plugin data cannot be judged by
string matching. Code samples, language autonyms, brand names and protocol labels
need semantic review instead of blanket bans on English or Chinese.

assistant-ui integrations are generated. Edit the guarded product localization
recipes and their owning generator; regenerate rather than editing generated
components. `check:assistant-ui-upstream` verifies pristine vendor and adapter
provenance. Changed localization anchors stop generation and require review.

On every upstream upgrade, **check new upstream user-facing copy**. Prefer public
props and composition, then product adapters/wrappers. Record unavailable seams
in [upstream-localization-gaps.md](./upstream-localization-gaps.md). Locale gaps
must never justify vendor changes or become an upgrade blocker.

## Verification boundary for this change

Only static checks, compilation and focused unit regressions are run. Per the
user's instruction, browser, visual, narrow-screen and production acceptance are
not performed. No visual acceptance or zero-visible-English claim is implied.
