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
independently. The selected Balanced Violet seed is `#7557E8`
(`oklch(0.567945 0.208743 287.302866)`), with `#6442CC`
(`oklch(0.499607 0.201356 288.164255)`) for solid primary actions.
The user selected this palette on 2026-10-06 after comparing it with the previous
`#8263FC` seed sampled from the A+ reference's progress fill.
Future shadcn palette syncs must not automatically change Violet visuals.

`shadcn-theme-presets.css` contains only Light / Dark Zinc upstream snapshots.
The snapshot hash guards those two palettes, excluding the product theme.
General canvas, cards, popovers, secondary surfaces and thread-management sidebar
remain white. Generic muted fills and static borders are neutral. Violet is reserved
for primary actions, running icons/progress, selected items, context chips and focus.
Generic hover uses neutral muted fills. Reasoning and ToolGroup remain white while
running; ToolFallback argument/result surfaces are white with neutral borders.
Brand surface/hover/selected tints use 6% / 8% / 10%; brand hover/focus borders use
22% / solid action. The Composer remains white with a solid focus border and a 20% brand 1px halo.
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
AgentStatus working remains upstream blue. Reasoning/Tool running colors use the
existing product state hooks; their surfaces stay white in every state.

Mention/Slash selected rows now fill their list area in Violet: the product adapter
adds `composer-trigger-popover-item-list` without changing the hierarchy, and scoped
CSS removes list block padding and item rounding. The existing popover clips the
rows to its outer radius. Light/Dark retain their list padding and presentation.
AgentStatus's internal working dot has no stable hook or replacement API; its blue
remains a recorded visual delta until upstream exposes a suitable seam. Do not
target its internal spans or Tailwind classes to recolor it.
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

Runtime `--color-*` aliases are declared at the Agent UI theme boundary alongside
semantic palette tokens. `@theme inline` remains the utility-generation mapping;
it does not replace scoped runtime aliases. Radius aliases are likewise scoped.
The product integration directory owns overlay and locale seams, while installed
assistant-ui vendor source permits mechanical import conversion only.

Violet generic muted surfaces and hover fills are neutral. Context chips consume
brand surface (6%) and solid brand text, while selected rows use selected (10%).
Reasoning and Tool surfaces never consume purple background tokens. Product data-slot hooks
retain selected intensity for User Bubble and active Thread items. Thread management
uses the white sidebar token, with purple confined to selected items.
The solid action token is distinct from the seed; both color pairs exceed WCAG AA
contrast against white. The Violet contract tests compute the resolved contrast.

Remaining visual deltas: the upstream ToolCall inner Request/Result field has no
stable hook and retains its neutral gray fill; AgentPlan step icons likewise retain
upstream colors. Do not override either via internal DOM or utility class selectors.

Reference/file/question/job palette application (2026-10-06): source, file, option
and job shells remain white with neutral borders. Quote and file icons use the
solid brand token; file icon fill and source hover are neutral. Multiple-selection
rows consume brand-selected through their existing role=checkbox/aria-checked
semantics. URL favicon pixels retain the source website's branding.
WebSearch and SubagentList retain their neutral upstream presentation. Retrieval
relevance and JobProgress running fills remain upstream blue, and OptionList
confirm/checkbox glyphs remain black: internal elements lack stable hooks. These
are recorded visual deltas, not permission to patch vendor or utility selectors.

Media/task/chart pass (2026-10-06): image generation and task shells/transcripts
use white and neutral borders; media loading/error placeholders and action hover
use neutral muted fills. Image action hover and Composer quote icons use solid
brand. The product chart plugin adds chart-message/track/fill data slots without
changing structure, values or behavior. Violet chart fill uses brand-active; other
themes retain chart-1. Markdown, attachment and overlay presentation continues
to consume existing semantic tokens. Internal media/task state icons retain their
upstream colors where no stable hook exists.

Screenshot verification (2026-10-06) covers optional frontend Form/Dialog plugins
with their real services. Product data slots now expose form inputs/reset/submit
and dialog content/close for scoped Violet neutral borders, brand actions and
destructive validation text. No lifecycle, events, hierarchy or locale copy changed.
The verification index is docs/design/violet-theme/verification-2026-10-06/index.html.


Closeout (2026-10-06): Violet keyboard controls use a 2px solid brand focus
outline with 2px offset via stable button/overlay/plugin slots. The outline's
contrast against white card/popover/canvas is guarded at >=3:1. Composer focus
uses the same solid border plus a 20% soft halo. Optional Form typography,
maximum width, input/button sizing and neutral card are scoped in its own CSS;
Light/Dark preserve their original demo presentation. No vendor changes.
