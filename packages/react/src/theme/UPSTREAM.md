# Theme provenance and maintenance

Source: [shadcn/ui official theme system](https://ui.shadcn.com/docs/theming).
Synced: 2026-10-05. CLI: `shadcn@4.21.1`.
Reference source revision: `6b600cf1ff42f8a746747ea587e52af3ee224643`.
[Official theme definitions](https://github.com/shadcn-ui/ui/blob/6b600cf1ff42f8a746747ea587e52af3ee224643/apps/v4/registry/themes.ts).
License: MIT (shadcn/ui).

Base color: **zinc**, retaining the installed light/dark baseline (not neutral).
Light/dark values remain unchanged; the missing five chart tokens are copied
from the official Zinc theme. Radius and existing layout scales are retained.

Violet source: official shadcn preset. Preset code: **`b5vnpT4bI`**.
Decoded values: style `nova`, baseColor `zinc`, theme `violet`, chartColor `violet`,
iconLibrary `lucide`, font `inter`, fontHeading `inherit`, radius `default`,
menuAccent `subtle`, menuColor `default`. The scratch project uses `base-nova`,
matching the existing Base UI implementation. Only the light palette is shipped
as Violet; its color scheme is light.

Sync method: **theme-only**, in a disposable Vite/Tailwind v4 project:

```sh
npx --yes shadcn@4.21.1 preset decode b5vnpT4bI --json
npx --yes shadcn@4.21.1 apply b5vnpT4bI --only theme --yes --cwd <scratch>
```

Extract only the `:root` semantic declarations, replacing its selector with
`:is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"]`.
Scratch generated stylesheet SHA256: `3b7d46d87245bf8076bac4a73d22721f1bf104a7eacac44e5d4688a3f6742984`.
Do not copy font, spacing, radius mapping, components, global resets or dependency
changes from the scratch project. Build/install/runtime never invokes shadcn.

## Extension boundary

`shadcn-theme-presets.css` owns upstream palette snapshots.
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
an explicit CLI version, extract a theme-only diff, review, update snapshot and
provenance, then run theme contract/isolation tests and the three-theme showcase.
Never bump Source Registry item versions to evolve palette content.

For assistant-ui: sync the pinned upstream normally; run the same tests and
showcase. Audit new upstream hardcoded colors; prefer removable integration CSS
or wrapper styling. Do not fork vendor presentation for a preset.

The development showcase is `examples/creator-embedded-host/theme-showcase.html`.
