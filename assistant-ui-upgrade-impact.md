# assistant-ui Upgrade Impact Report

本次实际结果与限制见 [2026-10-16 验证记录](docs/verification/assistant-ui-upgrade-2026-10-16/README.md)。下列自动报告是影响审查清单，不是验收通过声明。

Earlier upgrade and acceptance evidence is retained in [assistant-ui-upgrade-retained-evidence.md](docs/architecture/assistant-ui-upgrade-retained-evidence.md).

From:
- packages: examples/creator-assistant-host/package.json, examples/creator-embedded-host/package.json, examples/creator-host-sandbox/package.json, package.json, packages/creator/package.json, packages/operator/tests/fixtures/project/package.json, packages/plugins/package.json, packages/runtime/package.json, packages/web-component/package.json, pnpm-lock.yaml
- upstream revision: 3542d602272a62eddeb8989befc910841c267022

To:
- @assistant-ui/react 0.15.29
- @assistant-ui/react-ag-ui 0.0.70
- @assistant-ui/react-langgraph 0.14.36
- @assistant-ui/react-markdown 0.14.23
- @assistant-ui/react-generative-ui 0.0.22
- upstream revision: a46d6634e7a75eddd85d51415b1a615886d4ad0e
- Generative UI release revision: 3542d602272a62eddeb8989befc910841c267022

## AG-UI transport compatibility

Pinned @ag-ui/client:
0.0.59

Previous react-ag-ui range:
unknown

Target react-ag-ui range:
^0.0.59

Resolved lockfile versions:
0.0.59

CancellationAwareHttpAgent: ACTIVE

Status:
REVIEW REQUIRED

Reasons:
- cancellation-related upstream transport files changed


## LangGraph history compatibility

Source API seams:
- @assistant-ui/react-langgraph.convertLangChainMessages
- @assistant-ui/react-langgraph.LangChainMessage
- @assistant-ui/react.unstable_convertExternalMessages

Source status:
REVIEW REQUIRED

Target package:
@assistant-ui/react-langgraph 0.14.36

Resolved dependencies:
@assistant-ui/core 0.3.29; @assistant-ui/react-langchain 0.0.37; @assistant-ui/store 0.3.21; assistant-stream 0.3.52

Published package / lockfile compatibility:
PASS

Published package API exports:
- @assistant-ui/react-langgraph.convertLangChainMessages: PASS
- @assistant-ui/react-langgraph.LangChainMessage: PASS
- @assistant-ui/react.unstable_convertExternalMessages: PASS

Overall status:
REVIEW REQUIRED

Reasons:
- @assistant-ui/react-langgraph version changed; review persisted history conversion.
- LangGraph source API compatibility was not proven by the upgrade run.


## Vendor changes

- changed 29 files
- added 3 files
- removed 0 files
- new transitive dependencies: 0

