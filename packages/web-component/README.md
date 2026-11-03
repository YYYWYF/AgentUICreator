# Web Component Compatibility Bridge

`@za38.03/agent-ui-web-component` mounts the existing React Agent UI inside `<agent-ui>`.
It is a compatibility host, with one assistant-ui / AG-UI Runtime per element.
It bundles React, React DOM, assistant-ui and the official embedded preset's
React plugins. Host applications do not declare React or compile TSX.

Install in the consuming project:

```sh
pnpm add @za38.03/agent-ui-web-component
```

For module-based applications, use the public registration entry:

```ts
import "@za38.03/agent-ui-web-component/register";
const element = document.createElement("agent-ui");
element.config = {
  endpoint: "/agent",
  locale: "zh-CN",
  theme: "violet",
};
document.body.append(element);
```

For a plain HTML host, the standalone script ships in this package at
`dist/agent-ui.js`, exposed as
`@za38.03/agent-ui-web-component/agent-ui.js`. Create
`scripts/copy-agent-ui.mjs` in the consuming project:

```js
import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir("public", { recursive: true });
await copyFile(
  require.resolve("@za38.03/agent-ui-web-component/agent-ui.js"),
  "public/agent-ui.js",
);
```

Run `node scripts/copy-agent-ui.mjs` from the project root. Adapt `public/` to
the Host's static directory and deploy the file with the application. Load its
served URL with a classic script:

```html
<script src="/agent-ui.js"></script>
<agent-ui endpoint="/agent" locale="zh-CN" theme="violet"></agent-ui>
```

`/agent-ui.js` assumes the copied file is served at the site root; installing
the package alone does not create that URL. Adjust it for subdirectory hosting.
After upgrading the package, rerun the copy and deploy the new static file using
the Host's resource versioning/cache policy. Module consumers rebuild and redeploy.

The public ESM entries are `@za38.03/agent-ui-web-component/register` and
`@za38.03/agent-ui-web-component`; both resolve to `dist/agent-ui.es.js` and
register the element. Types are available from the package root and resolve to
`dist/types.d.ts`. Use public entries in application imports rather than deep
`dist/` paths. Customized producer projects generate a separate ESM bundle
described below; load that instead of registering the default package as well.
All CSS, including imported Plugin CSS, is inside the scripts and is inserted
only into the element's open Shadow Root. No global stylesheet is required.
The element fills the viewport by default (`100dvh`). Set its height in the Host
when embedding it in a smaller region, for example `agent-ui { height: 420px; }`.
The shared `--agent-ui-height` CSS property also sizes native React roots and Web
Components. Typography inherits from the Host mount in both integrations; the
official presentation keeps the canonical Agent UI typography boundary.

## Host contract

`config` is the data entry. `endpoint`, `locale`, `theme`, `thread-id` attributes
supply defaults for properties not present in `config`. Assign a new config
object to update it; modifying the getter's returned object does not update UI.
Removing an attribute restores its default. Properties assigned before bundle
registration are upgraded when the element connects. Registration is idempotent.

- `endpoint`: existing AG-UI API, default `/agent`.
- `locale`: `en-US` or `zh-CN`, through the existing locale layer. When omitted,
  use the producer project's `agentUILocaleConfig.defaultLocale` (official default `zh-CN`).
- `theme`: `violet`, `light` or `dark`, through the existing theme service. When
  omitted, the runtime starts with the built-in `violet` theme and the internal
  picker can change it. Project settings contain no theme selection. An explicit
  property/attribute controls the theme; accept picker requests by updating it
  from the `theme-change` event.
- `threadId`: persisted conversation to reopen, through the existing thread binding.
History routes/authentication and upload/transcription/feedback services belong to
the generated React producer implementation. Creator connects or changes them
there before rebuilding; only the AG-UI endpoint is an external connection option.

- `appUIModel`: the **existing** AppUIModel schema, limited to bundled official
  plugins. No alternate Vue schema or arbitrary component registration.

Events are `CustomEvent`s with `bubbles: true` and `composed: true`:

| Event | Detail | Meaning |
| --- | --- | --- |
| `agent-ready` | `{ threadId }` | Valid composition mounted with the canonical Runtime; not a network-health promise |
| `thread-change` | `{ threadId }` | Initial or subsequently active identity |
| `theme-change` | `{ theme }`; a picker request. Update the controlled theme to accept it |
| `agent-error` | `{ code, error }` | Configuration/composition or Runtime error; backend detail is data |

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
pnpm --filter @za38.03/agent-ui-web-component build
pnpm --filter @za38.03/agent-ui-web-component test
pnpm --filter @za38.03/agent-ui-web-component test:distribution
pnpm --filter @za38.03/agent-ui-web-component-vue3-demo dev
pnpm dev:vue-host
```

Build preparation generates disposable `.generated` sources from the official
Source Registry embedded preset, using the same bootstrap as React Hosts. It does
not copy an example Host, patch vendor source or ship Creator/operator.
Build tools are development dependencies; the final bundle is standalone.
`AGENT_UI_HOST_PACKAGES_PREPARED=1` reuses already-built workspace dependencies.
Both demos consume the built bundle, serve the existing mock AG-UI/history APIs,
and deliberately apply hostile Host CSS. Vue's wrapper uses `createElement`, so
custom-element template compiler configuration is unnecessary.

## Install and customize the producer project

`/install web-component-bridge` discovers the compatibility resource through the
existing official resource catalog and dependency/install/apply mechanism. Its
kind is `compatibility`, with `vue`, `legacy` and `html` targets. It does not add a
framework renderer or change UI Plugin manifest kinds.

The resource installs a project-owned library entry and build configuration:

```sh
pnpm exec vite build --config src/agent-ui/integrations/web-component-bridge/vite.config.ts
```

Adjust `src/agent-ui` to the project's configured sourceRoot. The result is
`dist/agent-ui-web-component/agent-ui.js`, an ESM bundle with Shadow CSS included.
Load this compiled file in the Vue/HTML consumer. The build configuration and
React dependencies live in the canonical Agent UI **producer** project. The Vue
consumer only loads the output. Edit the producer's AppUIModel and React Plugins,
then rebuild; the consumer does not gain a separate set of Plugins.

The default package preset and native React Hosts share the generated
`application/AgentSurface.tsx`. `AgentUIBridgeRoot` reexports the product-owned
compatibility composition. `@za38.03/agent-ui-web-component/host` exports the thin Custom
Element factory used by project-specific bundles, without importing the default
preset. Ordinary React entries never load that factory or create Shadow DOM.

```sh
pnpm test:web-component
```

This verifies element lifecycle, standalone distribution, resource installation,
local Plugin edits reaching the bundle, a fresh native React build/typecheck, and
four Chromium/Vue acceptance cases. Browser checks cover streaming, Markdown,
tools, Slash, Quote, attachments, history identity, theme/locale updates, portals,
errors, CSS isolation, unmount/remount and one request per send. Mock endpoints
provide browser evidence; real backend acceptance and npm publishing are separate.
Pristine assistant-ui vendor sources remain unchanged.

The bridge targets modern browsers with Custom Elements, Shadow DOM and the
existing React Runtime browser APIs; “legacy” describes the Host framework, not
Internet Explorer support. Package `agentUICompatibility` metadata describes the
compatibility target only and does not extend the UI Plugin manifest schema.
