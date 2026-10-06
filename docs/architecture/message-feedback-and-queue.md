# Message Feedback and follow-up Queue

Feedback is an application UI action, not an Agent inference event. Generated `Agent` and `ConversationRuntimeProvider` accept `ConversationFeedbackAdapter`; the Host receives the owned `threadId`, `messageId`, `type` and optional `comment`. No AG-UI feedback event or run is emitted. The `assistant-ui-feedback-actions` Plugin uses native positive/negative primitives on the response tail and hides when the Host does not supply an adapter.

Selection is optimistic and owned by assistant-ui (`metadata.submittedFeedback`), while persistence belongs to the Host. Synchronous and asynchronous persistence errors enter `onError`; no custom rollback or feedback cache is maintained. History must preserve `submittedFeedback` to restore selection after reload. This release has no comment dialog, but the Host contract forwards comments.
