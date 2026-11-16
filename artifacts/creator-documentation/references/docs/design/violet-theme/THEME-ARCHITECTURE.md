# Theme architecture

Scope: the deployed Agent frontend. Creator has its own development-tool UI and locale context. The supported product presets are `light`, `dark` and `violet`; the built-in initial theme is `violet`. Light and Violet use the light color scheme; Dark uses the dark color scheme. Product geometry and typography are shared, while colors derive from each preset's semantic palette.

## Theme selection and state

```text
React Agent.theme / onThemeChange
  → Runtime AgentUIThemeBridge
  ↔ enabled theme-provider's AgentUIThemeService
  → AgentUIRoot + conversation boundary
  → data-theme / data-color-scheme / scoped dark class
  → semantic CSS variables
  → official components and project Plugin applications
```

Omitting `Agent.theme` starts with Violet and permits internal switching. Passing `theme` makes the Host authoritative; a picker request calls `onThemeChange`, and the Host updates its prop to accept it. Prop synchronization does not itself emit a picker request. The Web Component exposes `theme` through config/property/attribute and reports UI requests through `theme-change`.

The optional `theme-switch` Plugin consumes the same instance service; it does not create another theme store. Theme selection is not stored in AppUIModel or a generated `theme-config.ts` / `config.ts`. Switching theme preserves the conversation, draft and Plugin services.

## Canonical owners

| Layer | Owning source | Responsibility |
| --- | --- | --- |
| React configuration | `packages/runtime/src/ui/application/Agent.tsx` | Public `AgentProps.theme` and `onThemeChange` |
| Theme bridge and Hook | `packages/runtime/src/ui/agent-ui/theme/` | Controlled synchronization and shared service subscription |
| Service contract | `packages/runtime/src/ui/services/agent-ui-theme.ts` | Shared service ID and types |
| Service implementation | `packages/plugins/src/plugins/theme-provider/adapters/presentation/theme-service.ts` | `getTheme`, `setTheme`, `subscribe` |
| Service binding | `packages/plugins/src/plugins/theme-provider/adapters/application-definition.ts` | Provide the instance service through existing Host bindings |
| Theme picker | `packages/plugins/src/plugins/theme-switch/adapters/presentation/` | Public selection UI and unified locale copy |
| Public presentation | `packages/plugins/src/public.tsx` | Supported component and theme API |
| Style boundary | `packages/plugins/src/internal/style-boundary/AgentUIRoot.tsx` | Scoped tokens and Portal container |
| Preset contract | `packages/plugins/src/theme/theme-contract.ts` | Preset identities, color schemes and Violet default |
| Palette and extensions | `packages/plugins/src/theme/shadcn-theme-presets.css`, `agent-ui-theme-extensions.css` | Semantic palettes, success/warning/overlay and shared aliases |
| Product presentation | `packages/plugins/src/theme/agent-ui-violet-theme.css`, `compact.css`, `assistant-ui-theme-overrides.css` | Shared product styling and maintained adaptation seams |
| Utility mapping | `packages/plugins/src/styles.css` | Semantic utility definitions and scoped foundations |
| Conversation boundary | `packages/runtime/src/ui/agent-ui/conversation/ConversationAdapter.tsx` and `packages/plugins/src/internal/conversation-surface.tsx` | Conversation theme and semantic replacements |
| Product shells | `packages/plugins/resources/registry/items/foundation/shell-<mode>/files/application/shell/` | Initialize only the selected project-owned Shell and CSS |

The source catalog and snapshots derive from canonical Plugin owners and `source-layout.json`. Generated vendor/adapter views are build inputs, not edit targets. See [Plugin delivery and ownership](../../architecture/npm-default-plugin-source-ownership.md).

## Project customization

The generated `application/project-config.tsx` binds `ProjectShell` and the project resources to Runtime `/ui`. Product shell code lives in the project's `application/shell/`; Runtime does not route by product Mode. Shell files are ordinary application code and are preserved during npm upgrades and implementation-only source synchronization.

Brand styling belongs in the project's `styles.css` or public component props. For a brand palette, override the supported CSS variables on both `.agent-ui-root` and `.agent-ui-conversation` for the intended `data-theme`. Keep other themes usable and use `Agent.theme` to select the preset. Concrete examples are in [themes and styling](../../../../development/theme-and-styling.md).

Semantic token families include background/foreground, card, popover, primary, secondary, muted, accent, destructive, border/input/ring, sidebar and chart colors. Agent UI adds success/warning/overlay and shared spacing/font/radius aliases. A preset does not make every active state use its brand color; components may deliberately use foreground alpha or semantic status colors.

Portal content must remain inside its owning themed Agent UI boundary. Do not move it to an unthemed `document.body`, introduce global palette rules or change Portal geometry to solve a branding task.

## Ownership and upgrades

- Upstream source is canonical under `packages/plugins/src/plugins/<id>/upstream/` and `src/shared/upstream/assistant-ui/`. Keep vendor locale-agnostic and unmodified, with exact provenance.
- Product adapters live under `src/plugins/<id>/adapters/` and `src/shared/adapters/`. Prefer public props, composition and semantic tokens before implementation changes.
- Runtime `/ui` owns composition, SlotRegistry and service lifecycles. It is not a theme customization target.
- Projects own their application layer, styles and Shell. Source takeover requires a separate, explicit per-Plugin agreement; ordinary styling does not.
- The installed Plugins package, its catalog and source snapshots supply the exact source target. An npm upgrade does not rewrite local implementations or advance BASE.

Use the [ownership and upgrade matrix](UPGRADE-BOUNDARIES.md) when selecting an edit seam. Validate existing themes, both locales, overlays, focus and narrow containers. Static checks and browser or Windows acceptance are separate evidence.
