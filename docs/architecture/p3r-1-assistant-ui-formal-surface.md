# P3R-1 assistant-ui Formal Surface

## Result

P3R-1 makes the assistant-ui presentation source a formal AgentUICreator
asset while retaining the existing feature-gated Spike Runtime. It does not
perform the canonical Runtime cutover planned for P3R-2.

## Final ownership

- Vendor source: `examples/agent-frontend/agent-ui/vendor/assistant-ui`
- Adapter surface: `examples/agent-frontend/agent-ui/adapters/assistant-ui/conversation`
- Scoped styles: `examples/agent-frontend/agent-ui/adapters/assistant-ui/styles`
- Source Registry item: `foundation/assistant-ui-conversation`
- Pinned upstream revision: `97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7`
- Runtime packages retained by the project: `@assistant-ui/react@0.15.19` and
  `@assistant-ui/react-ag-ui@0.0.59`

`UPSTREAM.json` records upstream paths and hashes, installed hashes, the
official Base UI registry rendering step, and local relative-import
adaptations. `patches` is empty because P3R-1 adds no presentation patch.

## Runtime and A/B entry

The formal CSS entry is
`agent-ui/adapters/assistant-ui/styles/globals.css`. It scans only
`agent-ui/vendor/assistant-ui` for Tailwind utilities and remains dynamically
loaded when `?assistantUiSpike=1` is active in development.

P3R-1 formalizes the current dark presentation baseline only. Theme bridging
and a stable light/dark theme contract are deferred to a later phase.

The Spike harness continues to own:

- `src/spikes/assistant-ui/AssistantUiConversation.tsx`
- `src/spikes/assistant-ui/AssistantUiRuntimeProvider.tsx`
- `src/spikes/assistant-ui/AssistantUiRuntimeDebugOverlay.tsx`
- `src/spikes/assistant-ui/spike-mode.ts`
- `plugins/assistant-ui-conversation-spike`

Normal mode continues to render the legacy `conversation-surface`. Spike mode
continues through the existing Runtime provider, then the formal
`AssistantUiConversationSurface`, then the Source-Registry-managed vendor
Thread.

## P3R-2 boundary

P3R-2 still needs to establish the canonical single-transport Runtime adapter,
conversation identity and history rebind semantics, frontend tool and HITL
bridges, and diagnostics observation. None of those responsibilities move into
the P3R-1 vendor source or surface adapter.
