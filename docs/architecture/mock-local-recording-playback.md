# Local Mock Recording Playback

Creator can replay user-provided `.agentui/mocks/*.jsonl` recordings alongside
Builtin Demos. This is a development-only Mock Source; it does not change the
production Agent connection or Conversation Runtime and does not record real
requests.

## File format

Each nonblank line contains an AG-UI event and its relative time in milliseconds:

```jsonl
{"atMs":0,"event":{"type":"RUN_STARTED","threadId":"original-thread","runId":"original-run"}}
{"atMs":30,"event":{"type":"TEXT_MESSAGE_START","messageId":"message-1","role":"assistant"}}
{"atMs":60,"event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"message-1","delta":"Hello"}}
{"atMs":90,"event":{"type":"TEXT_MESSAGE_END","messageId":"message-1"}}
{"atMs":100,"event":{"type":"RUN_FINISHED","threadId":"original-thread","runId":"original-run","outcome":{"type":"success"}}}
```

Only immediate `.jsonl` children are read. The filename supplies the stable ID
(`local:<filename>`) and display title (without the extension); no manifest is
needed. Empty lines are ignored. Events must pass the installed AG-UI
`EventSchemas`; times must be finite, nonnegative and monotonically
nondecreasing. Limits are 8 MiB, 20,000 events and 24 hours of relative time per
file. At least one event is required. This is event playback, so the producer is
responsible for coherent lifecycle ordering and complete runs.

The panel refreshes its list every four seconds, displays invalid files with
line-level parse errors, and searches both local recordings and Builtin Demos.
Select a ready recording and send a message through the existing Mock endpoint.
The request content does not rewrite recorded output. Recordings may require
frontend resources; they do not install or enable plugins automatically.

## Ownership and replay

- Creator Host owns filesystem access through `LocalMockRecordingStore`.
  It reads only the selected project's directory, rejects files that are
  symlinks and directories that resolve outside the project, bounds reads,
  and caches valid and invalid parse results by path, timestamp and size.
  Cache retention is bounded; there is no filesystem watcher.
- `@agent-ui/mock-agent` only validates loaded data and replays events. It does
  not read project files or turn recordings into `MockScenarioStep` values.
- Recording playback uses the same abortable delay and `timingScale` semantics
  as scenarios: `(current.atMs - previous.atMs) * timingScale`, starting at zero.
- Each request has its own identity map. Thread/run IDs bind to the request;
  message, tool and subagent IDs get stable request-scoped replay IDs. Parent
  references, message snapshot identities and interrupt tool/subagent
  references share those maps. Application state, tool arguments, text,
  metadata, custom values and other opaque payloads are preserved.
- The HTTP handler accepts an optional `MockRunResolver`, resolves a source
  before opening SSE, validates events, and writes through the existing SSE
  transport. Its default scenario and durable-run paths remain in place.
- Creator snapshots the selection and speed for each request. Changing the
  panel does not alter an active playback. Explicit `?scenario=` requests
  continue to select Builtin Demos.

## Control API and project switching

The state endpoint adds `selection: { type: "builtin" | "recording", id }`,
`projectId`, `recordings` and optional `recordingsError`. The legacy `scenarioId`
continues to represent the Builtin selection for compatibility.

`POST /select` accepts either the existing `{ scenarioId, speed }` request or:

```json
{"selection":{"type":"recording","id":"local:chat.jsonl"},"projectId":"current-project-id","speed":1}
```

Recording selection validates the current project ID and file. The request
resolver checks project ID and root again before and after loading. A project
switch clears Local Recording selection and restores the default Builtin Demo;
a switch during loading fails explicitly. A deleted or invalid selected file
returns a JSON error before SSE starts. Playback already started uses its loaded
snapshot and cannot read another project's recording.

No assistant-ui/vendor code, generated-project dependencies, user recordings,
or production Runtime files are modified by this feature.
