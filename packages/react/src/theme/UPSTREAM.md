# Theme provenance and maintenance

Source: [shadcn/ui official theme system](https://ui.shadcn.com/docs/theming).
Synced: 2026-10-05. CLI: `shadcn@4.21.1`.
Reference source revision: `6b600cf1ff42f8a746747ea587e52af3ee224643`.
[Official theme definitions](https://github.com/shadcn-ui/ui/blob/6b600cf1ff42f8a746747ea587e52af3ee224643/apps/v4/registry/themes.ts).
License: MIT (shadcn/ui).

Base color: **zinc**, retaining the installed light/dark baseline (not neutral).
Light/dark values remain unchanged; the missing five chart tokens are copied
from the official Zinc theme. Radius and existing layout scales are retained.

## Product-owned Violet

Violet is the **AgentUICreator-owned Adaptable Brand Theme**, with a light color
scheme. It follows the shadcn semantic token contract but does not inherit the
shadcn Violet palette. `agent-ui-violet-theme.css` supplies every required token
independently. Its canonical blue-violet seed is [Tailwind `violet-600`](https://tailwindcss.com/docs/color)
(`oklch(0.541 0.281 293.009)`, approximately `#7C3AED`); interaction
surfaces, borders, focus, running/progress and chart colors derive from that seed.
Future shadcn palette syncs must not automatically change Violet visuals.

`shadcn-theme-presets.css` contains only Light / Dark Zinc upstream snapshots.
The snapshot hash guards those two palettes, excluding the product theme.
Build/install/runtime never invokes shadcn.

## Extension boundary

`shadcn-theme-presets.css` owns Light / Dark upstream palette snapshots.
`agent-ui-violet-theme.css` owns the complete Violet palette and interaction
intensity system: subtle default, light hover, lavender selection, soft focus,
strong active/running and solid primary action.
`assistant-ui-theme-overrides.css` owns removable stable-hook presentation seams:
Composer white surface, border-only hover and a soft 1px focus halo; AgentPlan
progress track/fill. Their hooks and upstream anatomy have contract guards.
Thread selection keeps upstream `data-active:bg-muted` with neutral text.
AgentStatus working remains upstream blue. No new component surfaces are added
in Phase 1–3; Mention/Slash, Reasoning/Tool coverage remains later work.
`agent-ui-theme-extensions.css` owns success/warning/overlay and a single shared
`--aui-*` alias layer. `theme-contract.ts` maps presets to color schemes.
Tokens stay inside Agent UI roots, including their portal containers.

The picker reuses the official shadcn NativeSelect snapshot from pinned
assistant-ui `3542d602272a62eddeb8989befc910841c267022`,
`packages/ui/src/components/react/ui/radix/native-select.tsx` (MIT).
It lives in `internal/primitives/native-select.tsx`; only its utils import is
adapted. It uses the native select and adds no runtime dependency or custom menu.
No assistant-ui vendor file was modified for themes.

## Upgrade workflow

For shadcn: inspect official token vocabulary changes, generate in scratch with
an explicit CLI version, extract only Light / Dark Zinc, review, update snapshot and
provenance, then run theme contract/isolation tests and the three-theme showcase.
Never bump Source Registry item versions to evolve palette content.

For assistant-ui: sync the pinned upstream normally; run the same tests and
showcase. Audit new upstream hardcoded colors; prefer removable integration CSS
or wrapper styling. Do not fork vendor presentation for a preset.

The development showcase is `examples/creator-embedded-host/theme-showcase.html`.
