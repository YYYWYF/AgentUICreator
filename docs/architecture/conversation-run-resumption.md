# Conversation run resumption

Persistence loads a history snapshot and, only when that snapshot has an existing
server run to consume, supplies `ConversationLoadedThread.resume`. The capability
belongs to that thread and receives an `AbortSignal`. Each update is an
AgentUICreator-owned assistant run snapshot: optional Conversation content parts,
status, and metadata/state. Content snapshots cover the continuation segment;
the persisted partial message remains in history and must be excluded. The
runtime provider maps these updates to assistant-ui run results, leaving message
merge to assistant-ui.

```text
Application-owned resume provider (optional for generated Agent)
  -> createConversationServiceThreadBinding
  -> ConversationLoadedThread.resume
  -> ConversationRuntimeProvider
  -> assistant-ui ThreadHistoryAdapter
  -> existing run stream
```

The provider maps this capability to the pinned assistant-ui `unstable_resume`
and `resume()` API. That API stays inside `runtime-conversation`.

1. No guessing from message status or unfinished tools.
2. No fallback that starts a new Agent run after resume fails.
3. Resume is optional; ordinary history keeps its existing load behavior.
4. A future assistant-ui API change should be confined to this adapter.

The generated Agent accepts an optional `runResumeProvider`. It receives the
loaded Conversation detail and projected messages and returns a capability only
for an existing durable run paired with that snapshot. With no provider, history
loads messages and state as before. All generated Modes share this path. The mock
demonstration uses a process-owned run; production backends need not adopt its
HTTP routes or replay strategy.

Follow-up: distinguish user-initiated Stop from refresh/unmount transport detach.
Detach must allow a durable backend run to continue; explicit Stop should be
able to cancel it. The local resume `AbortSignal` alone cannot represent remote
cancellation because refresh/unmount aborts that consumer too.
In the sandbox development server, open `/?run-resume-demo`, send the long task,
and refresh after its first paragraph. The demo reads the server snapshot and
shows the server's Agent invocation count beside the resumed conversation.
