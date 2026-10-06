# Message Feedback and follow-up Queue

Feedback is an application UI action, not an Agent inference event. Generated `Agent` and `ConversationRuntimeProvider` accept `ConversationFeedbackAdapter`; the Host receives the owned `threadId`, `messageId`, `type` and optional `comment`. No AG-UI feedback event or run is emitted. The `assistant-ui-feedback-actions` Plugin uses native positive/negative primitives on the response tail and hides when the Host does not supply an adapter.

Selection is optimistic and owned by assistant-ui (`metadata.submittedFeedback`), while persistence belongs to the Host. Synchronous and asynchronous persistence errors enter `onError`; no custom rollback or feedback cache is maintained. History must preserve `submittedFeedback` to restore selection after reload. This release has no comment dialog, but the Host contract forwards comments.

Direct Runtime Provider callers retain `enableMessageQueue=false` by default. Newly generated Agent applications pass `conversationMessageQueueEnabled=true` from the application-owned conversation config. Queue is a Runtime capability and canonical Composer presentation; there is no Queue Plugin or AppUIModel queue state. Canonical Composer renders attachments, quote/beforeInput, pending text/removal, input and actions. During a run, Send (Queue message) and Stop coexist when queue is supported.

All enqueue/drain/remove, client-tool and interrupt hold, cancellation pause, and edit/reload clearing behavior belongs to pinned assistant-ui. Only Text and Remove are presented; there is no immediate steering, editing or reordering UI. Composer Send and Enter use upstream dispatch. Programmatic `AgentRuntime.sendMessage()` retains its single-flight Busy contract.

Queue is ephemeral browser Runtime memory, isolated per mounted Thread. Pending messages are not guaranteed to survive refresh; Server Run Resume is a separate capability. No private Queue AG-UI events, durable protocol, custom store, or serialized upstream queue cache is introduced. Remaining queued messages dispatch as ordinary AG-UI runs after the active run settles.

## Pinned upstream limitation

With `@assistant-ui/react 0.15.23` / `react-ag-ui 0.0.63`, a follow-up queued **before** the active run hands off to a client tool can drain at the network run's falling edge, before the tool executor reports busy. The next append can auto-cancel the unresolved tool. Sending a follow-up while the client tool is already executing correctly holds it until the continuation settles. The integration suite records the earlier-handoff case as an expected failing regression (`it.fails`), so an upstream fix makes that sentinel require review. This release follows the requested no-fork boundary and does not add a local queue state machine; it does not claim that earlier-handoff case is resolved.
