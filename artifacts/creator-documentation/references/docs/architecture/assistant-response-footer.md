# Assistant Response Group and Footer

The Assistant Response Footer belongs to a Conversation Turn. A Turn contains
one user request and all top-level assistant messages until the next user request.
System/tool records do not end a Turn and never participate in response actions.
Leading assistant messages without a user request form a synthetic leading Turn.
Nested subagent messages stay inside their tool parts.

`ConversationTurnGroup` is the single grouping source of truth in `@za38.03/agent-ui-plugins`:

```text
ConversationTurnGroup
  +-- tailAssistantMessageId: Footer owner
  +-- assistantMessageIds: Copy / Export text
  +-- headAssistantMessageId: Reload / Branch target and branch state
  +-- requestMessageId: user request, or null for a leading Turn
```

The pure `resolveConversationTurnGroup(messages, currentMessageId)` resolves the
visible branch. `AssistantResponseFooterHost` passes that exact group to the
Response Context; no separate response resolver, ownership projection or group
conversion determines action boundaries. Turn identity is derived from the user
message (or the first leading record), without subscribing to AG-UI run events.
Continuation runs for the same user request and restored history therefore use
the same grouping and identity. `LiveConversationTurnSource` and its provider
have been removed.

Each assistant message retains its own MessagePrimitive.Root, parts, identity,
and upstream streaming presentation. Only `tailAssistantMessageId` renders
`AssistantResponseFooter`. No Footer is mounted while the Thread is running,
including gaps between TEXT_MESSAGE_END and the next TEXT_MESSAGE_START.
AssistantMessage subscribes only to Thread running state for Footer placement;
full messages and grouping are read in AssistantResponseFooterHost, which mounts
while the Thread is not running and renders only for the Turn tail. Footer
height remains in normal layout flow.

The single semantic Slot is `assistantResponseFooter`, implemented by
`response-footer`. Its scope is data-free; actions consume the
Response Context through the facade. Copy, Reload, and Export Plugin ids remain
stable, with capability `conversation-assistant-response-action`. AppUIModel,
presets, generated Registry, Source Registry, and authoring placement use this
single response Slot. There is no parallel message Footer Slot.

Message action facade APIs retain message semantics. Separate Response APIs are:

- `ConversationResponseActionBarRoot`
- `ConversationResponseBranchPicker`
- `ConversationCanonicalResponseCopyAction`
- `ConversationCanonicalResponseReloadAction`
- `ConversationCanonicalResponseExportMarkdownAction`
- `useConversationResponseRuntime`

Footer ownership and action targets belong to the same Conversation Turn. The visual ActionBar
shell reuses upstream ActionBarPrimitive.Root with `autohide="not-last"`:
autohide/hover presentation still reads the tail Message Context's
`message.isLast` and `message.isHovering`. Hovering an earlier message in a
historical response does not reveal its Footer. Hover visibility follows the tail message context.
Response actions do not use message-scoped Copy, Reload, Export,
or BranchPicker primitives. Text extraction includes only text parts, joined
with two newlines within and between messages. Copy feedback is local to the
Response action and does not update upstream message copied state. Markdown
export uses the same text.

The pinned version's public `aui.thread.message({ id: headAssistantMessageId })` client
is the equivalent of `thread.getMessageById(headAssistantMessageId)`. Reload and branch
switch delegate through that client to upstream runtime methods. Branch counts
come from the head. Capability, disabled, voice, and running policy guard
Reload; switching is disabled during a running or disabled Thread. Upstream
owns parent/source selection, branch repository behavior, and generation
lifecycle. AgentUICreator only selects the head target.

For `User, A, System, B, C`, one Footer belongs to C. Copy and Export produce
`A\n\nB\n\nC`; System text is excluded. Reload and Branch operate on A.
A second user request starts a separate Turn and a separate Footer.

The feature does not modify vendor Elements or AG-UI event projection. Validate grouping, hydration, copy/export, reload/branch, streaming gaps and actual browser interaction for the current change; test source presence alone is not acceptance.
