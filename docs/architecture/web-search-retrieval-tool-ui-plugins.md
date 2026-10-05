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

The generated Application supplies its authoritative base toolkit to candidate
staging. `buildRuntimeComposition` combines it with selected Plugin entries via
`resolvePluginConversationToolkit` before publication. The resulting final
toolkit is retained in the published snapshot, and Agent passes that stable
object directly to the single Conversation Runtime's
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

Both official Elements are adopted from the pinned assistant-ui commit
`3542d602272a62eddeb8989befc910841c267022`. The explicit
`agent-ui-search-presentation-labels-seam` adds optional presentation labels;
UPSTREAM.json records the two-file patch and per-file adaptation, and installed
hashes are recorded in the lock. The sync script requires each upstream anchor
to match exactly once and fails for review if it changes. Product code passes
labels through JSX props, with no React child indexing, tree traversal, or
parsing of English aria copy. `searchTools` supplies English and Chinese labels.
The WebSearch completion count reflects the actual result count.

## Mock scenes and future acceptance

The backend reference catalog now includes `web-search` and `retrieval-chunks`.
Each uses the existing Mock `tool` step and standard AG-UI lifecycle, with a
visible delay for its running state. Resource requirements refer to the two
independently installable official resources.

Behavioral test code now covers both standard Mock SSE lifecycles through
HttpAgent and the Conversation Runtime; running/completed state, result fields,
localized meter labels, malformed and empty completions, disable/remove/re-enable,
and independence. Candidate-store tests cover plugin/plugin and base/plugin
collisions retaining the previous published snapshot without notifying render
consumers. Sync tests cover seam replay, provenance and failure on changed anchors.
Per the request, these tests and behavioral acceptance were not executed. No aliases,
shape-based routing, private events, citations, backend implementation, or new
version mechanism are added. Manifest metadata follows the existing required
Plugin schema.
