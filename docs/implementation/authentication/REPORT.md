# Optional authentication delivery — 2026-10-09

Implemented two opt-in source plugins: `auth-gate` (the unique owner of both
`auth.gate` and `auth.session`) and `auth-account` (required session consumer).
No default preset installs either plugin. Includes typed account/password service
contract, fail-closed Host adapter template, explicit isolated demo adapter,
localized login/account UI, stable observable snapshots, stale-operation guards,
expiry/profile subscriptions and local revocation even if remote logout fails.

Sidebar Footer is optional and uses ordinary visual Slot composition. Schema,
compiler, runtime traversal, service composition, Creator mutation schema/local
refs, Inspector/diagnostics and authoring instructions are updated together.
Header, navigation, content and application plugins are preserved. Footer uses
existing SidebarFooter and follows local narrow Sheet containment. Empty or
disabled Footer adds no chrome. React facade version is `0.1.6`; Layout runtime
version is `0.1.3`, with updated Source Registry minimum ranges.

The generated native and compatibility Hosts put existing Application Gate
lifecycle outside the canonical conversation provider. Foundation services persist
across login/logout; Workspace services deactivate on revocation. Runs abort and
bridges dispose immediately; provider, bindings and caches remount for the next
ready epoch, including batched account switches. Initial persisted thread identity
is discarded after the first revoked epoch. Login gates use container sizing,
not viewport sizing. No vendor or AG-UI protocol changes are included.

## Checks

- Auth/session/Gate/Host-boundary unit tests: 18 passed, including existing
  Application Gate tests. Covers failed login/restore, fail-closed configuration,
  expiry, profile updates, delayed restore/login, remote logout failure, duplicate
  service owners, missing consumer dependency, hidden account and one setup owner.
- Sidebar schema/compiler/operation tests: 21 passed.
- SidebarFrame DOM unit tests: 7 passed, including local narrow Footer and no
  placeholder after removal. These are unit checks, not visual acceptance.
- Default preset opt-in tests: 3 passed.
- Source Registry contract tests: 4 passed.
- React, Project Control and Source Registry typechecks/builds passed.
- `pnpm check:i18n`: passed, en-US/zh-CN parity.
- `pnpm check:assistant-ui-upstream`: passed; upstream vendor unchanged.
- Disposable independent Platform consumer with both plugins: TypeScript and
  production Vite build passed without importing Creator. Local package tarballs
  for React facade, Layout runtime and Source Registry were produced.

The isolated submission tree also passed the entire Plugin Service suite: 36
passed (54 combined authentication/Gate/Plugin Service tests). The independent
consumer was typechecked and built against unpacked React/Layout tarballs from
that submission tree, with the Host's ordinary frontend dependency closure.
Ungated Hosts preserve their existing conversation lifetime on model updates.

## Failure attribution and scope

Broad Plugin Service suite in the original dirty workspace: 35 passed / 1 failed.
`activates the headless theme provider before an injected consumer` expects Light,
but an unrelated pre-existing `theme-config.ts` change sets Violet. That change
is preserved and excluded from this commit.

`source-registry release:verify` is blocked by pre-existing `conversation-quote`
source/version/changelog drift. This delivery does not repair that unrelated
plugin or claim npm release readiness. An initial standalone build invocation
lacked the Host's Tailwind Vite plugin; adding the existing plugin resolved it.

Per the user's explicit “不要验收”, no browser E2E, Light/Dark/Violet screenshots,
real-backend login, live Creator/model runs or product/visual acceptance were run.
No screenshots or browser acceptance results are claimed. Host owners still need
to implement their real auth adapter and propagate expiry/401 through it. Demo
storage is display data only and is never production authentication. The backend
must independently authorize protected requests.

Other pre-existing workspace changes are preserved and excluded from this
submission. Installation and recovery instructions are in `README.md` beside
this report; source installation and model mutation remain separate operations.
