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

## Development checks

```sh
pnpm test:web-component
```
