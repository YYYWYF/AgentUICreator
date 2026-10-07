# Host-owned Integration Recipe

The development Host owns host detection, canonical integration code, application,
and static verification. Creator understands user intent and presents the Host's
recipe. The generated application has no Creator dependency.

`plan_agent_ui_integration(options)` reads package declarations, Vite/Vue CLI
configuration, entry files and target candidates. It writes no project files. Its
result is `planned`, `target-required`, `module-required`, `canonical-react`, or
`unsupported`. Target selection is a user/product decision. Nuxt is unsupported;
React continues to use the existing canonical Source Item/resource path.

A recipe resolves the official `web-component-bridge` resource. It contains a
project-bound content ID, host facts, configuration, canonical before/after edits,
verification identifiers and warning identifiers. Both the guide and automatic
application consume these same edits. There is no Vue Plugin renderer or second
Agent Runtime. Templates live in Project Control, not in Creator prompts.

Creator tools expose planning, asset preparation, application and verification through the existing canonical Project
Control protocol. Guide and manual-check requests route to the read-only agent;
application is classified as a side effect and requires authorization for the
presented plan. `/install web-component-bridge` on a compatibility consumer returns
a Host plan and continues through the same Creator integration request. On a React
producer it retains the existing official resource installer.

## Producer and consumer

The existing installer installs `integration/web-component-bridge` in the canonical
React producer. Its build emits a compiled ESM bundle containing that project's
AppUIModel and React Plugins. Do not install this producer's dependency closure
into a Vue consumer: it includes React/Vite/Tailwind build dependencies.

Vue compatibility defaults to the public compiled distribution `/agent-ui.js`.
Planning checks whether `public/agent-ui.js` exists or the development Host can
resolve its installed official Web Component distribution. Planning writes no
files. After approval, apply exclusively copies the official compiled ESM bundle
into `public/agent-ui.js` if missing, then applies the same Host-owned wrapper and
mount edits. Ordinary apply errors roll back a newly copied bundle. Existing
consumer bundles are preserved. The development Host's Project Control package
owns the distribution dependency; the Vue consumer receives only the compiled
asset, never its producer Source Item or React dependency closure.

The wrapper resolves `moduleUrl` from the fixed `/agent-ui.js` path against the
current page origin and uses
`await import(/* @vite-ignore */ moduleUrl)`. Vite 8 rejects a literal public-file
import even with that comment and adds `?import` to relative dynamic imports.
Using the absolute same-origin URL keeps the compiled asset outside Vite transforms. Explicit
`moduleSpecifier` values remain supported for existing integrations. HTML hosts
still require an explicitly supplied compiled module. Missing Host distributions
return `module-required`; build/install the official distribution in the tool Host
before offering apply. Module resolution is a static file/export check.

`/install` on a Vue consumer returns `status: "integration-required"`. Its localized
activity says “准备 Agent UI 兼容接入”; it does not claim installation. This status
survives conversation reload. The subsequent Creator flow owns target selection,
plan presentation, approval, apply and verification.

## Manual compiled-asset prerequisite

New Vue public-distribution recipes include a small `manualPrerequisites` entry:
`compiled-bridge`, `compiled-asset`, `public/agent-ui.js`, `missing`/`ready`, and
`hostPreparable: true`. This contains no bundle source and leaves the two canonical
Vue code edits unchanged. Older recipes without this optional field remain valid.
The prerequisite status records the planning snapshot; preparation and verification
inspect the current file independently. Keep the original recipe after preparation.

A read-only guide presents three steps: prepare the compiled runtime resource,
create `src/components/AgentUIBridge.vue`, then modify the selected target with the
canonical code. A ready asset needs no action. For a missing asset, Creator explains
that it is an official compiled resource, should not be edited by hand, and can be
prepared by Host while the user edits the Vue files themselves.

`prepare_agent_ui_integration_asset(originalRecipe)` is a mutation requiring user
authorization, unavailable to the read-only agent. It only prepares
`public/agent-ui.js`, returning `ready` plus that path when created, or an empty
`changedPaths` for an existing asset. It does not apply the Vue edits, change
package/entry files, or claim complete integration. Automatic apply and this narrow
action share one internal preparation implementation, including official
distribution resolution, safe paths, cancellation checks and exclusive copying.
After the user manually writes the canonical edits, the existing verify action uses
the original recipe and remains read-only.

## Edits and verification