Product adapter / Portal integration: REVIEW REQUIRED: product adapter / Portal integration
- product adapter and style-boundary files changed: packages/plugins/scripts/sync-product-adapters.mjs, packages/plugins/src/internal/adapters/assistant-ui/UPSTREAM.json, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-plan.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/directive-text.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/file.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/image.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/job-progress.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/markdown-text.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/media-player.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/option-list.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/retrieval-chunks.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/sources.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/subagent-list.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/task-card.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/task-card.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/thinking-indicator.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-call.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-group.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-timeline.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/web-search.tsx
- relevant upstream component/primitive files changed: packages/react/src/primitives/composer/ComposerAddAttachment.test.tsx, packages/react/src/primitives/composer/ComposerAddAttachment.thread-scope.test.tsx, packages/react/src/primitives/composer/ComposerAddAttachment.ts, packages/react/src/primitives/composer/ComposerAttachmentDropzone.test.tsx, packages/react/src/primitives/composer/ComposerAttachmentDropzone.tsx, packages/react/src/primitives/composer/ComposerCancel.focus.test.tsx, packages/react/src/primitives/composer/ComposerCancel.ts, packages/react/src/primitives/composer/ComposerDisabledThread.test.tsx, packages/react/src/primitives/composer/ComposerInput.focus-on-run-start.test.tsx, packages/react/src/primitives/composer/ComposerInput.test.tsx, packages/react/src/primitives/composer/ComposerInput.tsx, packages/react/src/primitives/composer/ComposerRoot.test.tsx, packages/react/src/primitives/composer/ComposerRoot.tsx, packages/react/src/primitives/composer/composerInputSelector.ts, packages/react/src/primitives/composer/trigger/TriggerPopover.tsx, packages/react/src/primitives/composer/trigger/TriggerPopoverAction.tsx, packages/react/src/primitives/composer/trigger/TriggerPopoverCategories.tsx, packages/react/src/primitives/composer/trigger/TriggerPopoverDirective.tsx, packages/react/src/primitives/composer/trigger/TriggerPopoverExports.test.ts, packages/react/src/primitives/composer/trigger/TriggerPopoverItems.tsx, packages/react/src/primitives/composer/trigger/TriggerPopoverRootContext.tsx, packages/react/src/primitives/composer/useComposerCancelWithFocus.ts, packages/react/src/primitives/selectionToolbar/SelectionToolbarRoot.test.tsx, packages/react/src/primitives/selectionToolbar/SelectionToolbarRoot.tsx, packages/ui/src/components/react/assistant-ui/elements/agent-plan.tsx, packages/ui/src/components/react/assistant-ui/elements/agent-status.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/agent-status.tsx, packages/ui/src/components/react/assistant-ui/elements/attachment.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/composer-trigger-popover.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/directive-text.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/file.tsx, packages/ui/src/components/react/assistant-ui/elements/image.tsx, packages/ui/src/components/react/assistant-ui/elements/job-progress.tsx, packages/ui/src/components/react/assistant-ui/elements/markdown-text.tsx, packages/ui/src/components/react/assistant-ui/elements/media-player.tsx, packages/ui/src/components/react/assistant-ui/elements/option-list.tsx, packages/ui/src/components/react/assistant-ui/elements/reasoning.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/reasoning.tsx, packages/ui/src/components/react/assistant-ui/elements/retrieval-chunks.tsx, packages/ui/src/components/react/assistant-ui/elements/sources.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/subagent-list.tsx, packages/ui/src/components/react/assistant-ui/elements/task-card.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/task-card.tsx, packages/ui/src/components/react/assistant-ui/elements/thinking-indicator.tsx, packages/ui/src/components/react/assistant-ui/elements/thread-list.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/tool-call.tsx, packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/tool-group.aui.tsx, packages/ui/src/components/react/assistant-ui/elements/tool-timeline.tsx, packages/ui/src/components/react/assistant-ui/elements/web-search.tsx
- adapter provenance changed: yes
- adapter revision: 3542d602272a62eddeb8989befc910841c267022 → a46d6634e7a75eddd85d51415b1a615886d4ad0e
- generator drift: PASS

Quote selection integration seam: REVIEW REQUIRED
- local Quote seam files changed: packages/plugins/src/internal/quote-selection-root.tsx, packages/plugins/src/internal/quote-selection-message-id.ts, packages/plugins/src/internal/quote-selection-UPSTREAM.json
- upstream Quote selection files changed: packages/react/src/primitives/selectionToolbar/SelectionToolbarRoot.tsx, packages/react/src/utils/getSelectionMessageId.ts

## Upstream Element discovery

### NEW UPSTREAM ELEMENTS

