# Agent Connection and Preview Source

Creator owns one workspace-local development connection in
`.agent-ui/connection.local.json`. It contains `activeSource` (`mock` or
`connected`) and an optional HTTP(S) AG-UI `endpoint`. A missing file triggers
first-choice onboarding. Settings → Agent preserves the connected endpoint
when selecting Mock. The store writes an exact `/connection.local.json` entry
to `.agent-ui/.gitignore`; recordings remain shareable. Credentials in URL userinfo
are rejected. Authentication secrets are not part of this contract.

The address panel accepts relative paths. On save it requests the current
business-page URL over the existing authenticated Host MessageChannel and resolves
with browser URL semantics (`/agent` against the page origin, `./agent` against
the page directory). The reply is correlated to the selected workspace/request
and its origin must match the connected Host. Both direct and forwarding modes
persist and use the resolved absolute URL. An unavailable Host URL fails explicitly;
Creator's own origin is never a fallback. Server/store inputs remain absolute.

The optional `enabled` flag defaults to true for existing settings. Turning off
the temporary connection persists `enabled: false` while retaining the selected
source, endpoint and connection mode. The authenticated preview bridge clears its
override and the Host resumes its application endpoint, history and session
configuration. The choice survives reconnect/reload; selecting an address or Mock
explicitly enables it again. Disabled connections cannot use Creator's Mock,
Agent proxy or auxiliary backend routes. This stops temporary routing, not the
user's backend process or Creator itself. Run-switching guards also apply here.

The canonical Host application template distinguishes an incomplete Creator
handshake (`undefined`) from a completed handshake using the application (`null`).
This keeps a workbench iframe visible when it starts with a disabled connection.
Previously generated Host application copies need this template adaptation;
Creator does not overwrite customized project application files automatically.

Creator's private execution state lives under `.agent-ui/creator/`. Existing
`.agentui` connection and Mock data migrates into `.agent-ui`; existing
`.agentuicreator` logs, transaction records and control files migrate into
`.agent-ui/creator` on first Creator access. Migration preserves existing files
and stops with a conflict if the old and new locations contain different data
at the same path.

The selected Source configures the existing Conversation Runtime. It does not
create a second runtime or alter AG-UI ownership. A changed source identity
remounts the entire Agent session, including thread binding, services and
frontend tool runtime. Preview does not inherit a product initial thread; Mock
also does not inherit the product's durable run-resume provider. Runtime run
state (including awaiting input) disables changes in the Creator UI. The Host
additionally rejects changes while preview HTTP streams are active.

## Development routing

The workbench sends resolved source inputs over the existing origin-validated
iframe MessageChannel. The Host-only Vite overlay proxies fixed paths to the
Creator dev server with an immutable workspace ID. An ID mismatch is rejected.
The Host's own Vite configuration and production dependencies remain independent
of Creator. An embedded Creator panel can manage the persisted workspace choice;
source application requires the configured Workbench Host preview bridge.

| Source | Runtime endpoint | Conversation data |
| --- | --- | --- |
| Mock | `/__agent-ui/mock` | `/__agent-ui/mock-data` |
| Connected | `/__agent-ui/agent-proxy/run` | Product `conversationDataEndpoint` |
| Temporary connection off | Product `endpoint` | Product conversation configuration |

Mock requests reuse CreatorMockService's selected builtin demo, local recording
and timing scale. Builtin preview state remains available. Starting/stopping the
standalone Mock service still controls its separately published local address;
preview uses the fixed Creator route without requiring that service to start.

Creator also owns `/__agent-ui/mock-data`, with separate conversation handler
state per workspace. CreatorMockService owns a durable store per project root;
Mock run creation and the same workspace's history/resume handler receive that
identical store. Lists, snapshots and resume subscriptions never read the
standalone Mock plugins' process-global compatibility store. Switching away
preserves the original run for return/reconnect without exposing it to another
workspace, even if both projects use the same thread ID.
Both list/detail and deletion use the workspace routing
header and require Mock Source. The Host preview plugin explicitly proxies this
path to Creator. The workbench overlay removes example-owned Mock conversation
plugins; ordinary user Hosts need neither that plugin nor a Mock npm dependency. Creator owns the tooling Mock implementation. Its public `@za38.03/agent-ui-creator/mock-agent` entry supports only official Mock scenarios and JSONL playback; custom scenario definitions and execution callbacks remain private.

