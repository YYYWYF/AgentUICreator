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