- components/assistant-ui/elements/activity-graph.tsx
- components/assistant-ui/elements/agent-card.tsx
- components/assistant-ui/elements/agent-handoff.tsx
- components/assistant-ui/elements/approval-card.tsx
- components/assistant-ui/elements/artifact-card.tsx
- components/assistant-ui/elements/assistant-modal.aui.radix.tsx
- components/assistant-ui/elements/assistant-modal.aui.tsx
- components/assistant-ui/elements/assistant-sidebar.aui.tsx
- components/assistant-ui/elements/attachment.aui.radix.tsx
- components/assistant-ui/elements/background-inbox.tsx
- components/assistant-ui/elements/canvas-split.tsx
- components/assistant-ui/elements/chart.tsx
- components/assistant-ui/elements/chat-panel.tsx
- components/assistant-ui/elements/checkpoint-history.tsx
- components/assistant-ui/elements/code-diff.tsx
- components/assistant-ui/elements/code-runner.tsx
- components/assistant-ui/elements/collapsible-root.radix.tsx
- components/assistant-ui/elements/command-palette.tsx
- components/assistant-ui/elements/comparison-card.tsx
- components/assistant-ui/elements/composer.tsx
- components/assistant-ui/elements/computer-use.tsx
- components/assistant-ui/elements/confidence-marker.tsx
- components/assistant-ui/elements/connection-state.tsx
- components/assistant-ui/elements/context-breakdown.tsx
- components/assistant-ui/elements/context-display.aui.tsx
- components/assistant-ui/elements/context-display.radix.tsx
- components/assistant-ui/elements/context-display.tsx
- components/assistant-ui/elements/conversation-map.aui.tsx
- components/assistant-ui/elements/conversation-map.tsx
- components/assistant-ui/elements/conversation-search.tsx
- components/assistant-ui/elements/cost-meter.tsx
- components/assistant-ui/elements/data-table.tsx
- components/assistant-ui/elements/day-separator.tsx
- components/assistant-ui/elements/diagram.tsx
- components/assistant-ui/elements/document-reference.tsx
- components/assistant-ui/elements/draft-restore.tsx
- components/assistant-ui/elements/edit-message.tsx
- components/assistant-ui/elements/elicitation-form.tsx
- components/assistant-ui/elements/empty-state.tsx
- components/assistant-ui/elements/error-state.tsx
- components/assistant-ui/elements/feedback-dialog.tsx
- components/assistant-ui/elements/file-tree.tsx
- components/assistant-ui/elements/flow-canvas.tsx
- components/assistant-ui/elements/flow-expand.tsx
- components/assistant-ui/elements/flow-graph.tsx
- components/assistant-ui/elements/flow.tsx
- components/assistant-ui/elements/generative-ui.tsx
- components/assistant-ui/elements/geo-map.tsx
- components/assistant-ui/elements/guardrail-notice.tsx
- components/assistant-ui/elements/heat-graph.tsx
- components/assistant-ui/elements/image-gallery.tsx
- components/assistant-ui/elements/image-generation.tsx
- components/assistant-ui/elements/inline-citation.tsx
- components/assistant-ui/elements/launcher-bubble.tsx
- components/assistant-ui/elements/link-preview.tsx
- components/assistant-ui/elements/loading-state.tsx
- components/assistant-ui/elements/logos.tsx
- components/assistant-ui/elements/map-answer.tsx
- components/assistant-ui/elements/math-block.tsx
- components/assistant-ui/elements/mcp-config.aui.radix.tsx
- components/assistant-ui/elements/mcp-config.aui.tsx
- components/assistant-ui/elements/mcp-server-panel.tsx
- components/assistant-ui/elements/memory-chips.tsx
- components/assistant-ui/elements/mermaid-diagram.aui.tsx
- components/assistant-ui/elements/mermaid-diagram.tsx
- components/assistant-ui/elements/message-actions.tsx
- components/assistant-ui/elements/message-attachment.tsx
- components/assistant-ui/elements/message-branches.tsx
- components/assistant-ui/elements/message-pair.tsx
- components/assistant-ui/elements/message-queue.tsx
- components/assistant-ui/elements/message-timing.aui.radix.tsx
- components/assistant-ui/elements/message-timing.aui.tsx
- components/assistant-ui/elements/message-timing.tsx
- components/assistant-ui/elements/mobile-composer.tsx
- components/assistant-ui/elements/model-picker.tsx
- components/assistant-ui/elements/model-selector.aui.tsx
- components/assistant-ui/elements/model-selector.radix.tsx
- components/assistant-ui/elements/model-selector.tsx
- components/assistant-ui/elements/number-ticker.tsx
- components/assistant-ui/elements/onboarding.tsx
- components/assistant-ui/elements/permission-grant.tsx
- components/assistant-ui/elements/prompt-library.tsx
- components/assistant-ui/elements/question-flow.tsx
- components/assistant-ui/elements/quota-banner.tsx
- components/assistant-ui/elements/quote-reply.tsx
- components/assistant-ui/elements/read-aloud.tsx
- components/assistant-ui/elements/reasoning-effort.tsx
- components/assistant-ui/elements/reasoning-panel.tsx
- components/assistant-ui/elements/recommendation-card.tsx
- components/assistant-ui/elements/regenerate-menu.tsx
- components/assistant-ui/elements/research-report.tsx
- components/assistant-ui/elements/reviewable-diff.tsx
- components/assistant-ui/elements/run-activity.tsx
- components/assistant-ui/elements/schedule-card.tsx
- components/assistant-ui/elements/score-breakdown.tsx
- components/assistant-ui/elements/scroll-anchor.tsx
- components/assistant-ui/elements/settings-panel.tsx
- components/assistant-ui/elements/shared-conversation.tsx
- components/assistant-ui/elements/shiki-highlighter.aui.tsx
- components/assistant-ui/elements/shiki-highlighter.tsx
- components/assistant-ui/elements/sources.tsx
- components/assistant-ui/elements/speaker-identity.tsx
- components/assistant-ui/elements/spec-sheet.tsx
- components/assistant-ui/elements/stopped-run.tsx
- components/assistant-ui/elements/streaming-text.tsx
- components/assistant-ui/elements/suggestions.tsx
- components/assistant-ui/elements/syntax-highlighter.tsx
- components/assistant-ui/elements/terminal-block.tsx
- components/assistant-ui/elements/thread-list.tsx
- components/assistant-ui/elements/thread-search.tsx
- components/assistant-ui/elements/threadlist-sidebar.aui.radix.tsx
- components/assistant-ui/elements/threadlist-sidebar.aui.tsx
- components/assistant-ui/elements/timeline.tsx
- components/assistant-ui/elements/todo-list.tsx
- components/assistant-ui/elements/tool-error.tsx
- components/assistant-ui/elements/tool-group.tsx
- components/assistant-ui/elements/tooltip-icon-button.radix.tsx
- components/assistant-ui/elements/trace-waterfall.tsx
- components/assistant-ui/elements/typing-indicator.tsx
- components/assistant-ui/elements/voice-conversation.aui.tsx
- components/assistant-ui/elements/voice-conversation.tsx
- components/assistant-ui/elements/voice.aui.tsx
- components/assistant-ui/elements/voice.tsx
- components/assistant-ui/elements/web-preview.tsx

