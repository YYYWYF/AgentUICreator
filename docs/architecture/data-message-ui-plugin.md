# Data Message UI plugins

Data Message UI renders structured content in the transcript. AG-UI `CUSTOM` appends a named data message part. The pinned assistant-ui AG-UI runtime also projects `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` into a mutable named data part (`agui-activity/{activityType}`). `ACTIVITY_DELTA` updates the part created by a snapshot with the same `messageId`; it does not append another transcript item. AgentUI installs the active plugin's renderer once under the assistant-ui runtime; the canonical `AssistantMessage` renders `part.dataRendererUI` without knowing the name.

```text
AG-UI CUSTOM
    ↓
assistant-ui AG-UI runtime
    ↓
DataMessagePart
    ↓
AgentUI Data Message UI Host
    ↓
plugin renderer
    ↓
AssistantMessage part.dataRendererUI
```

Define a renderer with `defineDataMessageUI<TData>({ name, render })` from `@agent-ui/react`. The `TData` parameter checks plugin code at compile time; this first version does not validate payloads at runtime. Put the definition in the UI plugin's `dataMessageUIs` array and set `manifest.data.messageUI` to `true`. The manifest flag requires the plugin in `applicationPlugins`; the Compiler rejects a Layout or child Slot mount. Its renderer names stay in the plugin definition and never enter the manifest or AG-UI protocol.

Composition validation checks names from all enabled instances before publishing a preview. Invalid names and collisions report `DATA_MESSAGE_UI_INVALID_NAME` or `DATA_MESSAGE_UI_NAME_CONFLICT` with the plugin and instance identities; disabled instances do not participate. When an enabled instance becomes active, `PluginDataMessageUIHost` mounts its registrations. Disabling or removing the instance unmounts them and assistant-ui cleans up its registration. There is no priority or override rule.

The example is `plugins/chart-message`, selected as an unmounted `applicationPlugins` entry. The Mock Agent `Data Message / Custom Chart` scenario sends `CUSTOM` with `name: "chart"` between text events.

Data Message UI suits charts, sources, artifact previews, and structured cards that belong in the transcript. `CUSTOM` is append-only structured transcript content; `ACTIVITY_*` is mutable, run-scoped activity UI. `STATE_*` updates shared application or Agent state. `SUBAGENT_*` describes delegated task lifecycle. [Application Custom Events](../custom-event-protocol.md) are live, transient events consumed through `events.subscribe()`; they do not become message content.

The `agent-plan-message` resource is an Activity-backed example. Its AgentUICreator-owned contract validates the complete `agent-plan` payload before the renderer calls the public `AgentPlan` facade. Invalid payloads render nothing. Refresh recovery is a backend/resumable-run responsibility: send the latest complete `ACTIVITY_SNAPSHOT`, then continue with deltas. The frontend does not store or reconstruct Plan progress. See [Authoritative Agent Plan Activity](./authoritative-agent-plan-activity.md).
