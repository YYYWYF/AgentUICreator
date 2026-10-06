# Agent Connection and Preview Source

Creator owns one workspace-local development connection in
`.agentui/connection.local.json`. It contains `activeSource` (`mock` or
`connected`) and an optional HTTP(S) AG-UI `endpoint`. A missing file triggers
first-choice onboarding. Settings → Agent preserves the connected endpoint
when selecting Mock. The store writes an exact `/connection.local.json` entry
to `.agentui/.gitignore`; recordings remain shareable. Credentials in URL userinfo
are rejected. Authentication secrets are not part of this contract.

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

Mock requests reuse CreatorMockService's selected builtin demo, local recording
and timing scale. Builtin preview state remains available. Starting/stopping the
standalone Mock service still controls its separately published local address;
preview uses the fixed Creator route without requiring that service to start.

The connected proxy reads its target only from the workspace store. Query strings,
methods, end-to-end headers, bodies, status and streamed response bytes are
forwarded. Hop-by-hop and workspace routing headers are removed. SSE is flushed
incrementally with `no-cache, no-transform` and `X-Accel-Buffering: no`.
Disconnects destroy the upstream request. Redirects are rejected, avoiding an
implicit change of configured target. Localhost and LAN endpoints are supported.
The transport does not parse, buffer or reserialize AG-UI.

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
workspace isolation, persistence and auxiliary path routing. Typecheck/build
checks are engineering validation. Browser and real-Agent acceptance are not
part of this change's execution request and were not performed.