### Adoption

- newly adopted: none
- removed upstream Elements: none
- changed tracked upstream Elements: none

### Explicitly ignored with rationale

- components/assistant-ui/elements/activity-graph.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/agent-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/agent-handoff.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/approval-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/artifact-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/assistant-modal.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/assistant-modal.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/assistant-sidebar.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/attachment.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/background-inbox.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/canvas-split.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/chart.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/chat-panel.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/checkpoint-history.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/code-diff.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/code-runner.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/collapsible-root.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/command-palette.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/comparison-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/composer.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/computer-use.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/confidence-marker.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/connection-state.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/context-breakdown.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/context-display.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/context-display.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/context-display.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/conversation-map.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/conversation-map.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/conversation-search.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/cost-meter.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/data-table.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/day-separator.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/diagram.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/document-reference.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/draft-restore.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/edit-message.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/elicitation-form.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/empty-state.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/error-state.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/feedback-dialog.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/file-tree.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/flow-canvas.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/flow-expand.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/flow-graph.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/flow.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/generative-ui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/geo-map.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/guardrail-notice.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/heat-graph.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/image-gallery.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/image-generation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/inline-citation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/launcher-bubble.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/link-preview.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/loading-state.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/logos.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/map-answer.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/math-block.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mcp-config.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mcp-config.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mcp-server-panel.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/memory-chips.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mermaid-diagram.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mermaid-diagram.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-actions.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-attachment.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-branches.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-pair.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-queue.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-timing.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-timing.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/message-timing.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/mobile-composer.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/model-picker.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/model-selector.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/model-selector.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/model-selector.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/number-ticker.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/onboarding.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/permission-grant.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/prompt-library.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/question-flow.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/quota-banner.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/quote-reply.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/read-aloud.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reasoning-effort.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reasoning-panel.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/recommendation-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/regenerate-menu.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/research-report.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reviewable-diff.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/run-activity.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/schedule-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/score-breakdown.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/scroll-anchor.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/settings-panel.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/shared-conversation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/shiki-highlighter.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/shiki-highlighter.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/sources.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/speaker-identity.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/spec-sheet.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/stopped-run.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/streaming-text.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/suggestions.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/syntax-highlighter.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/terminal-block.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/thread-list.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/thread-search.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/threadlist-sidebar.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/threadlist-sidebar.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/timeline.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/todo-list.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tool-error.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tool-group.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tooltip-icon-button.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/trace-waterfall.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/typing-indicator.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice-conversation.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice-conversation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/web-preview.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.

