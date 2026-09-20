# Scoped Renderer Plugins

Status: CLOSED. AppUIModel must name a cataloged Plugin for every occupied
Slot, including optional renderer Slots. An optional Slot may have no occupant.
Runtime fallback handles temporarily unavailable valid contributions; it does
not make an unknown Plugin id a valid authored selection.

The AppUIModel composition graph now supports two child Slot modes. An omitted
`mode` means ordinary `content`; `mode: "renderer"` means the host renders one
runtime entity through the Slot. Renderer Slots have `cardinality: "one"` and
an accepted capability. They use the same Plugin instances, activation,
services, and `SlotRegistry` as content Slots. The Creator inspector includes
the mode, accepted capabilities, and mounted Plugin instances.

`renderSlot` remains the static composition API. A Plugin host calls
`renderScopedSlot(localSlotName, scope, fallback)` for a runtime entity. The
runtime provides the scope through a local React context around that Plugin
render. Each call has its own context, including repeated groups and nested
renders. Missing, disabled, inactive, or capability-mismatched contributions
use the supplied fallback. A Plugin with `requiresRenderScope: true` is
rejected by AppUIModel compilation when mounted as static content and returns
`null` if rendered without its expected scope.

The first host is `conversation-surface`. Its stable Thread component adapters
receive assistant-ui `GroupedParts` groups and tool fallback props, project
stable facade values, and select the `reasoningGroup`, `toolGroup`, or
`toolFallback` renderer Slot. The adapters do not replace `AssistantMessage`.
assistant-ui continues to own message parts, order, grouping, streaming,
named Tool UI selection, approvals, results, and errors. The Thread's
`part.toolUI ?? ToolFallback` selection still gives named Tool UIs priority.
Text and Markdown are unchanged.

The three default renderer Plugins call canonical presentation components
exposed by `@agent-ui/react`. `assistant-ui-canonical` therefore describes
presentation ownership; AgentUICreator owns renderer selection and
composition. Replacing a renderer changes its Plugin instance in AppUIModel.
The vendored assistant-ui Elements remain untouched.
