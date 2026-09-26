# A2UI Official Integration

`integration/a2ui` is an optional, pluginless, tool-less Official Integration.
Installing it does not mutate AppUIModel or grant an Agent Frontend Tool permission.
It requires `foundation/core` and `@assistant-ui/react-generative-ui` **0.0.19**.
The assistant-ui reference is pinned at `039c3c32822632f2a564164f089f538926886124`.

| Responsibility | Owner |
| --- | --- |
| Wire protocol | AG-UI 0.0.59 + A2UI; `ACTIVITY_SNAPSHOT` |
| Surface conversion / update / deletion | `@assistant-ui/react-ag-ui` 0.0.60, native `useAgUiRuntime` |
| Rendering and Basic Catalog | `@assistant-ui/react-generative-ui` 0.0.19 |
| Public action API | `@agent-ui/runtime-conversation.useConversationA2uiAction` |
| Render-only Toolkit provider | `@agent-ui/react.ConversationToolkitProvider` |
| Optional source installation and generated Host | AgentUICreator Official Integration seam |
| Persistent cold history | Separate backend history contract; unsupported by this integration |

The backend emits `activityType: "a2ui-surface"`, `replace: true`, and
`content.a2ui_operations`. The first Mock reference uses standard **v0.9**
operations, matching the pinned documentation and middleware profile. There is
no private A2UI event, CUSTOM adapter, Plugin parser, DataMessage, surface reducer,
or ACTIVITY_DELTA implementation in AgentUICreator.

assistant-ui creates a resolved `present` presentation part with
`toolCallId: "a2ui:<surfaceId>"` and `result: {}`. This is a frontend presentation
detail. Backends must not emit `TOOL_CALL_* present` to paint a surface or use the
reserved `a2ui:` call ID prefix for genuine Tools.

The integration constructs `JSONGenerativeUI` with `defaultGenerativeUILibrary`
and `createActionRegistry`. It takes only `present.render` and registers
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

## Interaction and replay

A Button action reaches `a2ui:action`, the official action registry and the
public action facade. Upstream sends a new Run with
`forwardedProps.a2uiAction.userAction`, strips `type` and supplies a timestamp.
It adds no UserMessage, ToolMessage, resume entry or CUSTOM event. Upstream owns
continuation coordination, including deferred actions while a previous SSE body
is still draining. AgentUICreator adds no lock or continuation coordinator.

Surface renderers are replayable projections; mounting them sends nothing.
Same-message/same-surface snapshots update in place, `deleteSurface` removes the
part, and upstream excludes synthetic A2UI parts from backend message history.
Live surfaces and in-memory thread revisits use upstream runtime state.
The existing LangChain/LangGraph cold-history contract does not guarantee
ActivityMessages. No persisted cold A2UI history support, localStorage cache,
frontend surface database or checkpoint semantic change is claimed.

## Mock resource and regression scope

`a2ui-interactive-order` appears under Frontend Presentation in Mock Studio and
requires only `integration/a2ui`. Install Resources uses the shared optional
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
