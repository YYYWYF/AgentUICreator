# Owned-control visual regression and style isolation

Date: 2026-10-10
Implementation baseline: `ebc827789408dec0a52d3d72c486c3db0250ad31`
Sidebar reproduction source: `ebc827789408dec0a52d3d72c486c3db0250ad31`
Thread regression reproduction source: `7b1d2a6518a024bf5a89840d3f6cb8b1c320d805`

`THREAD_LIST_STYLE_REGRESSION = PASS`
`TOOL_CALL_STYLE_REGRESSION = PASS`
`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED` (limits below)

The user explicitly requested real browser verification after the earlier
implementation-only delivery. Chromium screenshots, computed styles and matched
CSS rules are supplied here. These are executed browser checks, not mock DOM
visual claims. The tested control/state matrix passes; this report does not grant
unconditional signoff to every possible Host or optional Plugin configuration.

## Browser-confirmed causes

1. The thread item's Root and Trigger lacked ownership identifiers at the
   requested original baseline. Root is a `div`, with a normal 0px border; the
   visible thick border comes from the button Trigger: Chromium's user-agent
   button rule supplies **2px outset / buttonborder** and `buttonface` background.
   Its ordinary state had `focusVisible=false`, `outline-style=none`, and no
   box shadow. This is not a keyboard focus ring. The earlier two-attribute repair
   is confirmed to reach real DOM and produce a 0px ordinary Trigger border.
2. `ConversationToolCall` directly imported clean upstream ToolCall. Its
   CollapsibleTrigger similarly lacked ownership and retained the same **2px
   outset** border and system button background. Reproduction uses that actual
   vendor component, not a pair of static imitation buttons.
3. In the real Embedded Host, the official conversation suggestion button had
   only `conversation-suggestion` class. The hostile Host's universal
   `box-sizing: content-box` rule matched it, with no owned-element baseline.
   Its existing Plugin CSS already specified font/border; the omission was box
   sizing protection, not a reason to discard that CSS.
4. In the actual standalone Web Component, a keyboard-focused ToolCall button
   had `:focus-visible=true` but `box-shadow=none`. The five Tailwind shadow/ring
   defaults sampled in `shadow-before-focus.json` were empty in Shadow DOM.
   The ring utility was present in the compiled CSS; missing initial custom
   property values made its composed shadow invalid in this tested browser.

Matched rule records are in the six `before-*.json` / `after-*.json` files and
`embedded-before.json`. They include rule origins and relevant declarations.
`before-after.json` summarizes ordinary, selected, clicked, keyboard-focused and
rename styles. Original-baseline thread source is loaded with `git show` in the
browser fixture; no production files or vendor bytes are temporarily reverted.

5. The narrow Sidebar menu was painted below the drawer backdrop: its global
   Agent UI Portal formed a z-index 0 stacking context while the Sidebar Portal
   was at 50. The menu itself had opacity 1 and z-index 50, so increasing its own
   z-index could not escape that parent context. See `menu-layer-before.json`
   and its screenshot.

## Repairs

- Keep the earlier Root/Trigger ownership attributes and all existing interaction
  classes/handlers.
- Route ToolCall through the **existing** reproducible product adaptation and
  localization generator. The generated file retains upstream anatomy, adds
  per-element ownership and a 1px keyboard-only ring. This is an extension of the
  established assistant-ui product adapter mechanism, not a new UI-stack adapter.
  Its existing Request/Result presentation uses the unified `toolPresentation`
  namespace, with en-US/zh-CN parity and a new Request key.
- Mark only the official suggestion Trigger in Source Registry. Local generated
  Host copies used for verification received the identical attribute; customized
  framework files were preserved. No markers are forced onto third-party UI or
  custom Plugin children.
- Reuse the existing Portal context with the narrow Sidebar's local container.
  Menus and other nested product overlays share the drawer layer and retain theme
  containment; the global Portal z-index and CSS remain unchanged.
- Supply six Tailwind shadow/ring variable defaults at the Web Component's local
  `:host`. This restores composed keyboard focus shadows without an element
  Reset. Also declare the already-required official Composer package dependency
  in the standalone bridge; the prior build failed package preflight without it.

`packages/react/src/styles.css` and `preflight.scoped.css` are unchanged. No vendor,
AG-UI/Runtime/Plugin protocol, Creator prompt/skill or third-party CSS patch changed.
No `!important`, global button/input Reset, or whole-tree `all: revert-layer` was
added. The existing business-content selector exclusion tests continue to pass.

## Executed browser coverage

