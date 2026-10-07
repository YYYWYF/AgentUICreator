# Plugin locale and responsive regression gate

The repository-owned suite runs released Plugins in a disposable generated Host,
using Source Registry files, PluginServiceProvider, the Conversation Runtime,
AppUIModel/Slot composition, and deterministic AG-UI mocks. The Host passes its
locale explicitly to `Agent`; browser language does not select product locale.

Run from the workspace root:

```sh
pnpm --filter @agent-ui/creator-workbench test:e2e:i18n-plugin-visual
```

`playwright.i18n-plugin-visual.config.ts` defines `zh-CN-desktop`, `zh-CN-narrow`,
`en-US-desktop`, and `en-US-narrow` at 1440 × 900 and 390 × 844. The support Host
and spec live under `apps/creator-workbench/tests`.

`tests/support/i18n-plugin-visual-coverage.json` is the shared coverage manifest
used by the suite and report generator. Every ID in Source Registry `release.json`
must have an explicit visual or headless classification and scenario mapping.
Missing, unknown, invalid entries, missing scenarios/projects, failed tests and
skipped tests fail the gate. There is no fixed test-count requirement. When adding
a released Plugin, add its classification and executable scenario together.

Strong assertions cover Thread List labels and accessibility in both locales,
header/message separation on narrow viewports and horizontal overflow, and native
browser selection → localized Quote toolbar → matching composer preview → dismiss.
The Quote toolbar must remain inside the Agent UI portal boundary. Locale-switch
checks preserve drafts, trigger queries and runtime/service identity.

The independent `i18n-plugin-visual` job in `style-isolation.yml` prepares workspace
packages, checks locale parity, runs the suite and uploads evidence with
`if: always()`. Reports and screenshots are generated inside
`apps/creator-workbench/test-results/i18n-plugin-visual/`; the Playwright HTML report
is under `apps/creator-workbench/playwright-report/i18n-plugin-visual/`. The runner
preserves a failing Playwright exit status even if evidence generation fails.
Both directories are ignored locally and uploaded as CI artifacts.

Screenshots are evidence, with no pixel-diff gate or implied manual acceptance.
Scenario and action coverage limits are included in `coverage.json` and CSV.
Known upstream copy gaps remain documented in
[upstream-localization-gaps.md](./upstream-localization-gaps.md); the suite does not
ban English text or alter vendor source. The existing style/upgrade gate also runs
`conversation-quote.test.tsx`, `quote-selection-root.test.tsx`, and
`quote-upstream-regression.test.mjs`.
