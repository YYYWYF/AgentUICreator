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
