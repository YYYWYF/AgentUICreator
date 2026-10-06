# Creator shadcn/ui components

Button, Popover, Alert, Card, Input, Textarea, Badge and Native Select are adapted from the official shadcn/ui
`new-york-v4` registry (retrieved 2026-10-06):

- https://ui.shadcn.com/r/styles/new-york-v4/button.json
- https://ui.shadcn.com/r/styles/new-york-v4/popover.json
- https://ui.shadcn.com/r/styles/new-york-v4/alert.json
- https://ui.shadcn.com/r/styles/new-york-v4/card.json
- https://ui.shadcn.com/r/styles/new-york-v4/input.json
- https://ui.shadcn.com/r/styles/new-york-v4/textarea.json
- https://ui.shadcn.com/r/styles/new-york-v4/badge.json
- https://ui.shadcn.com/r/styles/new-york-v4/native-select.json

shadcn/ui is MIT licensed: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md.
Keep the accompanying license when redistributing these components.

Local adaptations: relative ESM imports, individual Radix packages, `cui:`
Tailwind utility prefix, Creator theme variables, and an explicit Popover portal
container. Do not portal into the Host document body; render into the Creator
panel to retain the style and ownership boundary.

Run `pnpm --filter @agent-ui/creator build:ui` after changing component classes.
The generated `creator-ui.css` is checked in for source-based development and
rebuilt by the Creator package build. The package ships compiled CSS through
its existing UI stylesheet; consumers need no Tailwind plugin. Tailwind
preflight is omitted and the small reset is scoped to `.creator-ui-scope`.
These dependencies and styles belong only to Creator, not generated Agent Apps.
