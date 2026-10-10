# Thread list style ownership repair

Date: 2026-10-10
Baseline: `7b1d2a6518a024bf5a89840d3f6cb8b1c320d805`

Status: implementation and deterministic checks complete; browser/visual
acceptance **NOT RUN**, as requested by the user's final instruction
“做完推送，不要验收”.

`THREAD_LIST_STYLE_REGRESSION = NOT_ACCEPTED`
`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED`

## Finding and change

The product composition's `ThreadListItemPrimitive.Root` and `.Trigger` had
utility classes and `aui_` slots, but none of the existing element ownership
identifiers. Consequently they did not match the scoped Preflight or the
owned-element Host rollback selector. Add `data-agent-ui-owned=""` to those
two primitives only. A real upstream DOM integration test verifies that the
Root and button Trigger receive the attribute and match the existing baseline;
removing the attribute reproduces the selector omission.

This proves an ownership gap. It does **not** establish which browser/Host rule
caused the reported thick border, distinguish border from focus ring, or prove
that the screenshot regression is resolved. Those conclusions require the
requested computed-style/cascade measurements and visual comparison, deferred
by the final instruction. No synthetic before/after browser evidence is supplied.

No classes, handlers, focus utilities, CSS files, vendor files, localization,
Runtime/AG-UI/Plugin contracts, or Creator prompts/skills changed. Reset scope
remains per element. No `!important`, global reset, or third-party patch was added.

## Scoped ownership review

- Thread search uses the marked adapter wrapper/Input and product clear-button
  slot. Rename Input and More/menu/actions use `agent-ui-*` slots; they already
  match ownership selectors.
- Sidebar frame/rail/panel/brand/portal wrappers carry explicit ownership;
  generated Sidebar presentation receives adapter ownership. Header and custom
  content remain supplied by the Host, with no ownership applied to descendants.
- Composer trigger error/retry presentation is explicitly marked. Generated
  conversation/Composer presentation remains covered by existing adapter
  ownership and `aui-*` identifiers.
- ToolTimeline's generated controls and product details trigger are marked;
  ThinkingIndicator wrapper/ShimmerLabel/elapsed are marked and the dot has a
  product slot. Custom tool details remain outside automatic ownership.
- The official `PolicyThreadList.tsx` still has utility-only `aui_` wrappers,
  group labels, empty-state and skeleton-wrapper elements without ownership.
  These are static review candidates, not browser-confirmed visual defects.
  They were not changed because this task requires evidence before expanding
  the repair and browser acceptance was explicitly skipped.

No additional visual regression or complete official-plugin parity is claimed.

## Validation

See `checks/` for command output:

- Focused React tests: 8 files / 31 tests passed. Includes actual upstream DOM
  ownership, selection, keyboard menu opening, themed Portal containment,
  rename persistence and focus restoration, native deletion, locale/search,
  disabled-history policy, selector isolation and adapter reproducibility.
- Official ToolTimeline/ThinkingIndicator tests: 3 files / 17 tests passed; see
  `official-plugins.log`.
- `pnpm --filter @agent-ui/react typecheck`: passed.
- `pnpm --filter @agent-ui/react build`: passed, including public and Lexical
  boundaries.
- `pnpm check:assistant-ui-upstream`: passed.
- `git diff --check`: passed.

The package manager reports existing node_modules/lockfile synchronization
warnings; Vitest also reports native Vite config compatibility warnings. The
commands above exited successfully; dependencies were not changed.

## Deferred browser work

No Playwright suite was authored or executed in this implementation-only pass.
The 1440/420 light/dark/violet real Sidebar state matrix, Embedded/Web Component
checks, screenshots, computed styles and matched cascade rules remain pending.
`plugin-isolation.json` records the same pending status for AntD 5 B and A/C
Design System controls. Neither this repair nor deterministic checks restore
prior visual acceptance or establish overall Plugin style boundary signoff.
