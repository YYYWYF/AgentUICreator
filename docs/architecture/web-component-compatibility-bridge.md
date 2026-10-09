# Web Component Compatibility Bridge — Phase 1 delivery

Date: 2026-10-07. React remains the canonical framework. Vue/HTML consumers load a compiled Web Component; they do not compile React Plugins or configure React/Tailwind.

## Delivered contract

```ts
import "@agentui/web-component/register";
const element = document.createElement("agent-ui");
element.config = {
  endpoint: "/agent",
  conversationDataEndpoint: "/api",
  locale: "zh-CN",
  theme: "violet",
};
document.body.append(element);
```

The package exports ESM, automatic registration, declarations, a standalone IIFE, and a producer-only `/host` factory. Both default bundles embed their own complete styles in the open Shadow Root. The project-owned Portal wrappers use the existing `AgentUIRoot` portal container within that root.

Host events are `agent-ready`, `thread-change`, and `agent-error`, all composed and bubbling `CustomEvent`s. Property configuration overrides attribute defaults. Locale/theme changes preserve the session and draft; endpoint/thread/history-base changes start a fresh session. Disconnect disposes React and cancels an active run. Same-turn DOM moves retain the session; reconnecting after disposal creates one fresh root. Detached configuration updates no longer prevent disposal.

## Canonical composition and installation

`application/AgentSurface.tsx` owns the shared native React/compatibility UI composition. The compatibility session uses the same `ConversationRuntimeProvider`, AG-UI implementation, generated AppUIModel, services and canonical React Plugins. `AgentUIBridgeRoot` is a reexport of the generated product-owned compatibility composition. No Vue renderer, Vue Plugin, Vue schema or secondary AG-UI client was introduced.

The official `web-component-bridge` resource has `kind: compatibility` and `vue`, `legacy`, `html` targets. `/install` discovers it through the existing resource catalog and uses existing dependency planning, installation, verification and idempotence. The Source Registry implementation is an optional integration, without a new UI Plugin manifest kind or an installer framework branch.

The installed producer project builds its own AppUIModel and edited React Plugins:

```sh
pnpm exec vite build --config src/agent-ui/integrations/web-component-bridge/vite.config.ts
```

Adjust the path to the project's `sourceRoot`. Output: `dist/agent-ui-web-component/agent-ui.js`. The Vue consumer loads that compiled ESM file. React/Vite/Tailwind build dependencies belong to the producer. Creator guidance keeps all Agent UI edits in canonical React sources and instructs rebuilding this bundle.

The default command source also needed a lifecycle correction: an application-level headless Plugin does not mount its visual Component. The existing `/new` command now registers, updates its localized label, and unregisters in `setup`/cleanup. The Plugin release metadata was advanced to `0.0.2`.

## Verification

| Check | Result |
| --- | --- |
| Web Component build and generated/public type declarations | PASS |
| Vue consumer typecheck and production build, without React Vite plugin | PASS |
| Legacy consumer typecheck and standalone production build | PASS |
| Custom Element unit suite: upgrade, config, events, disconnect, detached update, moves, remount | 7 PASS |
| Standalone/ESM distribution: no external imports, repeat registration, Shadow-only bundled CSS | PASS |
| Real resource discovery/install/apply, dependency checks, ready status, idempotence | PASS |
| Local producer Plugin modification reaches its own compatibility bundle | PASS |
| Fresh native React producer build/typecheck; no Web Component factory in its bundle | PASS |
| Source Registry suite | 22 PASS |
| Resource install/ownership regressions | 7 PASS |
| React Quote/Portal/upstream regressions | 18 PASS |
| Creator locale/resource gating regressions | 4 PASS |
| Creator and browser-test typechecks; locale parity audit | PASS |
| Dedicated Chromium/Vue browser suite | 4 PASS |
| assistant-ui upstream-owned Elements integrity; no vendor changes in this task | PASS |

Browser checks use the real Vue 3/Vite demo and compiled distribution. They exercise sending, observable streaming and completion, Tool Call/Result presentation, Markdown headings/table/code, PDF attachments through the existing demo adapter, Quote creation and outbound payload, Slash/new thread, persisted identity changes, theme/locale draft preservation, Shadow Portal placement, config/runtime errors, active-run disconnect, remount and request counts.

The Host fixture applies `button { border: 10px solid red }`, `input { font-size: 40px }` and `* { box-sizing: content-box }`. Computed-style checks confirm Host styling remains visible outside the component and does not apply to its buttons/composer. Floating Quote and More-menu content stays inside the Shadow/theme boundary. Successful browser flows have no JavaScript or console errors; the error case deliberately supplies a 500 response and verifies `agent-error`.

Repeat the complete bridge gate with:

```sh
pnpm test:web-component
```

Browser screenshot: `/Users/yifei/.codex/visualizations/2026/10/07/01a115c4-78d2-7d10-8425-d4ea4072948a/bridge-acceptance.png`.

An additional `pnpm --filter @agent-ui/source-registry release:verify` check remains blocked by existing release metadata: unchanged `conversation-quote` source differs from the old release fixture without a version bump. Reconstructing HEAD also reproduces a release gate failure before this task. The Bridge-related command-source update has its own version/changelog bump; unrelated Plugin release history was preserved. This is a publishing gate, separate from the passing bridge build/installation/browser gates.

This evidence covers the first-phase Mock integration. npm publication and real backend acceptance were not part of this local delivery. No Vue SDK, Vue Tool renderer, Angular integration, assistant-ui vendor fork, or Creator production dependency was added.
