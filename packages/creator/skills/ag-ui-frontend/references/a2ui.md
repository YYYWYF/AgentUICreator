# A2UI


A2UI is not a CUSTOM event and is not a Frontend Tool. Backend surfaces use
standard `ACTIVITY_SNAPSHOT`, `activityType: "a2ui-surface"`, and
`content.a2ui_operations` (the Mock reference uses v0.9 operations).
`@assistant-ui/react-ag-ui.useAgUiRuntime` is the only surface converter;
`integration/a2ui` owns the official renderer and action bridge through project
facades. Install it as an optional, pluginless Integration; do not edit AppUIModel.

The integration registers only the backend/render-only `present` Toolkit entry.
Never advertise `present` in `RunAgentInput.tools` merely to render an A2UI
surface. Plugins must not parse A2UI, import `@assistant-ui/react-ag-ui`, directly
use `useAgUiSendA2uiAction`, register `present`, or translate CUSTOM into A2UI.
Use the public `useConversationA2uiAction` facade within the Conversation Runtime
provider; native actions use `forwardedProps.a2uiAction.userAction` in a new Run
without a new UserMessage, Tool result or resume entry. Do not implement another
action continuation coordinator.

Use only `defaultGenerativeUILibrary` in this stage. Custom catalogs require a
separate authorization contract. Renderer mounts must not send actions; replay
and in-memory revisit are projections. Persisted cold A2UI history requires a
separate backend ActivityMessage contract and is not implied by LangGraph history.
