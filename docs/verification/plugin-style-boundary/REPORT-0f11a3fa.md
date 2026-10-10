# Plugin style boundary — final browser acceptance

Date: 2026-10-10 (Asia/Shanghai).

**`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED`**

Clean native AntD 5 controls preserve their Host styles. The requested overall
boundary is not accepted: A/C inherited typography and the existing B business
Plugin's narrow overflow remain blocking. A line-height repair candidate was
withdrawn after computed-style comparison found official-control geometry
changes. The retained production change fixes a separate Rename focus race;
it does not claim to fix the full style boundary.

## Baseline, source and environment

The clean `dev` checkout started at `f66c4129`, matching `origin/dev`, and contains
`7b1d2a6518a024bf5a89840d3f6cb8b1c320d805`. It includes the subsequent
`ebc82778` thread ownership and `f66c4129` owned-control/Portal/Shadow fixes.
The retained source is `d406a523` with the Rename repair `c9a329b8`.
See [environment-final.json](environment-final.json) for installed versions and
built stylesheet hash. All new browser checks load the built React package's
`dist` entry/stylesheet or built standalone Web Component. No JSDOM result is
used as browser or visual acceptance.

AntD is 5.29.3 under the Host ConfigProvider, with 12px radius and identical
props/theme/algorithm for Host and Plugin probes. Its installed React 19 warning
is retained in logs. There is no AntD-specific repair CSS on the clean controls.

## Restored and new assets

- Retained original A/B/C Host skeletons, installed dependencies and the A/C
  Design System stylesheet (matching SHA-256 values recorded in the environment).
- Their raw directories had been reset after earlier delivery. Restored the
  exact recorded Creator-authored `business-notes`, locale, registry and
  AppUIModel output from
  `creator-host-ui-delivery/business-closure/generated-source-diff/{A,B,C}`.
  [restored-hosts.json](restored-hosts.json) records source hashes and Host
  checks. No model was called and no business Plugin source was rewritten.
  Their earlier local repairs are retained only for original-delivery regression.
- Created a separate **manual test fixture**, not a Creator delivery, using
  native AntD Button/Input/Card/List/Modal and original A/C Design System
  classes. It does not normalize Input typography or box sizing, and does not
  derive local repair CSS from AntD tokens. Only the shared ConfigProvider
  supplies the Host theme; Card/probe width is fixed equally for comparisons.
- Reused official surface, Sidebar, Composer, Markdown, Timeline, Thinking,
  overlay, embedded Host and Shadow DOM browser tests. Snapshot fixtures have
  separate Vite caches, installed CommonJS dependency aliases, HMR disabled,
  and explicit module invalidation for composition switches. The official
  fixture's file watcher is disabled to avoid asynchronous configuration
  invalidation competing with that explicit update.

The earlier implementation-only report is preserved as
[IMPLEMENTATION-7b1d2a6.md](IMPLEMENTATION-7b1d2a6.md). Earlier published
`full-visual/` evidence is preserved. New retained-source evidence is listed
below; withdrawn candidate artifacts are isolated and explicitly labeled.

## Reproduction, repairs and rejected candidate

Before editing, Chromium without the old test-only `line-height:normal`
reproduced a native A/C Input **36px outside / 42px inside**. The unowned Input
retained its declared border/radius/padding; Root `line-height:1.5` flowed through
`font:inherit`. See [before-browser.log](checks/final/before-browser.log) and the
retained [baseline typography record](final-before/retained-typography-inheritance.json).

- `4b4ce73e` tried removing layout-root leading. A/C Root parity then passed,
  but the direct official ToolCall became 25px instead of 28.5px high.
- `88d87c6c` tried retaining 1.5 leading on individually owned controls. The
  direct ToolCall returned to 28.5px, but comparison with f66c4129 showed **48
  official-control geometry changes** in other contexts: TaskGroup height
  41.9375/43.625px became 40.25px, and some ToolCall triggers 29.875/31.25px
  became 28.5px. That violated preservation of official presentation.
- `c299c1a9` / `d406a523` revert both CSS attempts. Production CSS is identical
  to f66c4129; the Root-level A/C failure is retained, not hidden by a test patch.
  Candidate measurements/screenshots are in
  [candidate-line-height/](candidate-line-height/README.md), not final PASS proof.