Vue recipes create `src/components/AgentUIBridge.vue` and mount it in the selected
target. The wrapper alone imports/registers the compiled module, creates the Custom
Element, maps endpoint/locale/theme/threadId props to `element.config`, forwards
`agent-ready`, `thread-change`, `agent-error`, and removes listeners and the element
on unmount. Public modules load through a Vite-ignored dynamic import with disposal
and load-error handling. The wrapper uses a div container, so the consumer need
not change Vue compiler options for custom elements. Vue 2 uses `beforeDestroy`;
Vue 3 uses `beforeUnmount`. No-script Vue 2 targets receive an Options API script.

Initial target edits deliberately support a bounded set of shapes: a single
non-self-closing root in a template, script setup, or a literal default-export
Options API object without an existing components registry. Other shapes return
`INTEGRATION_TARGET_FORMAT_UNSUPPORTED`; Creator must not synthesize an alternative
framework tutorial or rewrite the page. Candidate discovery currently includes
App.vue and top-level views/pages. Recipes reject unknown targets, symlink
traversal, oversized files, modified wrappers, unsafe module specifiers and
noncanonical/tampered recipes. HTML recipes create one registration module and a
mount plus script tag in the selected document.

`apply_agent_ui_integration(recipe)` regenerates the canonical recipe using the
original snapshots, validates its project identity/content, and checks conflicts
before writing. It uses the existing Project Control lock, cancellation markers,
atomic file replacement and rollback on ordinary commit errors. Repeating the
same apply is a no-op. It does not provide a durable crash-recovery journal.

`verify_agent_ui_integration(recipe)` is read-only. It checks the same expected
file contents, module resolution and consumer dependency boundary. Manual edits
must preserve the canonical snippets to pass this first version's exact-content
check; semantically equivalent reformatted code is not inferred as passing. Keep
the original recipe in conversation history for follow-up checks. Verification
can fail without changing files and never implies browser or backend acceptance.

## Development checks

The focused tests cover read-only planning through the actual protocol, explicit
target selection, unchanged entry files, apply/manual/repeat semantics, rejected
stale/tampered input, unresolved modules, symlink boundaries, React/Nuxt decisions,
plain HTML and the Vue CLI/Vue 2 lifecycle. Creator's command and tool-policy tests
cover the shared entry and read-only exclusion of apply. Typechecks, canonical
contract alignment and locale parity are separate from runtime acceptance.

The clean Vue fixture and live regression pack are in
`examples/clean-vue-vite-host` and
`packages/creator-python/tests/live/test_vue_integration.py`. They use the real
Action Selector, domain agents, user-question resume, and managed Project Control
protocol. The initial consumer has no Bridge, wrapper, React, React Vite plugin,
assistant-ui Vue or Web Component package. The test Host installs only its managed
control entry and existing development project configuration before requests.
Guide/manual-check snapshots enforce zero consumer writes. Apply checks the exact
Host recipe, preserved package/entry, verification and visible browser composer.
Existing integration tools also accept JSON-encoded object arguments from compatible
providers at their input-validation boundary; the decoded Host recipe is forwarded
unchanged and still undergoes canonical validation.
This is a focused regression pack, separate from final product/backend acceptance.

Run after installing workspace dependencies and building the official distribution
and Project Control:

```sh
CREATOR_RUN_LIVE_MODEL=1 PYTHONPATH=packages/creator-python \
  packages/creator-python/.venv/bin/python -m pytest -s \
  packages/creator-python/tests/live/test_vue_integration.py
```

The model settings come from the existing workspace `.env.creator.local`.

Focused checks on 2026-10-07 passed: eight Host recipe regressions, 19 command API
checks, two tool argument checks, the live guide case, and the live apply/manual
verification case. The applied clean Vue project passed typechecking, production
build and Chromium composer visibility with no page errors. Creator/Project
Control typechecks, locale parity and canonical contract alignment also passed.
The live cases ran through the actual Selector/domain agents and managed Host
protocol; they do not claim full Workbench HTTP/UI or backend acceptance.

The existing `test_domain_tools.py` and `test_project_control_client.py` suites
have 36 failures and 18 passes. The same failure list was reproduced using HEAD
Python sources and HEAD canonical contracts in an isolated temporary package.
Those fixtures include outdated positional tool expectations and the retired
scripts/tsx control entry. The focused recipe tool test passes separately.


The 2026-10-08 manual-asset follow-up adds three focused Host protocol regressions:
read-only missing-asset planning, asset-only preparation including repeat no-op,
and zero-write verification after canonical manual edits using the original
recipe. The integration recipe suite has 11 passing tests and the tool forwarding/
read-only policy suite has three passing tests. No additional model/browser or
final acceptance was run for this follow-up.
