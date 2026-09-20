# Scoped Renderer Plugins

Status: CLOSED. AppUIModel must name a cataloged Plugin for every occupied
Slot, including optional renderer Slots. An optional Slot may have no occupant.
An empty or unavailable Renderer Slot produces no presentation; the Runtime
does not restore a hidden canonical presentation or select another Plugin.
Runtime diagnostics continue to report unavailable or inactive contributions;
they do not make an unknown Plugin id a valid authored selection.

The AppUIModel composition graph now supports two child Slot modes. An omitted
`mode` means ordinary `content`; `mode: "renderer"` means the host renders one
runtime entity through the Slot. Renderer Slots have `cardinality: "one"` and
an accepted capability. They use the same Plugin instances, activation,
services, and `SlotRegistry` as content Slots. The Creator inspector includes
the mode, accepted capabilities, and mounted Plugin instances.

`renderSlot` remains the static composition API. A Plugin host calls
`renderScopedSlot(localSlotName, scope)` for a runtime entity. The runtime
provides the scope through a local React context around that Plugin render.
Each call has its own context, including repeated groups and nested renders.
Missing, disabled, inactive, or capability-mismatched contributions return
`null`; an empty optional Renderer Slot is a valid no-op. A Plugin with
`requiresRenderScope: true` is rejected by AppUIModel compilation when mounted
as static content and returns `null` if rendered without its expected scope.

The first host is `conversation-surface`. Its stable Thread component adapters
receive assistant-ui `GroupedParts` groups and tool fallback props, project
stable facade values, and select the `reasoningGroup`, `toolGroup`,
`toolFallback`, or `assistantMessageFooter` renderer Slot. The adapter replaces
only the whole-message presentation through the public
`ConversationCanonicalAssistantMessage` facade so the Footer can be a semantic
Renderer Slot; it does not reimplement the message domain. assistant-ui
continues to own message parts, order, grouping, streaming, named Tool UI
selection, approvals, results, and errors. The Thread's
`part.toolUI ?? ToolFallback` selection still gives named Tool UIs priority.
Text and Markdown are unchanged.

The default Reasoning, Tool Group, Tool Fallback, and message Footer Renderer
Plugins call canonical presentation components exposed by `@agent-ui/react`.
The default message Footer is composed by `assistant-ui-message-footer` and its
`conversation-message-action` child Plugins. The Footer owns the canonical
BranchPicker and ActionBar root, while Copy, Reload, and Export Markdown remain
independent assistant-ui Primitive wrappers. The `actions` child Slot is
`inline`; removing or reordering those instances changes the Footer through
AppUIModel without editing React source. The default canonical presentation
exists only when the corresponding Renderer and action Plugin instances are
explicitly mounted in AppUIModel. Replacing, disabling, or removing a renderer
changes or removes its presentation through that model. The vendored
assistant-ui Elements remain untouched.

## Assistant Message Footer and Composer Boundary

`assistantMessageFooter` is a `one` / optional Renderer Slot owned by
`conversation-surface`. Its scope is intentionally data-free because every
Footer action runs inside the current assistant-ui Message Context. The shared
`renderSlot` contract uses `layout: "inline"` for the Footer's `actions` child
Slot; `inline` is a parent outlet layout requirement and never a child Plugin
property. `inline` and `fill` are an invalid combination.

The future Composer/Sender composition is recorded as:

```text
assistant-ui-composer
├── beforeInput       many / content
├── leadingActions    many / inline
├── trailingActions   many / inline
└── submitAction      one
```

`ComposerPrimitive.Root`, `AttachmentDropzone`, and
`ComposerPrimitive.Input` remain the internal Composer Plugin skeleton. They
must never be split into ordinary AppUIModel Plugins or independently mounted
as Composer child instances.
