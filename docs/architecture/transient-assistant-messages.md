# Transient conversation messages

Transient messages are product presentation state, separate from the canonical
assistant-ui Conversation Domain. They never enter AG-UI messages, runtime
snapshots, history exports, persistence adapters, model context, tool state or
interrupt state. No upstream source is modified.

## Calling from a Host

Create one service per Agent application at page lifetime, then pass it to the
generated Agent. The same prop is available on `ConversationRuntimeProvider`.

```tsx
import { createConversationTransientMessageService } from "@za38.03/agent-ui-plugins";
import { Agent } from "./agent-ui";

const notices = createConversationTransientMessageService();

// Render this Agent before calling the service.
<Agent transientMessages={notices} />;

// The text is application data; use your application's locale for product copy.
notices.addMessage({ role: "assistant", text: noticeText });
```

Calls target the currently selected conversation at invocation time. Calling
before the provider mounts or after it unmounts throws. Each call adds a new
entry and returns its ID. The API requires `role: "user" | "assistant" | "system"` and plain text. User messages render on the right and assistant messages on the left. System entries are centered, compact neutral pills without an avatar. They remain in the conversation flow until page reload; they are not timed or fixed-position toasts. It never
starts or resumes a run, and it works while the Agent is awaiting an interrupt
response. Do not share one service between independently mounted Agent apps.

UI plugins and Host components inside the provider may instead call:

```tsx
import { useConversationTransientMessages } from "@za38.03/agent-ui-plugins";

const { addMessage } = useConversationTransientMessages();
addMessage({ role: "system", text: systemText });
addMessage({ role: "user", text: userText });
addMessage({ role: "assistant", text: assistantText });
addMessage({ role: "assistant", type: "error", text: errorText });
```

## Display plugin and lifetime

The Source Registry item `plugin/transient-assistant-messages` installs the
`transient-assistant-messages` renderer plugin. The `conversation-surface`
semantic Slot `transientMessages` owns its contribution. Assistant, Embedded
and Platform presets include it through AppUIModel. Removing or disabling that
plugin hides notices without changing real messages or interrupt handling.
The existing plugin ID is retained for configuration compatibility; it renders
user, assistant and system roles.

The optional `type` is `"normal"` (default) or `"error"`. Error entries use the
existing message-error colors and border, including the dark theme variant.
They are announced as alerts but remain display-only: they do not set the
Agent runtime's error status, cancel a run or change pending interrupts.

Standalone package consumers can supply
`components={{ TransientMessages: ConversationTransientMessages }}` to
`ConversationThread` without Source Registry or Creator at runtime.

Entries are anchored after the real message visible when the API is called.
Later messages appear after them. If streaming replaces an optimistic message
ID, the original ordinal placement is used. A temporary entry has its own DOM
identity, not a canonical message ID: it has no retry, edit, quote, feedback or
export actions. It renders as a natural assistant bubble without a visible
temporary-message label; the role-specific accessible label uses the application locale.

The service keeps separate immutable arrays per conversation. Navigation does
not clear them. A Host-owned service also survives unmounting and remounting
the UI on the same page; a full page reload creates a new service and clears
all temporary entries. There is no localStorage, sessionStorage or server
write. Direct provider callers that omit the service get an instance scoped
to that provider's mounted lifetime.

Existing generated projects need the updated conversation foundation and
surface plugin, and installation of the new renderer plugin in AppUIModel.
No backend changes are required.

## Composer interrupt reminder

While a conversation has pending interrupts, the primary Composer remains
editable. A send click, Enter, form submission or the public Composer `send()`
action adds a centered system hint through `addMessage`, asking the user to answer
the question above. The send is handled locally: text, attachments and quotes
stay intact, with no transport, resume or cancellation. Empty drafts do not add
reminders. Repeated sends for the same pending interrupt set reveal the existing
hint instead of adding another. This Composer policy is scoped by conversation
and page-owned service, survives Composer remounts, and resets after the interrupt
is answered; generic `addMessage` calls are never deduplicated. There is no fixed banner above the input. Replying through the
interrupt's own UI still resumes normally; subsequent Composer sends work as
usual. Reminder hints share the same page-memory lifecycle as other local
messages, and require the transient-messages display plugin to be enabled.