- `c9a329b8` repairs Rename focus in the existing product thread-list integration.
  Menu teardown previously restored focus to More after the Input mounted,
  causing blur/early submission and disappearance. Only when renaming, prevent
  close-autofocus so the new Input keeps focus. The test waits 300ms after opening
  Rename before checking focus/screenshot and submitting. Ordinary menu closing
  retains upstream behavior. Eight real-browser scoped cases pass after repair.

Final production scope is one focus handler in the existing product integration.
Vendor, generated adapters/provenance, theme/CSS, Runtime, AG-UI, Plugin contracts,
AppUIModel and business Plugins are unchanged from the starting baseline.
No whole-tree Reset, library-specific compatibility CSS or new mechanism was
introduced. No vendor drift or adapter-generation change was made.

## Acceptance results

| Group | Result |
| --- | --- |
| Implementation checks | PASS for build/typecheck/i18n/upstream and focused component checks; two independently reproduced baseline test failures remain |
| Clean B native style consistency | PASS: 8 basic visual cases and 8 actual Plugin Runtime cases; Root/owned-parent/standalone, Sidebar/Dialog boundaries, hover/focus/disabled and Modal checks |
| Clean A/C Root/owned-parent/standalone | FAIL: Host leading is changed by inherited Root typography |
| Clean A/C official Dialog/narrow Sidebar | FAIL: inherited font-size/leading differ; desktop Sidebar also inherits the Root default |
| Original Creator A/C Plugins | PASS for existing 8-case browser regressions each; static Host checks pass |
| Original Creator B Plugin | FAIL: desktop 4/4 pass; narrow 4/4 fail layout bounds; static Host checks pass |
| Overall A/B/C acceptance | FAIL |
| Official components | Retained-source scoped browser results below; CSS regression candidate is withdrawn |
| Embedded/Shadow boundaries | Executed results and source limits below |

[computed-styles.json](computed-styles.json) contains actual Host/Plugin values
for radius, height, padding, border width, background, color, font size/family,
line height and box sizing. States include default, disabled, pointer hover and
keyboard focus for Input/Button. The 24 basic cases are A/B/C × 1440/420 ×
Light/Dark × zh-CN/en-US, with page and both open-dialog screenshots.
The supplementary `run-native-ant-runtime.mjs` clones the restored B Host and
substitutes only its disposable test component with the same native probes.
The existing AppUIModel, registry, Slot composition and PluginInstanceRenderer
mount them; `runtime-native-ant.json` records the actual Plugin/instance ancestry.
No original Creator files or repair styles are changed. Outside focus states are
sampled before opening the narrow Sidebar trap; inside states are sampled after
opening it, so both components receive the same requested focus state.

Additional cases use actual Sidebar and official DialogContent, generic
`data-slot=input/button`, an explicitly owned parent and standalone Conversation.
Business elements are not assigned ownership or selected by descendant Reset.

The earlier normalization of DS Input box sizing in the first manual probe was
removed before the natural-styles follow-up and retained-source run. Final
measurements use the original DS declarations. Withdrawn/provisional pass
results are not used to sign off A/C.

## Blocking failures

1. **Inherited A/C typography.** Host Input is 16px / normal / 36px high.
   Root/owned-parent/standalone inherit the Agent leading (24px / 42px high).
   Official Dialog and narrow Sidebar additionally inherit `text-sm`
   (14px / 20px / 38px high). Declared border, radius and padding survive, and
   children remain unowned, but full computed-style parity fails. Ordinary CSS
   inheritance is not waived merely because Reset selectors do not match.
2. **Original B narrow overflow.** Its unchanged Plugin declares width/height
   100% plus 12px padding, without its own box sizing. A 279px container contains
   a 303px content-box Plugin. Scroll-into-view shifts its left edge to x=-8px,
   clipping content. [B-layout-diagnostic.json](B-layout-diagnostic.json) records
   the ancestry, rectangles and actual CSS. Four failure screenshots are kept.
   No new business sizing or AntD-control patch was added to claim success.

The tried Root-leading repair was unsafe for official geometry and is withdrawn.
A verified minimal repair for these remaining boundaries was not established.
Restoring descendant Reset or overriding Host business controls would violate
this acceptance's constraints. Therefore the final gate remains NOT_ACCEPTED.

## Validation and limits

