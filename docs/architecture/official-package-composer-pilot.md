# Official package ownership: Composer pilot

Phase 1 adds dependency ownership to the existing Plugin System. It does not change
Plugin Contract, AppUIModel, SlotRegistry or conversation runtime ownership.
Only `assistant-ui-composer` changes delivery in this phase. Other official
plugins retain their existing source delivery until a separately accepted rollout.

## Source and production boundaries

`packages/source-registry/registry/items/plugin-assistant-ui-composer` remains the
sole official implementation and upstream adaptation authority. Creator reads it
through `inspect_ui_plugin`; its reference paths are not writable authoring paths.

`packages/plugins` publishes one `@agent-ui/plugins` package. Its only Phase 1
entry is `@agent-ui/plugins/assistant-ui-composer`. There is no root implementation
barrel. Build materializes ignored `.generated` files from Source Registry,
validates/types them, and bundles the entry into `dist`. No implementation is
maintained in a second `src` tree. Build provenance records reference ID, source
hash and graph inputs. The generated compatibility bindings use the public
`@agent-ui/react` locale context and the stable `agent-ui.locale` service ID;
the original reference source and vendor remain unchanged.

The package owns no Agent Runtime. Its frontend peers and host locale provider
are production dependencies independent of Creator. Hosts install the package
and retain their own frontend stack. This change is committed source for the
next package release; it does not publish to npm.

## Facts, discovery and selected registry

The Source Registry official package catalog separates `runtime` delivery from
`referenceSourceItemId`. Project Control merges those dependency-owned assets
with project-owned source manifests and definitions. Ownership is exposed as
`official_package` or `project_source` in project facts.

Discovery uses the full development catalog. The generated runtime catalog emits
`import()` only for plugin IDs selected by AppUIModel, including nested Slots.
Removing the last instance removes its runtime import while keeping discovery
metadata. Disabled instances still select their definitions so they can be
reenabled without requiring a regeneration during production runtime.

`packages/source-registry/src/package-plugins.ts` is the sole runtime package
metadata authority (package, subpath, version, reference item and services).
Official Resources resolve delivery from that catalog and retain only their product
semantics. Source Items declare reference-source requirements; installation adds
runtime dependencies from the catalog rather than the reference Item's packages.

Source Registry build/release checks and the official package build evaluate the
reference definition's `provides`, `inject` and `optionalInject`, including imported
service constants, against catalog metadata. Presentation components and manifest
parsing are stubbed only for this metadata check; service expressions are evaluated
from the actual reference source closure. Drift or unresolved metadata fails with
`OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT`. This check lives in development/release
tooling and does not enter the generated frontend.

Official manifest/service metadata is authoritative. Package availability is
checked before selected definition admission. Host source/Slot/style checks do
not try to parse npm import specifiers as project filesystem paths. Dependency
implementations are checked by the package build.

An official Composer local manifest is rejected with
`PLUGIN_ID_RESERVED_BY_OFFICIAL`; there is no package/local precedence rule.
Official targets are `official_plugin_reference` with no writable root or source
binding. A new custom ID retains the normal writable `plugin_source` target.

## Customization

First inspect config, public APIs and semantic child Slots. For a thin extension,
`create_custom_plugin` accepts `basedOn`, the custom capability tags and a
`plugin_slot` placement. It derives a legal manifest without inheriting Composer
child Slots. For full replacement, pass `basedOn: assistant-ui-composer` and
`replaceInstanceId`; the Host preserves the existing instance ID/config/Slots.
A supplied implementation exports `CustomPlugin` using public primitives,
controller and locale APIs. The default replacement uses public
`ConversationCanonicalComposer`, rather than copying the reference implementation.

Host creation validates IDs and composition, creates manifest/definition/view,
generates the selected registry, and executes available host `typecheck`, `build`
and `test` scripts in a temporary project. A `build` script is required. Failures
leave the live project unchanged. It rechecks model/ownership and cancellation
before committing source, model and registry through the existing source journal.
The formal operation is available over Project Control and as a Creator tool.

