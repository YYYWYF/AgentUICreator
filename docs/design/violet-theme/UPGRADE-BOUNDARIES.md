# Theme ownership and upgrade boundaries

This matrix applies to the deployed Agent frontend. A Plugin identity does not grant permission to edit its upstream implementation. Canonical owners and theme flow are described in [Theme architecture](THEME-ARCHITECTURE.md); source takeover and synchronization follow [Plugin delivery and ownership](../../architecture/npm-default-plugin-source-ownership.md).

Official Plugin owners live in `packages/plugins/src/plugins/<id>/`, with pristine `upstream/` and maintained `adapters/` separated. Shared upstream and product adaptations live under `src/shared/`. `source-layout.json` generates compatibility views; never edit those views. Project customization starts in `plugins/<id>/index.tsx` and project CSS.

## Customization seams

| UI surface | Plugin / owner | Preferred seam | Behavior to preserve |
| --- | --- | --- | --- |
| Welcome and empty conversation | `conversation-surface`, `conversation-suggestions` | Agent welcome/suggestions, component props and renderers | Prompt selection and send behavior |
| Messages, Markdown and code | `conversation-surface`, shared presentation | Public composition, typography and semantic tokens | Message grouping, branches, editing, attachments and parser output |
| Composer | `composer` | Direct input/root props, semantic children and project styles | Draft, composition, queue, submit and dropzone behavior |
| Send, cancel, attachment and dictation actions | `submit-action`, `add-attachment-action`, `dictation-action` | Public button props, labels and tokens | Native actions, state gating and existing adapters |
| Quote preview and toolbar | `conversation-quote` | `previewProps`, `toolbarProps`, `renderPreview`, `renderToolbar` | Selection Portal, quote lifecycle and send context |
| Copy, retry, feedback and export | Action Plugins | Public props and existing response scope | Default actions, errors and entire-response semantics |
| Response footer | `response-footer` | Public action/branch composition and overall styles | One footer beneath the final assistant message in each complete response |
| Conversation list and new conversation | `conversation-thread-list`, `conversation-new` | Direct `showSearch`, `showArchived`, `itemProps`, public actions and styles | Existing service, navigation, loading/retry and persistence |
| Plan, status and job progress | Corresponding message Plugins | Direct presentation props and renderers | Actual state, outcome, progress and cancellation |
| Reasoning, tool groups and timeline | `reasoning`, `tool-group`, `tool-timeline` | `expanded`, `defaultExpanded`, `onExpandedChange`, public composition | Runtime order, grouping and tool result visibility |
| Tool details and approval | `tool-fallback`, `tool-result` | Public detail/args/result/error/approval parts | Approval, interrupt, retry and focus recovery |
| Multimodal tool result | `tool-result` | `renderPart`, `resolveFile`, public content renderer | Content order, URL validation, media behavior and cancellation |
| Agent questions | `ask-user-question` | Public props, unified labels and question renderer | Parameter/answer validation, read-only history and continuation |
| SubAgent tasks | `task-group`, shared presentation | Public task composition and semantic tokens | Nested transcript and existing Runtime context |
| Web search, retrieval and citations | Corresponding result Plugins | Public props, item renderers and `searchTools` locale | Counts, cycle/DOM props, source URLs and streaming projections |
| File results | `generated-file-message`, `tool-result` | Public file/content props and renderers | Filename, MIME, URL checks and download behavior |
| Charts | `chart-message` | `formatValue`, `renderItem`, `renderChart`, `classNames`, `styles` | Validated data and value/proportion semantics |
| Mentions and commands | Trigger Plugins and `conversation-command-source` | Existing provider, public props and locale | Action/directive distinction, loading/errors and input composition |
| Theme and language controls | `theme-switch`, `locale-switch` | Shared service and Agent props/callbacks | One service state and controlled Host behavior |
| Dialogs, popovers, tooltips and image zoom | Shared scoped presentation | Public components and semantic variables | Owning Portal, focus trapping/restoration and containment |
| Product launcher and panel | Project `application/shell/` | Local Shell and CSS | Selected surfaceRef, responsive behavior and mounted children when hidden |
| Generative UI | Optional `/generative-ui` integration | Registered public vocabulary and actions | Existing Conversation Runtime and action permissions; A2UI delivery is deferred |

Detailed Plugin props are recorded in [public props](../../architecture/plugin-public-props.md) and the [public development guide](../../../website/docs/development/component-customization.md). npm wrappers and project applications must forward supported configurable behavior without requiring takeover to work around an omitted wrapper seam.

## CSS and upstream checks

Prefer public `className`, `style`, semantic tokens and component composition. Inspect the actual installed renderer before relying on a `data-slot`, `data-ui-plugin` or other DOM hook; observed attributes are not a universal upstream CSS API. Avoid child order, generated utility encodings, Portal positioner internals and deeply nested disclosure selectors.

Keep shared product geometry usable across light, dark and violet. A preset controls color semantics; it does not authorize recoloring success, error or progress state indiscriminately. Do not branch business behavior on translated labels or introduce a per-Plugin language store.

Upstream synchronization must validate the reviewed adaptation hashes before regenerating compatibility bridges. Changes to upstream seams require review and merge of the maintained adapter owner; they must not overwrite product adapters. Project source sync uses exact BASE/LOCAL/TARGET, merges only implementation-owned files and adopts BASE only after explicit validation. Application props, Shell and service bindings remain outside that merge.

Run scoped typechecks, theme/locale and upstream guards for relevant implementation changes. Browser appearance, focus and interaction need their own checks; macOS results do not establish Windows acceptance.
