# assistant-ui Official Agent Elements Contract Map

P4-3C records the production contracts found before binding official
assistant-ui `AgentPlan`, `AgentStatus`, and `SubagentList` elements. The map is
intentionally based on this repository's runtime and AG-UI projections; names
from assistant-ui examples are not treated as product protocol names.

## Upstream

- Repository: `https://github.com/assistant-ui/assistant-ui`
- Branch: `main`
- Implementation-time HEAD: `bd7e8fa9f79ffea10fab0741026d53cdba4cfa70`
- Official source files are vendored through `foundation/assistant-ui-conversation`.

## Contract table

| Capability | Actual source | Actual tool/data name | Input schema | Lifecycle semantics | Binding state | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AgentPlan | No backend tool, AG-UI data part, mock scenario, or Creator output found | `none` | `none` | No production plan update lifecycle exists | `dormant` | `projectAgentPlan` is available for future validated payloads and test fixtures only. |
| AgentStatus | Existing runtime execution state only: `AgentStepExecution` and `AgentToolExecution` in `packages/runtime-core/src/agent-execution.ts`; no dedicated status semantic | `none` | `AgentStepExecution` has `id`, `producer`, `name`, `status`; tool lifecycle has `preparing|awaiting-result|completed|error|interrupted` | Existing execution lifecycle is not an explicit AgentStatus contract; no authoritative elapsed field is present | `dormant` | Do not derive labels from tool names or fabricate elapsed values. `projectAgentStatus` accepts only an explicit status view shape. |
| SubagentList | `AgentSubagentExecution` in `packages/runtime-core/src/agent-execution.ts`, projected by AG-UI `SubagentStartedEvent`/`SubagentFinishedEvent`/`SubagentErrorEvent` in `packages/runtime-agui/src/lifecycle-projector.ts` | `AgentSubagentExecution`; AG-UI `subagentRunId` | `id`, `producer`, `name`, optional `description`/parent ids, `status`; official element additionally requires `model`, which the current production contract does not provide | `running|completed|suspended|error|interrupted`; normal eligible aggregate states are only running/completed | `dormant` | The real subagent lifecycle is retained, but it cannot safely bind to the official contract without a real model field and aggregate dispatch/summary parts. Error/approval-like states stay on ToolFallback. |

## Gate result

No production capability is bound to `assistantUiToolkit` in P4-3C. The toolkit
continues to expose only the existing `search_files` backend renderer, and
`appFrontendTools` remains empty. No backend tool, AG-UI event, AppUIModel
plugin, semantic Slot, or fake default fixture is introduced for these
presentation elements.

The adapter layer is pure and UI-free:

```text
unknown runtime/backend shape
        -> validated normalized view model
        -> official assistant-ui element (fixture/test use only while dormant)
```
