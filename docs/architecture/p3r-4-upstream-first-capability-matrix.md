# P3R-4: Upstream-First Capability Ownership Matrix

## 1. Status and purpose

This document is the source of truth for Agent UI presentation ownership in
AgentUICreator. It applies the P3R-0 Conversation Domain architecture to the
P3R-4 capability cutover work.

The governing rule is:

```text
assistant-ui capability exists
  -> reuse assistant-ui

assistant-ui capability exists but needs product integration
  -> adapt or extend assistant-ui

assistant-ui capability does not exist
  -> AgentUICreator presentation is allowed
```

P3R-4D keeps the legacy normal mode intact. The `assistantUiSpike=1`
AppUIModel projection now also stops the legacy Composer and Conversation List
Plugins from overriding assistant-ui, while adapters preserve product
placeholder, quick-prompt, history, and disabled-conversation policy.

Pinned upstream baseline:

```text
Source Registry item: foundation/assistant-ui-conversation@0.1.6
assistant-ui revision: 97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7

In assistant-ui mode, the pinned assistant-ui native Thread composition owns
placement. Semantic Slots describe replaceable capabilities, while the
conversation shell for each mode decides where those capabilities appear.
Starter Suggestions therefore remain the `conversation-surface` Plugin's local `emptySuggestions`
capability and render in assistant-ui's canonical Footer placement, after the
Composer.
```

## 2. Allowed ownership statuses

Every target status in this matrix is one of these values:

| Status | Meaning |
| --- | --- |
| `assistant-ui-canonical` | assistant-ui provides the canonical presentation implementation; for a Renderer Slot, the default presentation is selected by an explicit canonical Renderer Plugin in AppUIModel, and AgentUICreator must not maintain a parallel default UI or implicit Host fallback. |
| `assistant-ui-with-agent-ui-adapter` | assistant-ui provides the canonical UI, while AgentUICreator supplies product data, configuration, policy, or Runtime integration. |
| `agent-ui-extension` | The pinned assistant-ui version lacks the complete product capability or presentation, so an AgentUICreator implementation is allowed. |
| `structural-host` | The component owns semantic Slot composition or product structure, not canonical leaf presentation. |
| `legacy-only` | assistant-ui owns the canonical implementation, but the old implementation remains temporarily for the normal-mode A/B path and is a P3R-6 deletion candidate. |

For Reasoning, Tool Group, and Tool Fallback, canonical presentation may be
called from a scoped Renderer Plugin. AgentUICreator selects that Plugin through
AppUIModel, while assistant-ui retains grouping, part order, named Tool UI
priority, streaming state, and the canonical component anatomy. See
[Scoped Renderer Plugins](scoped-renderer-plugin.md). The canonical label means
that the default Renderer Plugin calls the canonical assistant-ui component; it
does not allow the Host or Adapter to restore that presentation when the Slot
is empty, disabled, or unavailable.

## 3. Capability matrix

