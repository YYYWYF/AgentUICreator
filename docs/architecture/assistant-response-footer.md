# Assistant Response Group and Footer

Status: implemented; validation deferred at the user's request.

An Assistant Response is a contiguous block of assistant messages in the active
top-level Thread. Every non-assistant message is a boundary. Nested subagent
messages stay inside their tool parts. A response is independent of AG-UI runId:
tool continuation, HITL resume, and hydrated history use the same resolver.
`requestMessageId` identifies the immediate preceding boundary, including system
messages, and is null when the response begins the Thread.

`@agent-ui/react` owns the pure resolver, Response Context, and tail placement in
product-owned ComposableThread. Each assistant message retains its own
MessagePrimitive.Root, parts, identity, and upstream streaming presentation.
Only the tail renders `AssistantResponseFooter`; no response Footer is mounted
while the Thread is running, including gaps between TEXT_MESSAGE_END and the
next TEXT_MESSAGE_START. This prevents transient actions on an incomplete group.

The single semantic Slot is `assistantResponseFooter`, implemented by
`assistant-ui-response-footer`. Its scope is data-free; actions consume the
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

The visual ActionBar shell reuses upstream ActionBarPrimitive.Root, including
hover/autohide. Response actions do not use message-scoped Copy, Reload, Export,
or BranchPicker primitives. Text extraction includes only text parts, joined
with two newlines within and between messages. Copy feedback is local to the
Response action and does not update upstream message copied state. Markdown
export uses the same text.

The pinned version's public `aui.thread().message({ id: headMessageId })` client
is the equivalent of `thread.getMessageById(headMessageId)`. Reload and branch
switch delegate through that client to upstream runtime methods. Branch counts
come from the head. Capability, disabled, voice, and running policy guard
Reload; switching is disabled during a running or disabled Thread. Upstream
owns parent/source selection, branch repository behavior, and generation
lifecycle. AgentUICreator only selects the head target.

The feature does not modify vendor Elements, react-ag-ui, Runtime message models,
or AG-UI event projection. The standard `multi-message-response` Mock Scenario
runs through react-ag-ui in the integration test source. Resolver, hydration,
two-round, copy/export, reload/branch, streaming gaps, and ownership coverage are
included but have not been executed for this delivery.

## Upstream replacement condition

Reassess this adapter when upstream supplies TurnPrimitive, ResponsePrimitive,
a first-class turn/response runtime, arbitrary response targets for ActionBar,
or official multi-message grouping. When upstream covers grouping, copy,
reload, branch, and export together, delete the AssistantResponse adapter and
return to the upstream canonical implementation. Do not maintain both paths.
