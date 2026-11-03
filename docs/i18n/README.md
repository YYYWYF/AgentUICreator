# Product localization ownership

`vendor-owned code must remain locale-agnostic and unmodified; all product localization is owned by AgentUICreator composition, adapters, plugins, and host UI.`

The supported locales are `en-US` and `zh-CN`. Locale affects presentation only:
never translate plugin/command IDs, enums, schema keys, API fields, persisted field
names, tool names, capabilities, or AG-UI events. Agent messages, user input,
recording transcripts, sample payloads and backend diagnostic details remain data.

## Message owners

- `@za38.03/agent-ui-plugins` owns presentation dictionaries in
  `packages/plugins/src/locales/{en-US,zh-CN}.ts`, their types and the public
  `AgentUILocaleProvider`, `useAgentUILocale()` and `useAgentUILocaleCode()` APIs
  in `src/locale.tsx`. Standalone presentation defaults to `en-US`.
- Generated projects use Runtime `/ui` and default to `zh-CN`. `locale-provider`
  remains the enabled service owner; Runtime's `AgentUILocaleBridge` connects it
  to the shared presentation context. `Agent.locale` controls the current locale,
  `defaultLocale` sets the initial uncontrolled value, `onLocaleChange` receives
  UI changes, and `locales` supplies per-locale partial overrides. New projects
  do not copy full dictionaries or generate theme/locale service forwarding files.
- The project owns custom business messages and welcome content. Official copy
  uses its existing domain namespace; project business messages use the unified
  locale code rather than another language state. Runtime, services, AppUIModel
  and composer drafts survive language changes. Existing local files and Host
  overrides are preserved by npm upgrades.
- Creator is a separate development tool. Its locale context and dictionaries
  live in `packages/creator/src/ui/i18n`. Its UI accepts controlled `locale` and
  `onLocaleChange`, and Settings offers a language selector. Generated projects
  never import Creator or its messages.
- `locale-switch` consumes the existing locale service. Controlled Hosts pass
  `Agent.locale` with `onLocaleChange`; uncontrolled Hosts may set `defaultLocale`.
  Locale affects presentation and is not sent to AG-UI as protocol state.

Components consume messages; pure presentation helpers receive messages as an
argument. Fallbacks resolve missing keys through the default dictionary, keep
production rendering usable, and warn once per missing key in development.
Placeholder replacement preserves inserted values as data. Language changes
must preserve composer drafts, connection drafts, selections, and runtime state.
Do not use a translated label to make a domain or protocol decision.

## Inventory and maintenance

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