| Capability | assistant-ui upstream | Current AgentUICreator | Target status | Current phase action |
| --- | --- | --- | --- | --- |
| Thread shell | `Thread` | `conversation-surface` hosts the product boundary | `assistant-ui-canonical` | Keep `conversation-surface` as a structural wrapper and pass through the upstream Thread. |
| Viewport / scroll | Thread viewport, auto-scroll, scroll-to-bottom | Legacy message list has its own viewport behavior | `assistant-ui-canonical` | Use upstream behavior in assistant-ui mode; keep the legacy path for A/B. |
| Welcome | `ThreadWelcome` | `agent-thread-welcome` consumes application conversation config | `assistant-ui-with-agent-ui-adapter` | The adapter supplies application-owned title and description. |
| Starter Suggestions | `ThreadPrimitive.Suggestions`, `SuggestionPrimitive`, and upstream presentation | `agent-suggestions` consumes the assistant-ui runtime suggestion scope | `assistant-ui-with-agent-ui-adapter` | Application/runtime config enters `AuiConfig` through `Suggestions()`. |
| Follow-up Suggestions | Suggestion primitives and Thread composition | AgentUICreator owns product suggestion data and action binding | `assistant-ui-with-agent-ui-adapter` | Keep Runtime `thread.suggestions` independent from static starter configuration. |
| Composer | Composer primitives for input, send, cancel, attachments, dictation, and slash-command trigger popover | `agent-composer` remains only in the normal-mode A/B path | `assistant-ui-with-agent-ui-adapter` | P3R-4C uses the native Composer; AgentUICreator adapts product placeholder, history read-only policy, and AppUIModel quick prompts through the official TriggerPopover and SlashCommandAdapter. |
| Composer attachments | Composer attachment primitives and upload presentation | Native Composer exposes attachment UI according to Runtime capability | `assistant-ui-with-agent-ui-adapter` | Presentation is assistant-ui canonical; transport availability remains governed by the active Runtime capability. |
| User message | Upstream UserMessage presentation | Legacy timeline renders the normal-mode message | `assistant-ui-canonical` | Use upstream presentation in assistant-ui mode. |
| Assistant message | Upstream AssistantMessage presentation | Legacy timeline renders the normal-mode message | `assistant-ui-canonical` | Use upstream presentation in assistant-ui mode. |
| Markdown text | Upstream message text and Markdown presentation | Legacy message components render normal-mode text | `assistant-ui-canonical` | Use upstream presentation in assistant-ui mode. |
| Reasoning | Reasoning group, root, trigger, content, and text | `agent-reasoning` overrides `conversation.message.reasoning` | `assistant-ui-canonical` | P3R-4A disables `agent-reasoning-main` in assistant-ui mode. |
| Tool Group | Upstream ToolGroup | `agent-tool-activity` declares the semantic Tool Item child Slot | `assistant-ui-canonical` | Preserve upstream ToolGroup through the explicit default Renderer Plugin mounted in AppUIModel. |
| Tool Item | Upstream ToolFallback; named upstream Tool UI retains precedence | `agent-tool` overrides `conversation.message.tool-item` | `assistant-ui-canonical` | Preserve upstream ToolFallback through the explicit default Renderer Plugin; named Tool UI retains precedence. |
| Message Attachments | Upstream UserMessageAttachments and attachment presentation | `agent-message-attachments` overrides `conversation.message.attachments` | `assistant-ui-canonical` | P3R-4A disables `agent-message-attachments-main` in assistant-ui mode. |
| Sources | Source data can be expressed, but the pinned version has no sufficient default Sources presentation | `agent-message-sources` renders the product Sources UI | `agent-ui-extension` | Keep `agent-message-sources-main` enabled. |
| Error presentation | Upstream thread and message error presentation | AgentUICreator retains product diagnostics and transport policy | `assistant-ui-with-agent-ui-adapter` | Reuse upstream UI while retaining AgentUICreator error-policy integration. |
| Action bar | Upstream message action bar primitives | Legacy message actions remain in the normal path | `assistant-ui-canonical` | Use upstream default in assistant-ui mode; prove product action parity before deletion. |
| Branch picker | Upstream branch picker primitives | No canonical AgentUICreator replacement is required | `assistant-ui-canonical` | Use upstream presentation when branching data is available. |
| Thread List | ThreadList, ThreadListItem, search, loading, and New primitives | `assistant-ui-thread-list` binds the Conversation Service catalog and history hydration | `assistant-ui-with-agent-ui-adapter` | P3R-4D uses the pinned native ThreadList; AgentUICreator supplies live/history identity, catalog data, disabled-navigation policy, and the list error/retry extension. |
| Conversation persistence | No ownership of AgentUICreator product persistence policy | Conversation Service owns list, identity, persistence, and selection policy | `agent-ui-extension` | Retain the service and expose data to upstream presentation through an adapter. |
| Inspector | No AgentUICreator workspace diagnostics surface | `workspace-inspector` owns product diagnostics | `agent-ui-extension` | Retain; consume the AgentUICreator observation contract. |
| Tool detail | Tool fallback is not the product Inspector detail surface | `agent-tool-detail` owns Inspector tool details | `agent-ui-extension` | Retain as an Inspector capability. |
| Resources | No AgentUICreator application-resource panel | `antd-x-resources` owns the current resource panel | `agent-ui-extension` | Retain as a product extension. |
| Auth / Application Gate | No AgentUICreator application lifecycle gate | Application Gate owns readiness, auth, and recovery policy | `agent-ui-extension` | Retain outside assistant-ui presentation ownership. |

## 4. Structural hosts and legacy-only implementations

These classifications apply to concrete AgentUICreator components and Plugin
instances. They do not change Slot IDs or move Slot ownership.

