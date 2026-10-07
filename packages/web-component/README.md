# Web Component Compatibility Bridge

`@agentui/web-component` mounts the existing React Agent UI inside `<agent-ui>`.
It is a compatibility host, with one assistant-ui / AG-UI Runtime per element.
It bundles React, React DOM, assistant-ui and the official embedded preset's
React plugins. Host applications do not declare React or compile TSX.

```ts
import "@agentui/web-component";
const element = document.createElement("agent-ui");
element.config = {
  endpoint: "/agent",
  conversationDataEndpoint: "/api",
  locale: "zh-CN",
  theme: "violet",
};
document.body.append(element);
```

For a plain HTML host, serve `dist/agent-ui.js` and load it with a classic script:

```html
<script src="/agent-ui.js"></script>
<agent-ui endpoint="/agent" locale="zh-CN" theme="violet"></agent-ui>
```

The ESM entry is `dist/agent-ui.es.js`; declarations start at `dist/types.d.ts`.
All CSS, including imported Plugin CSS, is inside the scripts and is inserted
only into the element's open Shadow Root. No global stylesheet is required.
Set the element's height in the Host; its default height is 600px.

## Host contract

`config` is the data entry. `endpoint`, `locale`, `theme`, `thread-id` attributes
supply defaults for properties not present in `config`. Assign a new config
object to update it; modifying the getter's returned object does not update UI.
Removing an attribute restores its default. Properties assigned before bundle
registration are upgraded when the element connects. Registration is idempotent.

- `endpoint`: existing AG-UI API, default `/agent`.
- `locale`: `en-US` (default) or `zh-CN`, through the existing locale layer.
- `theme`: `violet` (default), `light` or `dark`, through the existing theme service.
- `threadId`: persisted conversation to reopen, through the existing thread binding.
- `conversationDataEndpoint`: existing history API base, e.g. `/api`. Uses the same
  `GET/DELETE {base}/conversations` and `{base}/conversations/{id}` implementation.
  With no base, history uses the existing empty data source. A persisted `threadId`
  needs a working history API. Authentication follows existing same-origin fetch
  behavior; credentials and backend upload policy belong to the Host.
- `appUIModel`: the **existing** AppUIModel schema, limited to bundled official
  plugins. No alternate Vue schema or arbitrary component registration.
- `attachmentAdapter`: the existing Host-owned assistant-ui attachment adapter.
  Upload/storage is not implemented by the bridge. Demos use the existing mock adapter.

Events are `CustomEvent`s with `bubbles: true` and `composed: true`:

| Event | Detail | Meaning |
| --- | --- | --- |
| `ready` | `{ threadId }` | Valid composition mounted with the canonical Runtime; not a network-health promise |
| `thread-change` | `{ threadId }` | Initial or subsequently active identity |
| `error` | `{ code, error }` | Configuration/composition or Runtime error; backend detail is data |

Connection identity changes (`endpoint`, `threadId`, history base) restart the
session, cancelling the active run. Locale/theme changes preserve drafts and the
Runtime. Disconnect unmounts React, cancels the active run and disposes services;
a synchronous DOM move preserves the session. Reconnecting mounts a fresh session.
Each element has its own composition store and services. No window-level bridge
listener or global mutable Host configuration is installed.

## Build and examples

From this repository:

```sh
pnpm install
pnpm --filter @agentui/web-component build
pnpm --filter @agentui/web-component test
pnpm --filter @agentui/web-component test:distribution
pnpm --filter @agent-ui/web-component-vue3-demo dev
pnpm --filter @agent-ui/web-component-legacy-demo dev
```

Build preparation generates disposable `.generated` sources from the official
Source Registry embedded preset, using the same bootstrap as React Hosts. It does
not copy an example Host, patch vendor source or ship Creator/project-control.
Build tools are development dependencies; the final bundle is standalone.
`AGENT_UI_HOST_PACKAGES_PREPARED=1` reuses already-built workspace dependencies.
Both demos consume the built bundle, serve the existing mock AG-UI/history APIs,
and deliberately apply hostile Host CSS. Vue's wrapper uses `createElement`, so
custom-element template compiler configuration is unnecessary.

This first phase does not publish to npm, add `/install` framework detection,
create Vue 2 wrappers, Vue feature plugins, Vue slots, Vue Tool UI registration,
or a second renderer. Browser/visual acceptance is separate and was not run for
this change. The existing product Portal wrappers target `AgentUIRoot` inside the
Shadow Root. The product Quote adapter also listens for non-composed Shadow
Root scroll events and invokes upstream dismissal; this is replayed by its
guarded generation recipe. Pristine assistant-ui vendor sources are unchanged.

The bridge targets modern browsers with Custom Elements, Shadow DOM and the
existing React Runtime browser APIs; “legacy” describes the Host framework, not
Internet Explorer support. Package `agentUICompatibility` metadata describes the
compatibility target only and does not extend the UI Plugin manifest schema.