A Host-resolved official customization handoff authorizes its corresponding
custom derivation without an additional new-plugin approval round. Other new
capability work retains the existing development admission. Creator source
mutation tools reject writes to the official Composer ID. Filesystem policy
continues to exclude `node_modules`. Custom feature sync is a semantic port from
current custom source plus latest reference/public contracts, never overwrite or
whole-plugin merging. Missing public APIs are contract gaps, not permission to
copy private implementations.

## Migration

`migrate_official_package_plugin` compares every legacy file with the installed
Source Lock baseline, rejects extra/missing/modified files and symlinks, requires
the package entry, then journals removal, lock update and selected registry.
AppUIModel IDs stay unchanged. Unknown or modified baselines produce
`LEGACY_MODIFIED_OFFICIAL_PLUGIN` and preserve source. Port custom behavior under
a new ID before removing such a legacy copy. A controlled full custom replacement
may retain the legacy copy while excluding it from the generated runtime graph;
normal inventory continues to diagnose its reserved ID until cleanup is explicitly
completed. No modified legacy source is automatically deleted.

New initialization materializes no Composer source or Composer source-lock item.
Official Composer installation performs migration before activation. Example
Host `ensure` uses the same operation before readiness inspection, and preserves
modified legacy copies by stopping with the migration diagnostic. Removing an
official plugin instance keeps its dependency-owned discovery metadata and does
not delete npm implementation files.

## Validation recorded on 2026-10-08

- Actual Vite library build checks the Composer subpath output graph; no other
  official plugin implementation enters it. Source-registry reference remains.
- Project Control tests cover selected imports, reserved IDs, writable targets,
  full replacement build, thin Slot extension, failed-build rollback, safe baseline
  migration, modified-source preservation and initialization in all three modes.
- Creator Python tests use a scripted Selector response to the natural-language
  request “把输入框改成我们自己的，发送按钮旁边加一个业务按钮。” and verify the
  reference handoff, formal tool forwarding and bounded derivation admission.
  This is deterministic route coverage, not real-model E2E evidence.
- Relevant package builds, TypeScript checks, contract inventory and i18n parity
  are checked separately from product acceptance.
- A broader existing Python selection has 37 failures / 135 passes. An archived
  unmodified HEAD reproduces the same result; examples include stale control-entry
  fixtures, old tool ordering and an existing mutation result fixture mismatch.

Per the requested scope, browser/visual, real-model E2E, deployment and final
product acceptance are not run. Expansion beyond Composer waits for acceptance.

## Explicit real-model Composer acceptance

Run `pnpm verify:creator:official-composer-live` when acceptance is requested.
The runner loads the normal `.env.creator.local` model settings, selects only
`tests/live/test_official_composer.py`, and sets the existing live-model opt-in.
Ordinary test runs skip the test. StaticChatModel regressions remain unchanged.

The test initializes a disposable platform Host with real Project Control, runs the
natural-language request above through the real Selector and Creator Agent, and
asserts an `official_plugin_reference` handoff with no writable owner binding.
It requires official `inspect_ui_plugin`, then public Slot/API inspection, then
successful `create_custom_plugin` with a real Host build. It accepts either a custom
replacement at the original Composer instance or a custom Plugin mounted in a
Composer child Slot, without prescribing custom IDs.

Model callbacks capture proposed tool calls before admission (so forbidden attempts
cannot hide behind a rejected Host call). Host calls and the normal Creator JSONL
trajectory provide execution evidence. Assertions reject official source mutation,
official-ID shadow creation, dependency-directory writes, changes to reference or
package files, and a local `plugins/assistant-ui-composer` directory. Final Host
inspection must report at least one newly created `project_source` Plugin.

Implementation checks: Source Registry 29 tests, Project Control package pilot
9 tests, Python StaticChatModel/admission 3 tests, package boundary 1 test and
runner 6 tests passed, with relevant builds/typechecks. The broader release check
remains blocked by the existing `conversation-quote` version/changelog drift,
reproduced at unchanged HEAD; the new service metadata check passed before it.
Per the instruction to push without acceptance, the live test was collected and
skipped with opt-in disabled; no real-model or visual acceptance was executed.
