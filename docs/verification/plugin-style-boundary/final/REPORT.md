# Plugin typography boundary

Scope: typography implementation only. Visual acceptance was explicitly skipped
for this change; Modal code and visual evidence are deferred.

## Change

- `AgentUIRoot` preserves the Host parent's computed font family, size, weight,
  style and line height in private CSS custom properties before paint.
- Existing `.app-ui-plugin-instance` containers restore those values in the base
  layer. Explicit Host line height is preserved rather than replaced by `normal`.
- Official Agent UI presentation roots mounted as Plugins retain Agent UI
  typography. Plugin styles and utility classes can override the base layer.
- Host ancestor theme/style attribute changes and window resize refresh the
  captured typography; listeners are removed on unmount.
- No global descendant reset, component-library adapter, vendor change, Runtime
  source change or Plugin protocol change was introduced.

## Static validation

- `pnpm --filter @agent-ui/react typecheck`: PASS.
- `pnpm --filter @agent-ui/react build`: PASS, including public declaration and
  optional Lexical boundary checks.
- `git diff --check`: PASS.

## Acceptance status

- Design System / Ant Design / mixed component geometry and interaction: NOT_RUN.
- Composer / Sidebar / Thread List / ToolTimeline / ThinkingIndicator regression:
  NOT_RUN.
- Modal painting, stacking, mask, animation and screenshots: NOT_RUN.

`PLUGIN_STYLE_BOUNDARY = NOT_RUN`

Static validation does not establish visual parity. No computed-style JSON or
screenshots were generated for this change.