| Group | Evidence / result |
| --- | --- |
| Original ordinary border reproduction | Six tests: 1440/420 × light/dark/violet; before screenshots and matched rules |
| Real runtime thread list + Sidebar + ToolCall | Six repaired-state tests plus a dedicated narrow-menu layer test PASS; ordinary/selected/hover/click/keyboard/menu/rename; includes theme-contained portals |
| AntD 5 B controls | Same six tests PASS: configured 12px radius, 32px height, 4px 11px padding, 1px border; hover/focus/disabled; Modal open, keyboard focus containment and Escape |
| A/C Design System probes | Shared original stylesheet, identical SHA-256 confirmed; Button/Input/Card declarations preserved under the controlled typography context described below |
| Generated official Agent UI surface | 68 tests PASS; 17 scenarios × two locales × 1440/420; each records all three themes after CSS transitions settle |
| Broader interaction cases | 44 cases passed in the full 120-case run: Composer, locale/draft, history/menu, theme/commands/overlays, loading/error, attachments/dictation/edit/export, Timeline and Thinking modes |
| Quote + compatibility Footer | Eight targeted tests PASS after fixture corrections; real pointer text selection, toolbar Portal, preview and dismiss; Footer canonical actions |
| Sidebar navigation and collapse | Two existing browser tests PASS: desktop rail/expansion/switch/collapse and narrow focus trap/restoration/navigation |
| Embedded hostile Host / Portal / layout / nested business content | Six tests PASS, including the fixed suggestion button |
| Standalone Vue/Web Component | Ten tests PASS: four existing runtime/interaction tests plus 1440/420 × three-theme default/open/click/keyboard ToolCall matrix in real Shadow DOM |

The repaired-state groups cover **145 distinct browser cases** across scoped
runs. The initial full 120-case run was **113 PASS / 7 FAIL**; its log is retained
and is not relabeled as a green full-suite run. Those failing cases were the four
quote and three Footer cases; the subsequent eight-case rerun resolves them.
The 68-case surface rerun replaces screenshots captured during theme transitions.
An additional one-case typography diagnostic was executed separately.

`official/` contains 204 screenshots and 204 computed-style snapshots. The audit
records 5,496 owned-control observations with no ordinary `outset` border.
Generic Layout Runtime collapse/close buttons currently retain native browser
styles and are excluded from that Agent UI component ownership assertion. Their
source is `packages/runtime-react/src/layout/LayoutRenderer.tsx`; those generic
framework controls were not modified under the framework read-only boundary.
This exclusion is not third-party Plugin isolation evidence. `contact-sheets/` helps inspect the scenario
matrix; full-size PNGs remain available. Screenshot review covers default borders,
selected/hover backgrounds, keyboard rings, menu placement, Composer layout,
theme contrast and narrow layouts. This is not an automated pixel-diff comparison
against an approved visual golden set.

## Fixture corrections and static validation

The older visual harness copied the now dependency-owned Composer source and
failed registry validation. It also deleted the cached fixture reused by the
next spec. The harness now removes that legacy Composer copy and clones a fresh
working fixture. HMR is disabled for these snapshot fixtures and Vite transforms
are invalidated after configuration changes, preventing intermediate model and
registry combinations from replacing the page during the next case.

The old triple-click quote test selected the paragraph separator outside the
quote-selectable region. Diagnostics confirmed real nonempty text selection and
normal `user-select`, but the selection endpoints violated the existing quote
boundary. The test now performs a native pointer drag within text bounds and
waits for the complete mock reply. Production quote logic was not changed.

Checks in `checks/`: React build/typecheck; public/Lexical boundaries; upstream
purity; reproducible product adapters/localization; 7 focused test files / 22
Vitest cases; i18n audit; browser-test typechecks; standalone bridge build; and
all browser groups above. AntD 5.29.3 reports its React 19 compatibility warning;
the measured geometry, states and Modal interaction checks nevertheless pass.
No claim is made about the repository-wide CI suite.

## Limits that prevent overall boundary signoff

The A/C stylesheet uses `font: inherit`. Without a Host typography boundary,
Agent UI's root `line-height: 1.5` can flow into business controls through ordinary
CSS inheritance. The diagnostic reproduced an Input height of **36px outside /
42px inside**, while its declared border, radius, padding, colors and font size
were preserved. The isolation comparison fixture sets the same `line-height:
normal` context for its inside/outside probes to distinguish direct Reset effects
from inherited typography; that normalization is **test-only**. This repair does
not solve or hide the unconstrained inherited-height difference. See
`typography-inheritance.json` and `plugin-isolation.json`.

The generic Layout Runtime controls noted above are another explicit scope
exclusion from full component signoff. They are recorded in the computed-style
snapshots rather than being silently marked or covered by a broad Reset.

The A/C comparison reuses their shared Design System stylesheet, rather than
rerunning all prior Creator-generated business-notes delivery flows. Optional
Auth and Agent Identity are cataloged but not enabled in this visual fixture;
the coverage metadata explicitly identifies that exclusion. These limits mean
that the overall `PLUGIN_STYLE_BOUNDARY` stays unaccepted even though the thread,
ToolCall, suggestion ownership, narrow-menu layering and Shadow focus regressions are closed.

To reproduce the control fixture, prepare workspace packages, retain the prior
A/B/C fixtures, and optionally set `STYLE_B_FIXTURE` to B's directory; the default
is `/tmp/host-ui-p1-20261009/fixtures/B`. Run the dedicated
`playwright.style-boundary.config.ts` with `STYLE_PHASE=before` or `after`.
The baseline source commit must be available locally.
