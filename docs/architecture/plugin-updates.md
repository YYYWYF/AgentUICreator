# Host-owned plugin updates (Mock releases)

Creator checks installed Source-lock plugins asynchronously after a ready project
opens. The development Host uses `UpdateSourceProvider`; its default
`MockUpdateSourceProvider` retains immutable local Registry snapshots at
`packages/source-registry/fixtures/releases`. The current Registry baseline is
Release `0.1.0`; the default Mock latest is `0.1.1`, advancing Conversation Surface
and Web Search from Plugin `0.0.1` to `0.0.2`. The new fixture also changes the
Conversation Surface manifest and definition to exercise derived registry sync.
Historical `0.0.1` / `0.0.2` fixtures remain available for existing unit coverage. Mock descriptions deliberately describe development fixtures, rather
than claiming production fixes. No remote Registry is contacted.

Four independent identities remain: package release version, Plugin manifest
version, official source hashes, and the sorted plugin/version notification
fingerprint. Source Item IDs still have no version. Every official Plugin starts
at `0.0.1`. `registry/release.json` declares release metadata, while each Plugin
item owns its authored `changelog.json`.

## Release preparation

Run `pnpm --filter @agent-ui/source-registry release:prepare -- <target-root>
<previous-official-root>` to bump changed plugins by one patch when their version
has not advanced. The release owner must supply the new changelog entry and set
the package release metadata; preparation never generates release descriptions.
Missing descriptions fail verification even after a bump. Run `release:verify`
with the same paths to check without writes. The default baseline is the initial
fixture. For subsequent official releases, pass the actual previous official
release. `prepublishOnly` requires `AGENT_UI_PREVIOUS_RELEASE_ROOT` for the
actual previous official release, or `AGENT_UI_INITIAL_RELEASE=1` for a first
release, and checks package/release version agreement. Historical changelog entries must be
retained. The future production Provider must retrieve every referenced historical
release by exact version; no latest lookup may replace a missing BASE.

## Control boundary

`AgentUIUpdateService`, exported via `@agent-ui/project-control/updates`, owns
inspection, dependency planning, compatibility admission, project-bound expiring
plan IDs, and execution. Creator's Vite Host exposes these operations under
`/__creator/updates`. `updateSourceProvider` is an injectable Host option. No
update logic or Creator dependency enters the generated production frontend.

A plan lists the complete dependency closure, package conflicts, source statuses,
changed file count and compatibility. It never writes. Only an explicitly
confirmed plan is executable. Host rechecks the source state and lock provenance
before using the existing Source storage transaction inside the Host journal.
All requested managed plugins and dependencies commit together. Generated
registries and project verification run before releasing the journal; failures
restore the previous files and lock. The journal retains update target paths so
crash rollback can also remove files absent from the Host's installed Registry.
Host-provided foundations cannot be overwritten by this flow.

Contract incompatibility yields `creator-upgrade-required` or `unsupported`,
blocks mutation, and stays visible in inspection. Partial sources, occupied paths,
missing packages, and changed Host-provided foundations also block a plan.
Customized sources are never available through a force-overwrite action. A target
package release older than any installed Plugin baseline in the dependency
closure blocks the plan with `AGENT_UI_UPDATE_RELEASE_REGRESSION`, independently
of Plugin version comparisons.

## Creator UI and merge authorization

The right-hand Settings menu checks updates manually. Automatic failures stay
quiet; manual failures are explicit. Notifications remember the project and update
fingerprint through `UpdateNotificationStateStore`, currently backed by local
browser storage. Manual checks ignore dismissal. The internal update page hides
conversation presentation without unmounting or resetting the Creator session.
It shows all intervening changelogs and a concrete plan before confirmation.

For a customized closure, the user chooses model merge or manual merge. Host
resolves historical BASE using lock provenance, reads LOCAL and resolves TARGET.
The model receives these file contents through the existing Creator request and
edits source with existing tools. The user can inspect BASE/TARGET and edit in an
IDE instead. Completing a merge is a separate explicit action: Host verifies
unchanged lock provenance, opens the existing owner journal and snapshots Source,
lock and derived outputs, regenerates Plugin / frontend tool / conversation
integration registries with the canonical generators, then verifies the current
project and target file existence/removals. Only after successful verification
does it commit official hashes and the Plugin/release baseline. Generation or
verification failure restores the entire before-state and keeps the plan retryable.
User Source bytes are untouched by successful adoption; generated artifacts may
change. Host checks that non-generated snapshot bytes stayed unchanged, while
allowing expected inspection fingerprint changes caused by generation. Retained local changes therefore remain
customized against the new official baseline. Verification failure does not
advance the baseline. If merged bytes exactly match official bytes, hash inspection
truthfully reports managed.

Legacy locks remain readable. They do not invent Plugin versions or historical
BASE releases: the page reports an unrecorded version, safe managed sources can be
upgraded, and customized sources without recoverable provenance require manual
merge. Restarting the Host invalidates pending merge plan IDs; source edits remain
and a fresh plan is required. Manual completion asserts semantic completion;
structural verification cannot prove that every intended upstream behavior was
merged.

All-updates calculates one merged closure and refuses direct execution when any
changed member needs merge. Individual plans let users first update independent
safe plugins. No channels, periodic checks, remote authentication, forced overwrite,
new merge engine, or conflict editor is included.

## Validation

Focused unit coverage exercises exact historical resolution, release checks,
notification dismissal and manual checks, confirmation before mutation, stale
plans, source/lock rollback on verification failure, customized baseline adoption,
next-merge BASE selection, dependency upgrades, and compatibility refusal.
UI/model behavioral acceptance is deliberately outside this implementation run.

Builds of Source Registry, ProjectControl and Creator passed. Source Registry
passed 21 unit tests, the focused update/source suites passed 22 tests, and the
existing Source mutation suite passed 40 tests. The new UI unit suite passed
2 tests. The broader checks still expose pre-existing Workbench receipt
expectation failures (reproduced with HEAD code), a Source architecture guard
violation in unchanged `plugin-purge.ts`, and Creator test-fixture type errors
about missing `owned` fields. These do not constitute behavioral acceptance.

## Follow-up repairs

The default Mock package timeline is now `0.1.0 → 0.1.1`. Focused unit tests start
from the current Registry rather than only a historical fixture, reject package
release regression, and exercise manual adoption with real generators and the
real project verifier. An injected verification failure occurs after generated
Plugin metadata changes, proving artifact/lock rollback and preservation of
merged Source. Exact target bytes naturally report managed; retained user edits
report customized. No browser or real-model acceptance is performed.

TODO before the first real release: production Hosts must explicitly configure
`UpdateSourceProvider`; an absent provider must not silently select Mock. This
production policy is deferred and does not block the current development flow.
