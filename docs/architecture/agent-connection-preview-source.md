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
plugins; ordinary user Hosts need neither that plugin nor `@agent-ui/mock-agent`.

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
`pnpm --filter @agent-ui/creator-workbench test:e2e:agent-connection`.
It creates a disposable generated Host without Mock dependencies or Mock Vite
plugins. Only unrelated Creator workspace metadata is supplied by the test;
the Creator UI, preview bridge, generated Plugins and HTTP routes are real.

Local acceptance on 2026-10-07 passed all three browser cases:

- Mock thread list, historical messages and a new chat through Creator.
- Standalone Host mounting without a root `tsconfig.json` or Creator preview.
- A no-CORS Connected Agent displaying streamed content before completion,
  with run-time Source locking, Source isolation and endpoint retention.

Hosts without a root `tsconfig.json` now use inferred TypeScript projects for
service analysis. Their generated capability catalogs retain the Plugins'
actual service contracts rather than silently emitting empty declarations.
Generated application actions retain their identity across thread switches and
forward to the active conversation bridge, keeping application services and
pending history reads alive. The feedback Plugin declares its locale dependency.

The browser fixture includes the current Lexical package requirements, resolves
macOS temporary-directory real paths, and preloads lazy Plugin dependencies to
avoid Vite reloads during interaction. The temporary Agent rejects the empty
CORS probe rather than counting it as an AG-UI run.

CI has an `agent-connection` job in the style-isolation workflow. Creator, Mock
Agent and bootstrap changes trigger it independently of the style-isolation
suite. This acceptance uses a simulated Agent, not a live model.
