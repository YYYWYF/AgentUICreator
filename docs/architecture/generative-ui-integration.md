# Official Generative UI Integration

`integration/generative-ui` is an optional Official Integration, not a Plugin,
Foundation or Tool permission. It does not mutate AppUIModel or mount a
ConversationIntegration. Default foundations never install it or A2UI.

```text
agent-component/assistant-ui-generative-ui
  → official styled element + scoped vocabulary CSS + UPSTREAM.json
integration/generative-ui
  → JSONGenerativeUI factory + official Action Registry factory
integration/a2ui
  → AG-UI activity protocol adapter + render-only present projection
```

## Release and ownership

The released family is fixed, without a floating branch:

| Package | Version | Release commit |
| --- | --- | --- |
| @assistant-ui/react | 0.15.22 | f008537f39f0936992b0f6d2433c092935df5faf |
| @assistant-ui/react-ag-ui | 0.0.62 | da9a624496ae97864ae30e90f85c7533092a228d |
| @assistant-ui/react-generative-ui | 0.0.21 | da9a624496ae97864ae30e90f85c7533092a228d |

The shared source pin is the latter commit, where React is still 0.15.22.
`assistant-ui-upgrade-target.json` records each package's release commit.
The lockfile resolves core 0.3.21, store 0.3.15, tap 0.9.19 and assistant-stream
0.3.45 without forced overrides. React Hook Form remains 0.12.34; Markdown
remains 0.14.16 and LangGraph remains 0.14.29. Their execution regressions were
not run for this delivery.
`integration/react-hook-form` retains its separate provenance revision
`039c3c32822632f2a564164f089f538926886124`, which actually contains 0.12.34.

assistant-ui owns vocabulary, rendering, actions and form collection.
AgentUICreator supplies only thin factories and optional source installation:

```ts
import {
  createAgentUIGenerativeUI,
  createAgentUIGenerativeActions,
} from "./integrations/generative-ui";

const generative = createAgentUIGenerativeUI({
  actions: createAgentUIGenerativeActions({
    save: ({ payload }) => console.log(payload),
  }),
});
```

`agentUIGenerativeUILibrary` is the official `styledGenerativeUILibrary` object.
The styled element uses ReactMarkdown and remarkGfm. Its Source item explicitly
requires both dependencies. Official vocabulary CSS is serialized from
`packages/ui/src/lib/generative-ui-vocabulary-css.ts`; every selector receives
only the `.agent-ui-conversation` prefix, including media and comma-separated
selectors. Canonical assistant-ui theme variables come from
`@agent-ui/react/styles.css`. There is no local A2UI stylesheet.

Regenerate source with
`pnpm --filter @agent-ui/source-registry sync:generative-ui-upstream`, using the
local assistant-ui repository and the fixed release revision. Installed
`UPSTREAM.json` records original paths, original/installed hashes and mechanical
adaptations; the styled element has no source patches. Existing vendor source
continues through `sync:assistant-ui-upstream`. Release-pinned revision and
package guards verify the frozen release rather than requiring remote main or
npm latest; ordinary unpinned upgrade targets retain the previous latest checks.

## Capability and permission

The factory exposes official `present()` and `promptUser()` capabilities.
`present()` returns a frontend Tool definition, while `promptUser()` returns a
human Tool definition. Installing the Integration authorizes neither. No files
are installed in the frontend Tool contract or automatic conversation Host seam.
Nothing adds `present` or `prompt_user` to `RunAgentInput.tools`.

For legacy v1 projects, the separate scenario-resource lock owns every installed
dependency, including the styled agent-component. Workbench merges resource
inspection for entries with `installedVersion`, representing lock-owned source
or provided Host foundations, regardless of Source kind or inspection status.
Unowned entries keep normal inspection. The installation root allowlist remains
demo/integration; Host foundations remain provided, unadopted and unwritten.

A2UI takes only `present.render` for a backend presentation item. Explicit
`integration/generative-ui-present` and `integration/generative-ui-prompt-user`
authorization resources remain future design work. No AppFrontendToolRuntime
permission seam, backend behavior or React Hook Form contract is redefined here.

## Actual 0.0.21 capabilities and upstream gaps

The initial proposal overestimated this release. Inspection of its exact source
established the following boundaries; the user approved retaining the release
and recording these gaps rather than implementing substitute components.

| Requested capability | Released behavior |
| --- | --- |
| Card, Row, Col, Fact, Badge, Alert, Table, Chart, Form | Official vocabulary available |
| Input, Select, Checkbox, RadioGroup, DatePicker | Official controls; actions supply current `$input` |
| Markdown, Image, Icon, ListView | Official vocabulary available; styled Markdown renders GFM |
| Slider | Absent from vocabulary and A2UI Basic Catalog |
| CheckboxGroup | Absent from vocabulary and A2UI converter |
| ChoicePicker multipleSelection | Does not map to CheckboxGroup; no multiselect support claimed |
| `$field` | No resolver; action values are passed through |
| Input.defaultValue / A2UI TextField initial value | Not supported; use placeholder in the fixture |

Forms collect named controls through the official Form action's `$input` object.
That mechanism is distinct from the unavailable `$field` expression. The gallery
fixture in `examples/agent-frontend/tests/fixtures/generative-ui-gallery.ts` uses
only actual official `$type` vocabulary; it is not a Mock wire scenario. Table
and Chart are never presented as A2UI Basic Catalog components.

Active regression sources cover vocabulary rendering, Markdown semantic DOM,
Button action dispatch, supported controls' `$input`, Form collection, explicit
absence of unsupported APIs, provenance, optional installation and unchanged
wire Tool permission. Test presence does not mean execution or acceptance.

## Delivery validation status

At the user's request, no tests, typecheck, build, upstream checks, visual
acceptance or runtime acceptance were executed for this change. Package resolution,
installation and source synchronization are delivery operations, not behavioral
verification. Cold A2UI history still needs a backend Activity persistence contract.
