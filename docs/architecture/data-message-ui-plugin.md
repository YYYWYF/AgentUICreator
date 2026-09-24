# Data Message UI plugins

Data Message UI is message content. A backend sends an ordinary AG-UI `CUSTOM` event with a `name` and `value`. The pinned assistant-ui AG-UI runtime projects it into a named data message part. AgentUI installs the active plugin's renderer once under the assistant-ui runtime; the canonical `AssistantMessage` renders `part.dataRendererUI` without knowing the name.

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

Define a renderer with `defineDataMessageUI<TData>({ name, render })` from `@agent-ui/react`. The `TData` parameter checks plugin code at compile time; this first version does not validate payloads at runtime. Put the definition in the UI plugin's `dataMessageUIs` array and set `manifest.data.messageUI` to `true`. The manifest flag lets AppUIModel's static compiler allow the plugin in `applicationPlugins` without a Layout mount. Its renderer names stay in the plugin definition and never enter the manifest or AG-UI protocol.

When an enabled instance becomes active, `PluginDataMessageUIHost` mounts its registrations. Disabling or removing the instance unmounts them and assistant-ui cleans up its registration. One active renderer may own a name at a time; invalid names and collisions report `DATA_MESSAGE_UI_INVALID_NAME` or `DATA_MESSAGE_UI_NAME_CONFLICT` with the plugin and instance identities. There is no priority or override rule.

The example is `plugins/chart-message`, selected as an unmounted `applicationPlugins` entry. The Mock Agent `Data Message / Custom Chart` scenario sends `CUSTOM` with `name: "chart"` between text events.

Data Message UI suits charts, sources, artifact previews, and structured cards that belong in the transcript. [Application Custom Events](../custom-event-protocol.md) are live, transient events consumed through `events.subscribe()`; they do not become message content. The two paths remain separate.
