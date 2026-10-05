# Web Search and Retrieval Tool UI Plugins

Two optional, independent UI Plugins contribute backend Tool UI entries through
existing `UIPluginDefinition.toolkit`:

| Source item / resource / plugin | Tool name | Official Element |
| --- | --- | --- |
| `plugin/web-search` / `web-search` | `web_search` | `WebSearch` |
| `plugin/retrieval-chunks` / `retrieval-chunks` | `search_docs` | `RetrievalChunks` |

Install either resource using the existing Mock panel resource installation
control or the project source installation API. Enable its headless instance in
AppUIModel `applicationPlugins`. Installation does not depend on selecting a
Mock endpoint. Each plugin can be disabled or removed independently using the
existing AppUIModel/plugin management operations.

The existing generated Application memoizes `resolvePluginConversationToolkit`
against its active composition, combines the selected Plugin entries with the
base toolkit, and passes the result to the single Conversation Runtime's
`Tools({ toolkit })` / `AuiConfig` registration. The public
`createConversationToolkit` facade uses assistant-ui `defineToolkit`.
No additional provider or renderer dispatcher is introduced. Duplicate names,
including collisions with the base toolkit, throw
`Duplicate Tool UI registration: <toolName>` before composition is published.

Backend execution and standard AG-UI `TOOL_CALL_START/ARGS/END/RESULT` remain
unchanged. Plugins consume only assistant-ui's parsed `args`, `result`, and
`status`. They neither advertise executable frontend tools nor make requests.
They use the existing ToolFallback for errors, interrupted calls, and malformed
completed results. Empty result arrays are valid. Running calls show searching
or retrieving; completed calls show all returned entries.

## Backend result contracts

`web_search` accepts `{ query?: string }` and returns:

```json
{"results":[{"title":"assistant-ui","domain":"assistant-ui.com"}]}
```

`search_docs` accepts `{ query?: string }` and returns:

```json
{"chunks":[{"id":"chunk-1","source":"policy.pdf","locator":"p.14","score":0.91,"text":"退款申请需在30天内提交。"}]}
```

Both official Elements are adopted from the existing pinned assistant-ui commit
`3542d602272a62eddeb8989befc910841c267022` with the normal vendor sync and
provenance records. Vendor source is unchanged except for existing import
adaptations. The product facade localizes the pure Elements' returned status
and meter presentation; the `searchTools` locale namespace supplies English
and Chinese labels. The WebSearch completion count reflects the actual result
count rather than the upstream demonstration's fixed three sources. This
presentation adapter relies on the pinned Elements' status/meter structure and
must be reviewed when those Elements are upgraded.

## Mock scenes and future acceptance

The backend reference catalog now includes `web-search` and `retrieval-chunks`.
Each uses the existing Mock `tool` step and standard AG-UI lifecycle, with a
visible delay for its running state. Resource requirements refer to the two
independently installable official resources.

Per the implementation request, behavioral acceptance was not run. Future
acceptance should check running/completed states, all result fields, and removal
of each enabled Plugin returning its tool calls to the existing fallback without
changing the Mock, AssistantMessage, Runtime, or the other Plugin. No aliases,
shape-based routing, private events, citations, backend implementation, or new
version mechanism are added. Manifest metadata follows the existing required
Plugin schema.
