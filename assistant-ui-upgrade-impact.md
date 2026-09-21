# assistant-ui Upgrade Impact Report

From:
- packages: package.json, packages/react/package.json, packages/runtime-conversation/package.json, pnpm-lock.yaml, pnpm-workspace.yaml
- upstream revision: bd7e8fa9f79ffea10fab0741026d53cdba4cfa70

To:
- @assistant-ui/react 0.15.21
- @assistant-ui/react-ag-ui 0.0.60
- @assistant-ui/react-markdown 0.14.16
- upstream revision: b712ee83bde9a89fce2812968f951a5742d757b9

## Vendor changes

- changed 36 files
- added 5 files
- removed 0 files
- new transitive dependencies: 2

## Public facade changes

- 2 files: packages/react/src/internal/composable-thread.tsx, packages/react/src/public.tsx

## Runtime adapter changes

- 1 files: packages/runtime-conversation/package.json

## Plugin changes

- 7 files across 3 Plugin directories
- examples/agent-frontend/plugins/conversation-surface/index.tsx, examples/agent-frontend/plugins/conversation-surface/manifest.json, examples/agent-frontend/plugins/registry.generated.ts, examples/agent-frontend/plugins/subagent-conversation/definition.ts, examples/agent-frontend/plugins/subagent-conversation/index.tsx, examples/agent-frontend/plugins/subagent-conversation/manifest.json, examples/agent-frontend/plugins/task-group/

## AppUIModel changes

- 1 files: examples/agent-frontend/app-ui/app-ui.json

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

- 11 files: examples/agent-frontend/tests/ag-ui-boundary.test.ts, examples/agent-frontend/tests/assistant-ui-canonical-runtime.test.ts, examples/agent-frontend/tests/assistant-ui-default-composition.test.ts, examples/agent-frontend/tests/assistant-ui-nested-subagent.test.tsx, examples/agent-frontend/tests/assistant-ui-thread-boundary.test.ts, examples/agent-frontend/tests/scoped-renderer-bridge.test.tsx, examples/agent-frontend/tests/scoped-renderer-conversation-integration.test.tsx, examples/agent-frontend/tests/subagent-conversation-boundary.test.ts, examples/agent-frontend/tests/task-group-boundary.test.ts, packages/react/tests/public-api.test.ts, packages/react/tests/upstream-provenance.test.ts

## Upgrade cost assessment

Medium

Reason: vendor changes are expected; the assessment tracks whether the public facade, runtime adapter, existing Plugins, AppUIModel, or Creator expanded beyond the intended seam.
