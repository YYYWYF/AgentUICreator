# Conversation History / LangGraph Checkpoint Matrix

Conversation History hydrates persisted LangGraph `StateSnapshot` data into the
existing assistant-ui Thread. It does not replay AG-UI events or start an
Agent run when a history item is selected.

```text
Live:
Mock / Real Agent → AG-UI → useAgUiRuntime

History:
Mock / Real Conversation API
→ LangGraph StateSnapshot
→ state.values.messages
→ assistant-ui LangChain converter
→ the current Thread in useAgUiRuntime
```

History hydration != AG-UI event replay. `packages/mock-agent` owns live
protocol and presentation scenarios. `examples/agent-frontend/dev-mock/conversations`
owns synthetic LangGraph snapshots. The two catalogs can be enabled
independently.

## History Fixtures

| Fixture | Text | Reasoning | Completed Tool | Image / File Parts | Long Transcript |
|---|---:|---:|---:|---:|---:|
| `mock-history-basic` | ✅ | | | | |
| `mock-history-tool` | ✅ | | ✅ | | |
| `mock-history-reasoning` | ✅ | ✅ | | | |
| `mock-history-frontend-tool` | ✅ | | ✅ | | |
| `mock-history-attachments` | ✅ | | | ✅ | |
| `mock-history-long` | ✅ | | | | ✅ |

Historical image and file content blocks use the official LangGraph converter
and the Thread's message-part renderers. Persisted source citations and the
separate composer attachment-chip collection are `DEFERRED`; they are not
encoded as private checkpoint fields. Live AG-UI Sources are also `DEFERRED`
for the current `@ag-ui/core` 0.0.59 profile. The mock catalog records these
gaps instead of implying support.

## Contract Boundaries

The Conversation API detail contains a LangGraph StateSnapshot envelope:

```ts
{
  id: string;
  title: string;
  state: {
    values: { messages?: unknown[]; [key: string]: unknown };
    // Other StateSnapshot fields remain open.
  };
  agentState?: unknown;
}
```

Only `state.values.messages` is projected into the conversation transcript.
Unknown `values` and snapshot fields remain accepted. `state.values` does not
become AG-UI application state; only the explicit `agentState` field is
provided as loaded thread state.

`packages/runtime-conversation/src/history/langchain-history-projector.ts` is
the sole direct import boundary for `@assistant-ui/react-langgraph`. It uses
the upstream `convertLangChainMessages` function, then
`@assistant-ui/react.unstable_convertExternalMessages` to hydrate assistant-ui
messages. History selection changes the existing Runtime thread and its
read-only policy. Returning to Live restores that thread's captured transcript.

## Development Defaults

The example frontend defaults to `VITE_CONVERSATION_DATA_MODE=empty`:

```text
Mock Agent: available through its AG-UI endpoint
Mock History: disabled; Thread List is empty
```

Set `VITE_CONVERSATION_DATA_MODE=mock` to enable the mock history API. The Vite
`/__agent-ui/mock-data` endpoint remains registered for explicit mock mode and
E2E use. A configured application Conversation API endpoint takes precedence.
