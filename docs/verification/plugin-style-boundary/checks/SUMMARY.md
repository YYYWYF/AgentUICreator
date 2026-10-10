# Implementation checks

- `pnpm --filter @agent-ui/react build`: PASS (including public declaration and
  optional Lexical boundaries).
- `pnpm --filter @agent-ui/react typecheck`: PASS (source and test TypeScript).
- `pnpm check:i18n`: PASS, no locale parity failures.
- `pnpm check:assistant-ui-upstream`: PASS, upstream-owned Elements unchanged.
- Focused Vitest group: 12 files / 45 tests PASS. Includes plugin-style-boundary,
  product-style-ownership, migrated/assistant-ui-style-isolation,
  portal-container-boundary, product-localization-generation, sidebar-frame,
  tool-timeline-composition, thinking-indicator-policy,
  composer-input-slot-lifecycle, image-zoom-portal, assistant-ui-portal-sync and
  quote-upstream-regression.
- Additional `assistant-ui-integration-boundary.test.ts` group: 3 PASS / 1 FAIL.
  Failure is the existing requirement that foundation-core's Agent.tsx contains
  the literal `<AgentUIRoot theme={theme}>`. At baseline e8ad8796 the test already
  requires this literal and the baseline template already lacks it, confirmed
  directly with `git show HEAD:<path>`. That template is unchanged by this work.
  The adapter provenance, vendor separation and Portal checks in this file pass.
- Browser / visual / interaction acceptance: NOT RUN at user request.
- Full repository test suite and GitHub CI: NOT RUN.

pnpm reports that node_modules and the lockfile are out of sync. Vite reports
existing native config-loader compatibility warnings. No dependency installation
or lockfile change was required for these checks.