Logs are in [checks/final/](checks/final/). The current and prepared f66c4129
source snapshot independently reproduce the stale literal AgentUIRoot assertion
in `assistant-ui-integration-boundary.test.ts`, and the theme-bridge `light`
expected / `violet` actual assertion. See `baseline-f66-tests-ready.log` and
`baseline-environment.md`. These are baseline failures; the complete unit suite
is not called green.

Official evidence covers Composer, Sidebar, Markdown/messages, Timeline,
Thinking, Tool/Reasoning, Dialog/Popover/Tooltip, focus/hover/disabled, Light/Dark/
Violet, locales and narrow layouts. Geometry comparison was used to reject the
candidate, not just to check for absence of `outset` borders. No approved pixel
snapshot golden set, complete Creator selection rerun, repository-wide CI or
release acceptance was executed. Generic Layout Runtime native controls retain
the starting baseline's ownership exclusion; they are not silently reclassified.

Initial full official runs remain red: 114/120 then 118/120. The 12-case
configuration-transition rerun passes after fixture watcher isolation. These
candidate-era executions and their failed logs are preserved, not relabeled as
a green final full-suite run. The retained-source scoped rerun is separate.

## Reproduction

```sh
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-final.config.ts
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-boundary.config.ts
node docs/verification/plugin-style-boundary/run-restored-hosts.mjs
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.i18n-plugin-visual.config.ts --reporter=list --output=test-results/style-retained-official
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.web-component.config.ts
```

Prepare workspace package builds first. `STYLE_B_FIXTURE` points to the retained
B dependency install (default `/tmp/host-ui-p1-20261009/fixtures/B`), whose sibling
A supplies the original DS stylesheet. `STYLE_DELIVERED_HOSTS` overrides the
original Host skeleton source for restoration. The Host runner preserves all
records and returns failure when any scenario fails. The older scoped control
fixture's matched-typography probes are only official-control regression aids;
the new final fixture's unnormalized measurements own business acceptance.

## Retained-source browser evidence

- Official P0 surface/interaction subset: **44/44 PASS** after CSS rollback,
  covering five surface scenarios across both locales/viewports/three themes,
  Timeline/Thinking modes and command/mention/overlay interactions.
  `retained-official-browser.log` is the executed source's scoped result, not
  the earlier candidate full-suite result.
- Sidebar/ToolCall/owned states/rename/Portal subset: **8/8 PASS**
  (`baseline-retained-controls.log`). That legacy fixture gives DS probes equal
  typography and therefore does not sign off the unnormalized A/C business
  boundary. The final manual fixture records those failures independently.
- `visual/official-retained/` contains 60 screenshots and 60 computed-style
  snapshots for the retained CSS. Candidate-era official screenshots are only
  under `candidate-line-height/`. The source CSS equivalence check is in
  `retained-css-equivalence.json`.

- Retained manual matrix: **10 PASS / 20 FAIL** across 30 cases
  (`retained-clean-matrix.log`): basic B 8/8 PASS; basic A/C 16/16 FAIL;
  B nested boundary 2/2 PASS; A/C nested boundary 4/4 FAIL. All 24 basic page
  and open-dialog screenshot sets were captured despite soft comparison failures.
- Retained standalone Web Component: **10/10 PASS** (`retained-shadow-browser.log`)
  after rebuild; `visual/shadow/` holds default/open/focus screenshots and computed
  records. The first rebuild had a package-consumer installation network timeout;
  the successful retry log is separate (`retained-shadow-build-retry.log`).
- Final focused unit set: **10 files / 54 tests PASS**
  (`retained-focused-tests.log`), including ownership exclusions, adapter generation,
  Portal, Sidebar, Composer, thread list, Timeline and Thinking. React typecheck,
  i18n and upstream checks pass. The separately recorded baseline failures are not
  included in that green focused subset.

- Actual restored B Plugin Runtime native controls: **8/8 PASS**, across both
  locales/viewports/Light-Dark (`native-ant-runtime-final.log`). Original Host
  ConfigProvider is retained; Input/Button/Card/List/Modal have identical props,
  no local repair CSS, and computed-style parity in default/hover/focus/disabled
  states. Modal Portal, Escape, Tab/Shift-Tab and trigger focus return pass.
  This is a manual test component substitution, not a new Creator delivery.
  Initial setup failures due to reading navigation before mount are retained in
  `native-ant-runtime-resolved.log` and `runtime-native-ant-initial.json`; the
  final run waits for actual frame/navigation mount and does not waive them.
