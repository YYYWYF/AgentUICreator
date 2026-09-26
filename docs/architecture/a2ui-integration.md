# A2UI Protocol Integration

`integration/a2ui` is an optional, pluginless, tool-less Official Integration.
Installing it does not mutate AppUIModel or grant an Agent Frontend Tool permission.
It requires `integration/generative-ui`; dependency closure installs the shared
Integration and `agent-component/assistant-ui-generative-ui`. A2UI does not own
the component library, package requirement or styles. See
[Generative UI Integration](./generative-ui-integration.md) for capability and
permission ownership. The source pin is
`da9a624496ae97864ae30e90f85c7533092a228d`.

| Responsibility | Owner |
| --- | --- |
| Wire protocol | AG-UI 0.0.59 + A2UI; `ACTIVITY_SNAPSHOT` |
| Surface conversion / update / deletion | `@assistant-ui/react-ag-ui` 0.0.62, native `useAgUiRuntime` |
| Rendering and Basic Catalog | `@assistant-ui/react-generative-ui` 0.0.21 |
| Public action API | `@agent-ui/runtime-conversation.useConversationA2uiAction` |
| Render-only Toolkit provider | `@agent-ui/react.ConversationToolkitProvider` |
| Optional source installation and generated Host | AgentUICreator Official Integration seam |
| Restored Activity history | assistant-ui supports restored A2UI activity messages; current LangGraph adapter does not define Activity persistence |

The backend emits `activityType: "a2ui-surface"`, `replace: true`, and
`content.a2ui_operations`. The first Mock reference uses standard **v0.9**
operations, matching the pinned documentation and middleware profile. There is
no private A2UI event, CUSTOM adapter, Plugin parser, DataMessage, surface reducer,
or ACTIVITY_DELTA implementation in AgentUICreator.

assistant-ui creates a resolved `present` presentation part with
`toolCallId: "a2ui:<surfaceId>"` and `result: {}`. This is a frontend presentation
detail. Backends must not emit `TOOL_CALL_* present` to paint a surface or use the
reserved `a2ui:` call ID prefix for genuine Tools.

The integration uses `createAgentUIGenerativeUI` and
`createAgentUIGenerativeActions` from the shared Integration, backed by the
official styled library and Action Registry. It takes only `present.render` and registers
`{ type: "backend", display: "standalone", render }`. It never copies the
frontend tool's `description`, `parameters`, or `execute`; `present` does not
become model-visible in `RunAgentInput.tools`. A future explicitly authorized
Generative UI Frontend Tool would be a separate integration.

`ConversationToolkitProvider` extends the current assistant-ui provider using
`AuiConfig` and `Tools`. Since a child Tools scope replaces its parent's renderer
registry, the facade preserves inherited renderers through upstream `setToolUI`
without registering them again as model capabilities. This keeps existing
Plugin and Frontend Tool UIs available alongside A2UI.

`GeneratedConversationIntegrations` is inside `ConversationRuntimeProvider` and
outside the presentation tree. The installer scans explicitly installed
`agent-ui/conversation/integrations/*.tsx` modules, requires a named
`ConversationIntegration` export, and writes static imports with filename lexical
order (first filename outermost). No runtime glob is involved. SourceRoot is
resolved through `AgentUIProjectPaths`; V1 host entry equivalents are inspected
through explicit read-only path mappings, never adopted into the optional lock.
Foundations provide a pass-through Host before any optional installation.

Legacy v1 uses a separate `.agent-ui/scenario-resources/source-lock.json` for the
entire optional closure, including `agent-component/assistant-ui-generative-ui`.
Workbench adopts resource inspection for items with `installedVersion` (locked
or provided ownership), not by Source kind or status. This prevents normal
inspection's unowned-file conflicts from hiding installed transitive dependencies.
Host foundation implementations stay unchanged and outside the optional lock;
the existing installer still regenerates derived integration/Tool registries.

## Interaction and replay

A Button action reaches `a2ui:action`, the official action registry and the
public action facade. Upstream sends a new Run with
`forwardedProps.a2uiAction.userAction`, strips `type` and supplies a timestamp.
It adds no UserMessage, ToolMessage, resume entry or CUSTOM event. Upstream owns
continuation coordination, including deferred actions while a previous SSE body
is still draining. AgentUICreator adds no lock or continuation coordinator.

Upstream stores rebuild operations in synthesized `present` parts at
`artifact.a2ui`. Surface renderers are replayable projections; mounting them sends nothing.
Same-message/same-surface snapshots update in place, `deleteSurface` removes the
part, and upstream excludes synthetic A2UI parts from backend message history.
Live surfaces and in-memory thread revisits use upstream runtime state.
The existing LangChain/LangGraph cold-history contract does not guarantee
ActivityMessages. No persisted cold A2UI history support, localStorage cache,
frontend surface database or checkpoint semantic change is claimed.

## Mock resource and regression scope

`a2ui-interactive-order` and `a2ui-form-controls` appear under Frontend Presentation in Mock Studio and
require only `integration/a2ui`. Install Resources uses the shared optional
resource lifecycle without Plugin activation or placement. Readiness requires
installed source, complete transitive foundations and compatible packages.

The Mock DSL's generic `activity-snapshot` step emits standard AG-UI snapshots.
`a2uiActions.branches` selects steps from
`forwardedProps.a2uiAction.userAction.name`; names are scenario-owned and the
runner supports an optional fallback. Action continuations do not reset initial
shared state. The order reference offers Confirm and Cancel branches.

Active regressions cover rendering, unchanged Tool permission, same-surface
updates, deletion, native action envelopes, draining-run serialization,
in-memory revisit, deterministic registry generation, V1/V2 pluginless source
installation and generic Mock branches. Tests are ordinary `.test.ts(x)` files,
not templates. Their presence is not a claim that checks have been run.

The first stage uses only the upstream Basic Catalog. Custom components,
Plugin-provided catalogs, dynamic/remote catalogs and arbitrary components require
a separately designed A2UI Component Catalog Authoring Contract.

## Released Basic Catalog boundary

The Form Controls scenario covers Icon, TextField, CheckBox, ChoicePicker,
DateTimeInput, List and Button through standard ACTIVITY_SNAPSHOT events.
The native ChoicePicker mapping uses RadioGroup for radio/single variants
(including mutuallyExclusive without chips), and Select for chips/default
presentation. These mappings remain entirely upstream-owned.

The pinned 0.0.21 converter has no Slider or multipleSelection-to-CheckboxGroup
support, and its vocabulary has neither Slider nor CheckboxGroup nor a `$field`
resolver. The proposal's broader catalog was not implemented with custom code.
The Name field uses a placeholder: official Input has no defaultValue support.
Save demonstrates native continuation and does not claim to collect the form.
The official vocabulary's Form mechanism is covered separately by its gallery
and regression sources. Table/Chart remain vocabulary-only capabilities.

The 0.0.62 runtime preserves other Activity snapshots as scoped data parts;
they must not be rendered as A2UI surfaces. Regressions cover this preservation,
rebuild artifacts, wire-to-DOM supported controls, and both Mock readiness paths.
No test, typecheck, build or acceptance was executed for this delivery.
