# Retained assistant-ui upgrade evidence

This document preserves the earlier upgrade and acceptance record as it stood before the 0.15.23 / 0.0.63 sync. Version and check claims below describe those earlier runs, not the current dependency graph.

# assistant-ui Release Upgrade Impact

Fixed release targets:

- `@assistant-ui/react`: 0.15.21 → 0.15.22; release `f008537f39f0936992b0f6d2433c092935df5faf`
- `@assistant-ui/react-ag-ui`: 0.0.60 → 0.0.62
- `@assistant-ui/react-generative-ui`: 0.0.19 → 0.0.21
- Shared source and latter two releases: `da9a624496ae97864ae30e90f85c7533092a228d`

AG-UI remains 0.0.59. React Hook Form remains 0.12.34, LangGraph 0.14.29,
Markdown 0.14.16. The lockfile unifies core 0.3.21, store 0.3.15, tap 0.9.19
and assistant-stream 0.3.45 through compatible dependency resolution, without
an override. Local dependencies were installed from the frozen lockfile.

The existing vendor sync changed six tracked upstream files, added no vendor
files and applied no source patches. Generative UI presentation was separately
adopted through Source Registry, with official source hashes and selector-only
Host scoping in its own installed `UPSTREAM.json`.

## Architecture impact

`integration/generative-ui` owns the official factories and depends on
`agent-component/assistant-ui-generative-ui`. A2UI depends on that Integration
and remains only a native protocol/action adapter with a backend render
projection. Both optional integrations grant no `present` or `prompt_user`
permission and remain outside default foundations. No AppUIModel change,
Plugin, local converter, new history persistence contract or OpenUI integration
is introduced.

## Actual release limitations

The fixed 0.0.21 source lacks Slider, CheckboxGroup, ChoicePicker multiselect
mapping, `$field` resolution and Input.defaultValue. The user approved keeping
these as explicit upstream gaps. Fixtures and positive regressions cover the
released vocabulary and mappings, plus gap regressions. Form value collection
uses official `$input`; A2UI Save demonstrates continuation only.

react-ag-ui 0.0.62 carries official A2UI rebuild operations in `artifact.a2ui`
and preserves other Activity snapshots as scoped data parts. Regression source
covers these changes. Restored Activity history support upstream does not extend
the current application LangGraph checkpoint adapter's persistence contract.

## Validation status

At the user's explicit request, tests, typecheck, build, upstream check scripts,
visual acceptance and runtime acceptance were **not executed**. Source sync,
package resolution and installation do not establish behavioral compatibility.
Existing frontend-tool, React Hook Form, history, cancellation, multi-thread and
Plugin Tool UI regression suites remain in place, without a new pass claim.

## Multimodal input integration (phase 1)

The public `ConversationRuntimeProvider.attachmentAdapter` accepts the official
`@assistant-ui/react` `AttachmentAdapter` type. This deliberate type-only seam is
allowlisted by the declaration boundary guard; all other upstream declarations
remain prohibited. Generated `Agent` forwards the same adapter from Host props.
No second capability flag, attachment store, message converter or transport
extension is introduced. Runtime attachment capability comes from the adapter.

| Responsibility | Owner |
| --- | --- |
| Attachment presentation and Composer primitives | assistant-ui (existing canonical components) |
| Attachment lifecycle | assistant-ui AttachmentAdapter / Composer Runtime |
| Multimodal AG-UI serialization | @assistant-ui/react-ag-ui |
| AG-UI transport | @ag-ui/client HttpAgent |
| File preparation and application storage | application-provided AttachmentAdapter |
| Integration/configuration/regressions | AgentUICreator |

