# Agent UI application theme contract

This contract ships with the installed Plugins foundation. The application owns
`../conversation/styles.css`; its npm styles import supplies the base presentation.
Customize that project stylesheet, preserving its import and source directives.
Its `./compact.css` import provides the shared assistant/embedded presentation:
compact neutral suggestion cards, welcome spacing and composer styling. Both
Modes use the same file; only the floating assistant receives the panel frame.
The rules are scoped to those shells and share their geometry across light,
dark and violet. Colors follow each preset's semantic palette; Violet retains
its compact palette overrides. Platform does not receive compact shell styles.
This stylesheet is project-owned after
initialization and can be customized alongside `styles.css`.
No npm implementation extraction, new Plugin, Runtime edit or Host CSS edit is
needed for a palette change. Existing local overrides remain application-owned.

## Scope and cascade

Use `:is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"]` for the
violet preset. It covers the outer root and conversation/portal theme roots.
The package uses that selector for its violet defaults. An unlayered override
block after the npm import wins at equal specificity; no `!important` is needed.
Use the corresponding actual preset value for other themes. Preserve dark mode
unless the user requests changing it; do not apply white backgrounds to every
`[data-theme]` indiscriminately. Do not target private DOM or utility classes.

## Public CSS variables

- Brand: `--agent-brand` is the brand hue; `--agent-brand-solid` is the stronger
  action color. Set both when replacing the brand. `--primary` and
  `--sidebar-primary` derive from the solid color in violet.
- Every preset derives `--agent-brand-subtle`, `--agent-brand-surface`,
  `--agent-brand-hover`, `--agent-brand-selected`, `--agent-brand-border`,
  `--agent-brand-hover-border`, `--agent-brand-focus-border`,
  `--agent-brand-focus-ring`, `--agent-brand-active` from those brand variables
  and the semantic surfaces.
  Light/dark use their own primary color as the default brand; Violet retains
  its brand palette. Its chart/sidebar palette overrides remain preset-specific.
- Surfaces: `--background`, `--card`, `--popover`, `--muted`, `--accent`,
  `--secondary`, `--sidebar`; text: `--foreground`, `--muted-foreground`,
  `--primary-foreground`, `--card-foreground`, `--popover-foreground`.
- Details: `--border`, `--input`, `--ring`, `--radius`;
  composer: `--agent-composer-focus-border`, `--agent-composer-focus-ring`,
  `--agent-composer-shadow`. Violet focus and shadow derive from the brand;
  explicitly override shadow/radius here when simplifying the design.

CSS colors accept hex, oklch or other valid CSS color values. Radius is a CSS
length, shadow a CSS box-shadow value. Preserve readable text/action contrast,
visible keyboard focus and destructive/error semantics. Existing derived custom
properties are computed on each matching root, so set overrides on both roots.

## Presets are separate from brand colors

`theme-config.ts` selects `light`, `dark` or `violet`. The public package
`@za38.03/agent-ui-plugins/theme` maps light/violet to light color scheme and dark
to dark color scheme. Blue is not a preset ID. Brand customization can retain
`violet` as the selected preset while overriding its palette in project CSS.
There is no need to trace the Provider or color-scheme helper to use this contract.
If actual project usage contradicts this contract, inspect that concrete issue.
