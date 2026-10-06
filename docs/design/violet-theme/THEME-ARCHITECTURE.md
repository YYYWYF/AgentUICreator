# Current theme architecture

Scope: deployed Agent frontend plugins. Creator Agent and Creator workbench are outside this design task. No theme values or product files were edited.

```text
agentUIThemeConfig { theme: "light" }
→ plugin/theme-provider setup
→ AgentUIThemeService (getTheme / setTheme / subscribe)
→ useAgentUITheme (useSyncExternalStore, config fallback)
→ foundation/core AgentUIStyleSurface → @agent-ui/react AgentUIRoot
→ data-theme + data-color-scheme + scoped .dark class
→ shadcn semantic tokens + Agent UI semantic extensions
→ assistant-ui presentation + public wrappers + product plugins
```

ConversationSurface also projects theme and color scheme on its conversation boundary. Theme Switch is an optional consumer of the same service; it uses public NativeSelect and the locale layer, not a second theme store.

| Layer | Owning source | Responsibility |
| --- | --- | --- |
| Config | `packages/source-registry/registry/items/foundation-core-adapters/files/agent-ui/theme/theme-config.ts` | Default `{ theme: "light" }` |
| Service contract | `packages/source-registry/registry/items/foundation-core-application/files/services/agent-ui-theme.ts` | `agent-ui.theme` service ID and theme APIs |
| Service setup | `packages/source-registry/registry/items/plugin-theme-provider/files/plugins/theme-provider/definition.ts` and `theme-service.ts` | Reactive preset selection, no presentation |
| Hook | `packages/source-registry/registry/items/foundation-core-adapters/files/agent-ui/theme/useAgentUITheme.ts` | Reads shared service and fallback |
| Application root | `packages/source-registry/registry/items/foundation-core/files/application/Agent.tsx` | Root surrounds ModeShell / runtime composition |
| Public boundary | `packages/react/src/public.tsx` | Supported consumer API |
| Style root | `packages/react/src/internal/style-boundary/AgentUIRoot.tsx` | Style isolation and scoped portal container |
| Preset contract | `packages/react/src/theme/theme-contract.ts` | light→light, dark→dark, violet→light |
| Palette | `packages/react/src/theme/shadcn-theme-presets.css` | Scoped shadcn zinc Light/Dark and official Violet snapshot |
| Extensions | `packages/react/src/theme/agent-ui-theme-extensions.css` | success / warning / overlay; shared `--aui-*` aliases |
| Tailwind mapping | `packages/react/src/styles.css` | Semantic utility mappings, scoped preflight, animations, containment |
| Theme picker | `packages/source-registry/registry/items/plugin-theme-switch/files/plugins/theme-switch/index.tsx` | NativeSelect, locale copy, setTheme |
| Conversation root | `packages/source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/ConversationSurface.tsx` | ConversationThread and semantic replacement components |
| Mode shells | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/mode-shell/ModeShell.tsx` | Assistant / Embedded / Platform structural layout |

The scoped portal is a child of AgentUIRoot, so Dialog, Popover, Tooltip and image zoom retain root tokens. Do not move portal content to an unthemed `document.body` or add global body palette overrides.

Semantic families: background/foreground; card; popover; primary; secondary; muted; accent; destructive; border/input/ring; sidebar; chart-1…5. Agent UI adds success/warning/overlay. The existing `--aui-*` layer aliases these and contains spacing/font/radius vocabulary for diagnostic legacy surfaces. It is not a new Violet brand layer.

Violet changes primary/ring/accent/chart/sidebar palette while remaining light. AgentPlan progress uses `foreground/80`, not `primary`. ToolCall, Reasoning, WebSearch and OptionList often use foreground alpha. These preserve a neutral appearance even when primary becomes Violet. Thin scoped compatibility CSS may eventually address selected brand-like states, after design review, without changing the root foreground for all text.

## Ownership classes

- A — upstream-owned assistant-ui: `packages/react/src/internal/vendor/assistant-ui`; provenance in `UPSTREAM.json`, official Base UI registry output with declared patches. Optional generative vocabulary is also upstream-owned under a Source Registry vendor path.
- B — public wrapper: `packages/react/src/public.tsx`, `internal/composable-thread.tsx`, question/quote/trigger/search adapters, style boundary. Project-owned integration around upstream presentation; ownership of the wrapper does not make upstream anatomy editable.
- C — foundation/runtime: Source Registry `foundation-core*`; owns composition, SlotRegistry, ModeShell, services and conversation integration. Runtime/framework stay read-only in a plugin theme task.
- D — plugins: Source Registry `plugin-*` and `demo-*` files. Mostly thin compositions; some have product-owned markup (chart, suggestions, theme picker, demo receipts). Inspect the renderer before claiming visual freedom.
- E — theme/token layer: `packages/react/src/theme/*` and token mapping in `styles.css`. Future implementation should coordinate here; no theme implementation in this package.

## Revision and target caveat

Source reviewed at `662774fb8c3935584e03abf7ececea08c3d89110`, branch `dev`. assistant-ui revision is `3542d602272a62eddeb8989befc910841c267022`; pinned local source was inspected with `git show` in `/Users/yifei/Coding/assistant-ui`. See `packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json` for versions and adaptations. No upstream fetch or upgrade occurred.

The existing ignored/generated embedded Host contains older `defaultMode/getMode/useAgentUIThemeMode` foundation code. It does not wrap its application with the current AgentUIRoot. Its screenshots are labeled existing-target evidence. The isolated fixture uses current public AgentUIRoot, wrappers and CSS. This discrepancy is recorded; the target was not regenerated or repaired for prettier screenshots.
