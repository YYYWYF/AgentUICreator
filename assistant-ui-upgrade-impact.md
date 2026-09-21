# assistant-ui Upgrade Impact Report

From:
- packages: unchanged in report metadata
- upstream revision: c2917dba8783b3e250ab484102627901e611c56a

To:
- @assistant-ui/react 0.15.21
- @assistant-ui/react-ag-ui 0.0.60
- @assistant-ui/react-markdown 0.14.16
- upstream revision: 039c3c32822632f2a564164f089f538926886124

## Vendor changes

- changed 0 files
- added 0 files
- removed 0 files
- new transitive dependencies: 0

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
- components/assistant-ui/elements/directive-text.aui.tsx
- components/assistant-ui/elements/directive-text.tsx
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
- components/assistant-ui/elements/guardrail-notice.tsx
- components/assistant-ui/elements/heat-graph.tsx
- components/assistant-ui/elements/image-generation.tsx
- components/assistant-ui/elements/inline-citation.tsx
- components/assistant-ui/elements/job-progress.tsx
- components/assistant-ui/elements/launcher-bubble.tsx
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
- components/assistant-ui/elements/quota-banner.tsx
- components/assistant-ui/elements/quote-reply.tsx
- components/assistant-ui/elements/quote.aui.tsx
- components/assistant-ui/elements/read-aloud.tsx
- components/assistant-ui/elements/reasoning-effort.tsx
- components/assistant-ui/elements/reasoning-panel.tsx
- components/assistant-ui/elements/recommendation-card.tsx
- components/assistant-ui/elements/regenerate-menu.tsx
- components/assistant-ui/elements/research-report.tsx
- components/assistant-ui/elements/retrieval-chunks.tsx
- components/assistant-ui/elements/reviewable-diff.tsx
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
- components/assistant-ui/elements/thinking-indicator.tsx
- components/assistant-ui/elements/thread-list.tsx
- components/assistant-ui/elements/thread-search.tsx
- components/assistant-ui/elements/threadlist-sidebar.aui.radix.tsx
- components/assistant-ui/elements/threadlist-sidebar.aui.tsx
- components/assistant-ui/elements/timeline.tsx
- components/assistant-ui/elements/todo-list.tsx
- components/assistant-ui/elements/tool-error.tsx
- components/assistant-ui/elements/tool-group.tsx
- components/assistant-ui/elements/tool-timeline.tsx
- components/assistant-ui/elements/tooltip-icon-button.radix.tsx
- components/assistant-ui/elements/trace-waterfall.tsx
- components/assistant-ui/elements/typing-indicator.tsx
- components/assistant-ui/elements/voice-conversation.aui.tsx
- components/assistant-ui/elements/voice-conversation.tsx
- components/assistant-ui/elements/voice.aui.tsx
- components/assistant-ui/elements/voice.tsx
- components/assistant-ui/elements/web-preview.tsx
- components/assistant-ui/elements/web-search.tsx

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
- components/assistant-ui/elements/directive-text.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/directive-text.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
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
- components/assistant-ui/elements/guardrail-notice.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/heat-graph.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/image-generation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/inline-citation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/job-progress.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/launcher-bubble.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
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
- components/assistant-ui/elements/quota-banner.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/quote-reply.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/quote.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/read-aloud.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reasoning-effort.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reasoning-panel.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/recommendation-card.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/regenerate-menu.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/research-report.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/retrieval-chunks.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/reviewable-diff.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
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
- components/assistant-ui/elements/thinking-indicator.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/thread-list.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/thread-search.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/threadlist-sidebar.aui.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/threadlist-sidebar.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/timeline.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/todo-list.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tool-error.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tool-group.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tool-timeline.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/tooltip-icon-button.radix.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/trace-waterfall.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/typing-indicator.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice-conversation.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice-conversation.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice.aui.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/voice.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/web-preview.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.
- components/assistant-ui/elements/web-search.tsx: Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.

## Public facade changes

- 0 files: none

## Runtime adapter changes

- 0 files: none

## Plugin changes

- 0 files across 0 Plugin directories
- none

## AppUIModel changes

- 0 files: none

## Creator changes

- 0 files: none

## Removed compatibility code

- ConversationSubagentTool
- ConversationSubagentMessages
- ConversationNestedToolFallback
- subagentConversation Slot and subagent-conversation Plugin
- product-side Array.isArray(tool.messages) renderer routing

## Upstream capability audit

| Capability | Status |
| --- | --- |
| ThreadComponents.TaskGroup | NEW UPSTREAM CAPABILITY |
| thread.tasks | NEW UPSTREAM CAPABILITY |
| TaskCard / TaskGroup | NEW UPSTREAM CAPABILITY |
| AgentStatus / TaskTray | NEW UPSTREAM CAPABILITY |
| ReasoningGroup / ToolGroup / ToolFallback | UNCHANGED |
| Composer / Message Footer / Thread List / Attachments / Suggestions | UNCHANGED |
| ConversationSubagentTool compatibility presentation | LOCAL COMPATIBILITY NO LONGER NEEDED |

## Tests changed

- 0 files: none

## Upgrade cost assessment

Low

Reason: vendor changes are expected; the assessment tracks whether the public facade, runtime adapter, existing Plugins, AppUIModel, or Creator expanded beyond the intended seam.