The connected proxy reads its target only from the workspace store. Query strings,
methods, end-to-end headers, bodies, status and streamed response bytes are
forwarded. Hop-by-hop and workspace routing headers are removed. SSE is flushed
incrementally with `no-cache, no-transform` and `X-Accel-Buffering: no`.
Disconnects destroy the upstream request. Redirects are rejected, avoiding an
implicit change of configured target. Localhost and LAN endpoints are supported.
The transport does not parse, buffer or reserialize AG-UI. `Selected` indicates
source selection only, not a connectivity probe. Cookie and Set-Cookie currently
follow the end-to-end forwarding policy; origin-scoped authentication/header
policy remains a separate prerequisite for adding Agent authentication.

## Local playback isolation

User operation, supported formats and file limits are maintained in the [public playback guide](../../../mock/local-recordings.md). The Host owns filesystem access through `LocalMockRecordingStore`: read only immediate supported files under the selected project's `.agent-ui/mocks/`, reject symlinks and paths resolving outside that project, and bound reads. Valid and invalid results are cached by path, timestamp and size with bounded retention; there is no filesystem watcher.

The filename supplies `local:<filename>` and its extension-free display title; no manifest is required and supported extensions are case-insensitive. The panel refreshes through its current load/retry and workspace lifecycle, includes line-level errors for invalid files, and searches recordings and builtin demos together. An explicit scenario query continues to select a builtin demo.

The clipboard/JSONL parser accepts SSE, EventStream selections, consecutive JSON events and explicit `{ atMs, event }` entries. It handles BOM, CRLF/CR/LF, localized headers and whitespace outside JSON strings without trimming payload strings. EventStream time columns become relative milliseconds; equal times and midnight rollover are supported, while missing/decreasing times and invalid/truncated events fail. Events still pass installed AG-UI schemas and file/count/time bounds.

Playback has one identity map per request. Thread/run identities bind to the current request; parentRunId binds separately and is omitted when no parent exists. Message, tool, subagent and interrupt identities, reasoning entity references, snapshots and RUN_STARTED input references use consistent request-scoped mappings. Application state, tool arguments, text, metadata and opaque custom payloads are preserved.

Abortable delays use `(current.atMs - previous.atMs) * timingScale`. Each request snapshots its source and speed. Panel changes do not rewrite active playback, and recordings do not automatically install or enable Plugins. Parsing/playback through the public Mock entry does not grant filesystem access or arbitrary scenario callbacks.

The state API reports `selection: { type: "builtin" | "recording", id }`, projectId, recordings and optional recordingsError; scenarioId retains the builtin selection. POST /select accepts either builtin scenarioId/speed or recording selection/projectId/speed. The Host checks the selected project before and after loading. Switching projects clears recording selection and restores the builtin default; a missing/invalid file fails before SSE starts. Started playback retains only its loaded snapshot and cannot read another project's files.

## Auxiliary backend transport

Generated applications export `createAgentBackendTransport()` and its `fetch`
port. Product adapters explicitly use this transport; global `fetch` is unchanged.
The conversation data-source adapter injects this port into
`createHttpConversationDataSource`. Other file/business adapters can opt in:

```ts
import { createAgentBackendTransport } from "./agent-ui";
const backend = createAgentBackendTransport();
await backend.fetch("/api/files", { signal });
```

During Connected preview, an explicit root-relative product path uses
`/__agent-ui/backend` and is forwarded to the configured Agent endpoint's origin.
For `http://localhost:8000/api/agent`, `/api/conversations` becomes
`http://localhost:8000/api/conversations`. No Agent path is inferred or appended.
Absolute URLs and non-string request inputs retain their product-defined routing.
Mock history uses its override and does not use the connected backend transport.

In production the generated transport calls the product fetch implementation
(direct fetch by default, injectable with `{ fetch }`). Preview globals and
Creator routing are ignored. Static deployments still require Agent CORS or a
host/platform proxy. Creator does not ship a production proxy or runtime.

## Verification boundary

Transport/store unit tests cover streaming before completion, cancellation,
header/body/query preservation, locked switching, fixed-target redirects,
workspace isolation, persistence and auxiliary path routing.

The isolated Playwright suite runs with
`pnpm --filter @za38.03/agent-ui-creator-workbench test:e2e:agent-connection`.
It creates a disposable generated Host without Mock dependencies or Mock Vite
plugins. Only unrelated Creator workspace metadata is supplied by the test;
the Creator UI, preview bridge, generated Plugins and HTTP routes are real.