`@agent-ui/mock-agent/attachments` provides `DemoAttachmentAdapter` for development
only: image/* and application/pdf, at most 5 MiB per file, browser FileReader data
URLs, no upload server or retained state. Example Hosts inject it only in DEV.
Production Hosts must supply their own adapter (for example an upload URL adapter).
The demo is not a production file-storage contract and requires no Creator package.

The pinned react-ag-ui 0.0.62 source converts assistant-ui image parts into AG-UI
`image` input, and file parts with application/pdf into `document` input in core
0.0.59. It preserves the plain string path for text-only messages. This is source
inspection evidence, not a behavioral pass. Dependencies are unchanged in version.
The official LangGraph 0.14.29 history converter accepts multimodal HumanMessage
parts; regression source exercises image_url and file blocks without forking it.
Live attachments and persisted checkpoint restoration remain separate contracts.

`multimodal-input` is a standard RunAgentInput scenario with a fixed TEXT_MESSAGE
confirmation. It deliberately does not infer receipt from a fixed reply. Inspect
the actual /agent request, or run the added contract tests, to establish receipt.
The Scenario DSL and HttpAgent remain unchanged.

Regression source includes provider capability wiring; real installed converter,
runAgent and HTTP request coverage for text/image/PDF/multiple/removed/image-only
inputs; official history conversion; canonical Composer file selection, drop,
paste, deletion and UserMessage attachment rendering; demo adapter bounds/abort.
These tests, typecheck, builds and browser/runtime acceptance were **not run** at
the user's request. There is no new runtime compatibility/acceptance claim.

On every upstream upgrade, inspect the official AttachmentAdapter type,
useAgUiRuntime.adapters.attachments, Composer attachment primitives (including
paste), UserMessage attachment presentation, the real multimodal wire regressions
and official history restoration. Any unsupported media/history shape must be
recorded as an upstream gap; never patch converters, hide files in metadata or
introduce a custom event protocol to work around it.

## Phase 1 upgrade-safety repair

Demo images now use the public `SimpleImageAttachmentAdapter`; the public
`CompositeAttachmentAdapter` owns routing and the combined accept string.
`DemoAttachmentAdapter` adds only the 5 MiB entry policy, and
`DemoPdfAttachmentAdapter` owns only PDF preparation. Local FileReader/abort
handling is limited to PDFs. Application production storage remains external.

The declaration checker now uses an explicit module/type allowlist without
rewriting declaration text. The only allowed name is `AttachmentAdapter` in a
named type import. Both its public react re-export and its official defining
module `@assistant-ui/core` are recognized (the current workspace declaration
names core). Other upstream types, value imports, namespace imports, re-exports,
import() references, react-ag-ui and primitives remain rejected. Multiline imports
are covered, and an allowed occurrence never exempts another forbidden import.
The Runtime injection, Agent prop forwarding, wire converter and transport are
unchanged by this repair.

Automated checks executed on 2026-09-27, without manual/browser acceptance:

- runtime-conversation, mock-agent and react: typecheck and build passed.
- New demo adapter tests: 6 passed, including real official image/PDF routing,
  accept, size bounds and pre-read abort.
- New declaration allowlist tests: 24 passed. The real emitted declaration
  boundary and consumer typecheck passed during runtime-conversation build.
- Full runtime-conversation test command failed: 14 failures and 17 unhandled
  errors, including existing package-policy expectations, wire-test fixture
  readiness timeouts, history expectations and cancellation errors.
- Full mock-agent tests (rerun outside the sandbox for local HTTP listening):
  72 passed, 8 failed, including scenario catalog/count expectations and timing.
- Full react tests (rerun outside the sandbox for local HTTP listening):
  220 passed, 45 failed; 49 test files failed, including fixture import paths,
  theme service declarations, history/tool expectations and the attachment smoke
  test's missing Remove file button. No full attachment UI pass is claimed.
- Workspace `pnpm typecheck` was rerun after an initial concurrent Host build
  race; it failed in project-control/tests/host-public-entry.integration.test.ts
  on RolldownOutput | RolldownWatcher.output (TS2339).
- Workspace `pnpm test:ts` failed in existing bootstrap fixture paths
  (/presets/assistant/app-ui.json and non-file import URLs), so it did not
  establish a successful workspace regression baseline.

Unrelated dirty worktree changes are preserved outside the repair commit.
These failures were reported, not suppressed or expanded into an unrelated
Runtime/UI/fixture redesign. Existing multimodal wire regressions remain intact.

## Final focused multimodal acceptance repair

The wire fixture now exits its mount act after an effect flush, checks that the
Runtime was captured, and waits for readiness in a later act. No Runtime,
attachment lifecycle or transport behavior changed. All six real Composer ->
react-ag-ui -> HttpAgent -> HTTP cases pass: text-only string, text/image,
text/PDF document, ordered images, removed image and attachment-only send.
The capability injection regression also passes.

The canonical UI test locates Remove file by button accessible text (including
upstream sr-only text), rather than assuming aria-label. Draft updates are flushed
before clicking Send, and completion requires observing the HTTP request. Select,
preview, remove, send, UserMessage echo, absence of sent-message removal, drop and
paste all pass without changing canonical presentation.

The official LangChain projector output contains text, image and PDF file parts.
The original exact text comparison failed because upstream adds Symbol metadata;
the regression now compares public fields, just as the image/PDF assertions do.
Image/PDF history restoration passes; there is no media-shape upstream gap for
this fixture and no converter fork. History remains separate from live input.

### Public type seam investigation and isolated package evidence

Importing AttachmentAdapter from @assistant-ui/react does emit a formal react
entry in dist/public.d.ts. That route was tried first, but strict consumer
checking (exactOptionalPropertyTypes: true, skipLibCheck: false) traverses the
pinned react 0.15.22 declaration surface and fails in upstream Radix declarations:
@radix-ui/primitive references setImmediate, and @radix-ui/react-select 2.3.7 has
incompatible onPlaced inheritance (TS2320). Weakening consumer checks, patching
upstream or upgrading unrelated presentation dependencies is outside this repair.

The supported defining-module fallback therefore remains AttachmentAdapter from
@assistant-ui/core 0.3.21, which is already a real runtime-conversation dependency
in package.json/lockfile. The explicit allowlist permits only AttachmentAdapter;
react-ag-ui, other types, primitives, runtime types and value imports stay rejected.
Revisit this fallback when the upstream formal entry supports strict consumers.

check-consumer-types.mjs now packs the actual runtime-conversation, react and
runtime-core publishable tarballs and installs them in a separate temporary
project. Overrides point only the local unpublished Agent UI packages to their
real tarballs; external dependencies use the package manager. Copy import mode,
a local virtual store and empty NODE_PATH prevent borrowing workspace package
node_modules. Realpath assertions require both Runtime and its core dependency
to resolve inside the isolated install. The consumer does not directly declare
core, verifies the packed Runtime's dependency declaration, checks a valid
AttachmentAdapter and rejects an incomplete adapter via @ts-expect-error.
Installation prefers the package cache but may need registry access; dependency
fetches have bounded timeout/retries. Consumer typecheck remains skipLibCheck:false.

### Final focused results (2026-09-27)

- runtime-conversation attachment/wire/history tests: 8 passed.
- mock-agent demo attachment tests: 6 passed.
- react canonical attachment UI tests: 3 passed.
- public declaration allowlist tests: 24 passed.
- runtime-conversation, mock-agent and react typecheck/build: all passed.
- Real emitted public boundary and isolated published-package consumer: passed.

The earlier project-control Rolldown, bootstrap fixture paths and other full-suite
failures are pre-existing/unrelated to this focused repair; their earlier reports
remain above. Workspace-wide suites were not rerun or repaired in this final
pass. No production ConversationRuntimeProvider, converter, HttpAgent or
canonical Attachment UI changes were made for test success.