## Public facade changes

- 34 files: packages/plugins/src/internal/adapters/assistant-ui/UPSTREAM.json, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-plan.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/directive-text.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/file.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/image.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/job-progress.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/markdown-text.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/media-player.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/option-list.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/retrieval-chunks.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/sources.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/subagent-list.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/task-card.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/task-card.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/thinking-indicator.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-call.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-group.aui.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-timeline.tsx, packages/plugins/src/internal/adapters/assistant-ui/components/assistant-ui/elements/web-search.tsx, packages/plugins/src/internal/composer-trigger-UPSTREAM.json, packages/plugins/src/internal/conversation-task-group.tsx, packages/plugins/src/internal/quote-selection-UPSTREAM.json, packages/plugins/src/internal/quote-selection-message-id.ts, packages/plugins/src/internal/quote-selection-root.tsx, packages/plugins/src/locales/en-US.ts, packages/plugins/src/locales/zh-CN.ts

## Runtime adapter changes

- 1 files: packages/runtime/package.json

## Source Registry assistant-ui Resources

- 0 files: none

## Plugin changes

- 0 files across 0 Plugin directories
- none

## AppUIModel changes

- 0 files: none

## Creator changes

- 1 files: packages/creator/package.json

## Removed compatibility code

- ConversationSubagentTool
- ConversationSubagentMessages
- ConversationNestedToolFallback
- subagentConversation Slot and subagent-conversation Plugin
- product-side Array.isArray(tool.messages) renderer routing

## Upstream capability audit

| Capability | Status |
| --- | --- |
| ThreadComponents.TaskGroup | REVIEW REQUIRED: inspect upstream diff and validate behavior |
| thread.tasks | REVIEW REQUIRED: inspect upstream diff and validate behavior |
| TaskCard / TaskGroup | REVIEW REQUIRED: inspect upstream diff and validate behavior |
| AgentStatus / TaskTray | REVIEW REQUIRED: inspect upstream diff and validate behavior |
| ReasoningGroup / ToolGroup / ToolFallback | REVIEW REQUIRED: report does not validate behavior |
| Composer / Message Footer / Thread List / Attachments / Suggestions | REVIEW REQUIRED: report does not validate behavior |
| LangChain / LangGraph persisted message conversion | REVIEW REQUIRED |
| ConversationSubagentTool compatibility presentation | PRODUCT COMPOSITION: validate nested transcript compatibility |
| CancellationAwareHttpAgent / AG-UI transport | REVIEW REQUIRED |

## Tests changed

- 12 files: packages/operator/tests/fixtures/project/package.json, packages/plugins/tests/assistant-ui-portal-sync.test.mjs, packages/plugins/tests/assistant-ui-upgrade-drill.test.mjs, packages/plugins/tests/attachment-locale-states.test.tsx, packages/plugins/tests/fixtures/composer-upstream/composer-trigger-popover.aui.tsx, packages/plugins/tests/fixtures/quote-upstream/SelectionToolbarRoot.tsx, packages/plugins/tests/fixtures/quote-upstream/getSelectionMessageId.ts, packages/plugins/tests/lexical-upgrade-contract.test.mjs, packages/plugins/tests/migrated/assistant-ui-attachments.test.tsx, packages/plugins/tests/migrated/assistant-ui-nested-subagent.test.tsx, packages/plugins/tests/upstream-provenance.test.ts, packages/plugins/tests/violet-surface-overrides.test.tsx

## Upgrade cost assessment

High

Reason: vendor changes are expected; the assessment tracks whether the public facade, runtime adapter, Source Registry assistant-ui Resources, existing Plugins, AppUIModel, or Creator changed.
