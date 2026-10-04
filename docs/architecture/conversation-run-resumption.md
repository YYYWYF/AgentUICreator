# Conversation run resumption

Persistence loads a history snapshot and, only when that snapshot has an existing
server run to consume, supplies `ConversationLoadedThread.resume`. The capability
belongs to that thread and receives an `AbortSignal`. Its text values are full
snapshots of the continuation segment; the persisted partial message remains in
history, so the stream must exclude its text.

```text
Persistence
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

The mock demonstration uses a process-owned run. A production backend can supply
the same capability without adopting the mock's HTTP routes or replay strategy.