| Component or instance | Target status | P3R-4D state |
| --- | --- | --- |
| `conversation-surface` / `agent-conversation-surface-main` | `structural-host` | Enabled; owns `workspace.conversation` and hosts the assistant-ui adapter. |
| `agent-message-list` / `agent-messages-main` | `structural-host` | Enabled; declares message child Slots and passes through the upstream timeline. |
| `agent-tool-activity` / `agent-tool-activity-main` | `structural-host` | Enabled; declares `conversation.message.tool-item` and passes through upstream ToolGroup. |
| `agent-reasoning` / `agent-reasoning-main` | `legacy-only` | Disabled only in assistant-ui mode; retained and enabled in normal mode. |
| `agent-tool` / `agent-tool-message-main` | `legacy-only` | Disabled only in assistant-ui mode; retained and enabled in normal mode. |
| `agent-message-attachments` / `agent-message-attachments-main` | `legacy-only` | Disabled only in assistant-ui mode; retained and enabled in normal mode. |
| `agent-thread-welcome` / `agent-welcome-main` | `legacy-only` | Disabled only in assistant-ui mode; application conversation config remains the adapter configuration source. |
| `agent-suggestions` / `agent-prompts-main` | `legacy-only` | Disabled only in assistant-ui mode; assistant-ui runtime suggestion scope remains the adapter configuration source. |
| `agent-composer` / `agent-sender-main` | `legacy-only` | Disabled only in assistant-ui mode; application/runtime source owns presentation defaults. |
| `agent-conversations` / `agent-conversations-main` | `legacy-only` | Enabled in normal mode and disabled only in assistant-ui mode; retained for the normal-mode A/B path and remains a P3R-6 deletion candidate. |
| `assistant-ui-thread-list` / `assistant-ui-thread-list-main` | `assistant-ui-with-agent-ui-adapter` | Disabled in normal mode and enabled only in assistant-ui mode; renders the pinned ThreadList from the Conversation Service-backed thread catalog. |

The following transitional presentation Plugin remains enabled in P3R-4D:

| Instance | Target status | Reason for deferral |
| --- | --- | --- |
| `agent-message-sources-main` | `agent-ui-extension` | The pinned upstream presentation is insufficient. |

## 5. P3R-4D projection policy

The base `app-ui.json` remains the legacy-compatible model. The assistant-ui
mode projection uses explicit instance IDs; it does not infer ownership from a
Plugin ID substring, Slot prefix, or capability keyword.

```text
assistantUiSpike=1
  -> agent-conversation-surface-main enabled
  -> assistant-ui-conversation-spike-main disabled
  -> agent-conversations-main disabled
  -> assistant-ui-thread-list-main enabled
  -> agent-reasoning-main disabled
  -> agent-message-attachments-main disabled
  -> agent-tool-message-main disabled
  -> agent-welcome-main disabled
  -> agent-prompts-main disabled
  -> agent-sender-main disabled
  -> agent-messages-main enabled
  -> agent-tool-activity-main enabled
  -> Sources Plugin remains enabled
```

Disabling an instance in this projection does not delete its Plugin definition,
source, Registry entry, or base AppUIModel instance. Those remain required by
the normal-mode A/B path. P3R-4D adds the recorded ThreadList policy seam and a
Conversation Service thread binding; Runtime ownership and wire lifecycle remain
unchanged.

## 6. Future Creator rule

Before creating or injecting an Agent UI presentation component, the Creator
must resolve its ownership from this matrix:

```text
assistant-ui-canonical
  -> do not create a parallel AgentUICreator presentation component

assistant-ui-with-agent-ui-adapter
  -> extend or integrate assistant-ui

agent-ui-extension
  -> AgentUICreator implementation is allowed
```

`structural-host` remains available for semantic composition without taking
leaf presentation ownership. `legacy-only` is not a valid target for new work.
Creator enforcement is intentionally deferred until the adapter migrations are
complete; this phase records the policy only. An empty Renderer Slot is an
intentional no-op, not a request to recreate the canonical presentation.

## 7. Phase boundary

P3R-4D does not make assistant-ui the default mode and does not delete legacy
code. It integrates the native ThreadList only in the explicit assistant-ui
projection; final legacy deletion remains a P3R-6 concern.

## 8. Canonical leaf presentation and locale boundary

Canonical assistant-ui Plugins are semantic composition units. They decide
whether a capability is mounted and which semantic Slot receives it; they do
not own canonical labels, icons, aria text, tooltips, or translations.

The default presentation remains upstream-owned and is exposed through the
`@agent-ui/react` facade when an integration seam is required. In particular,
the following canonical Plugins must not inject or read `agent-ui.locale`:

```text
assistant-ui-copy-action
assistant-ui-reload-action
assistant-ui-export-markdown-action
assistant-ui-message-footer
assistant-ui-composer
assistant-ui-add-attachment-action
assistant-ui-dictation-action
assistant-ui-submit-action
```

AgentUICreator-owned UI such as thread-list extensions, theme controls,
Inspector surfaces, and application gates may continue to use
`AgentUILocaleService`. Future assistant-ui localization must enter through a
single complete adapter at the canonical facade boundary rather than through
individual action Plugins.

### Canonical defaults and intentional adaptations

The canonical facade preserves these pinned assistant-ui defaults:

```text
- Composer Add Attachment: direct upstream reuse
- Composer Dictation: thin facade mirror
- Composer Submit: thin facade mirror
- Copy / Reload: thin facade mirror
- Branch Picker: thin facade mirror
```

The following are intentional composition adaptations rather than upstream
presentation replacements:

```text
- Composer child Slots
- Footer child action Slots
- Export Markdown promoted from the upstream More menu to a direct action
- Stable data-slot hooks used only for tests and composition diagnostics
```
