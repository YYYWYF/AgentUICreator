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

The compiled `creator-ui.css` is checked in and copied unchanged by the Creator
package build. Building Creator does not require `@tailwindcss/cli`. The package
ships this CSS through its existing UI stylesheet; consumers need no Tailwind
plugin. `creator-ui.input.css` is retained as a reference for the original theme
and scoped reset, but is not compiled during the build.

When changing component classes, update `creator-ui.css` alongside the component
if the required utility is not already present. New Tailwind class names are not
automatically compiled. Preserve the `cui:` prefix, scoped selectors, private
variables and animation names. Tailwind preflight is omitted and the small reset
is scoped to `.creator-ui-scope`. These styles belong only to Creator, not
generated Agent Apps.
