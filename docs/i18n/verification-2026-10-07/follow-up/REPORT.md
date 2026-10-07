# Agent UI localization follow-up — 2026-10-07

Scope: Agent UI presentation only. Creator Agent, custom Host presentation, backend content and protocol identifiers are excluded.

## Repairs

- Guarded generated adapters localize reasoning, tool groups/fallbacks, approval/confirmation receipts, task summaries/status, attachment tiles, thread groups/search, audio controls and encoded/media-file names/download labels.
- Public new-thread composition preserves the upstream plus icon. Explicit custom content remains authoritative.
- Default conversation composition now imports localized File, ToolGroup and ToolFallback adapters. System history records stay in the runtime but do not render as assistant replies. Read-only threads disable the product Edit control.
- Existing assistant/embedded local generated examples received locale-only file merges, an Agent locale bridge and localized suggestions. Preview hooks, service definitions unrelated to locale, composition and custom runtime logic are preserved; their generated plugin catalogs were refreshed after declaring locale consumption.
- Tests were calibrated against the pinned runtime API and current official plugin inventory. Missing test agent middleware methods and fixture dependencies were supplied. Deferred updates are allowed to flush between React act blocks; collapsed groups and hover-only actions are tested through their real interactions.

## Evidence

- React: 113 test files, 645 tests passed, no unhandled errors; see react-tests.log and react-results.json.
- React source and tests typecheck, public/lexical boundary build, check:i18n, check:assistant-ui-upstream and git diff --check pass.
- Platform, assistant and embedded each pass independent tsc and Vite build (Creator-free production bundles). Vite reports existing large chunk warnings.
- Browser: actual 5176 plus icon and Chinese UI; audio play/seek/locale switching with retained playback progress; assistant and embedded welcome, suggestions and controls switch languages while keeping draft text.
- Media regression tests preserve player node identity/currentTime, backend filenames, encoded payload/href, errors, and unsafe scheme rejection.
- Generation tests reject changed anchors and check stable JSX tags, icon/style/slot attributes; vendor has zero diff and regenerated adapter provenance passes the upstream gate.

## Limits

Native video transport controls use browser localization; replacing them is outside this presentation fix. This verifies local/browser mock behavior and package gates, not a production backend, CI run or exhaustive coverage of unadopted upstream primitives. Local generated example files are ignored by Git and are intentionally retained with their custom code; portable defaults live in the source registry and public product adapters.
