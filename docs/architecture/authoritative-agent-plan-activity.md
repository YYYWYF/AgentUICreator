# Authoritative Agent Plan Activity

AgentPlan progress comes from the Agent's declared activity. The frontend validates and presents that activity; it does not derive progress from Tool calls, reasoning text, elapsed time, or shared application state.

> Progress is a projection of authoritative agent activity, not a frontend inference.

## Contract and presentation

The generated project's `agent-contract/agent-plan-activity.ts` owns the narrow `agent-plan` payload:

```ts
interface AgentPlanActivity {
  title?: string;
  steps: readonly {
    id?: string;
    label: string;
    description?: string;
  }[];
  activeIndex: number;
}
```

`projectAgentPlanActivity(unknown)` returns `null` for malformed or incomplete data. It does not fill missing steps or choose an `activeIndex`.

The `plugin/agent-plan-message` resource registers a Data Message UI named `agui-activity/agent-plan`. The pinned assistant-ui AG-UI runtime converts Activity events into a named data part; the AgentUICreator renderer validates the payload and calls the public `AgentPlan` facade. Invalid activity renders no Plan. There is no `mock_agent_plan` Tool and no Activity-specific Plugin Runtime.

```text
ACTIVITY_SNAPSHOT / ACTIVITY_DELTA
  → pinned react-ag-ui Activity projection
  → agui-activity/agent-plan DataMessagePart
  → AgentUICreator Data Message UI
  → public AgentPlan facade
```

`ACTIVITY_DELTA` carries a standard JSON Patch and must use the same `messageId` and `activityType` as its snapshot. The runtime updates that activity's data part in place. A Plan is one mutable run-scoped transcript item, not one item per progress update.

## Event ownership

| AG-UI event family | Meaning | Frontend owner |
| --- | --- | --- |
| `CUSTOM` | Append-only structured transcript content | Named Data Message UI |
| `ACTIVITY_*` | Mutable, run-scoped activity UI | Activity-backed Data Message UI |
| `STATE_*` | Shared application or Agent state | Runtime state and state-backed UI |
| `SUBAGENT_*` | Delegated task lifecycle | Nested messages, TaskGroup and task summary |

AgentPlan belongs to `ACTIVITY_*`. JobProgress stays on its existing `ToolCall + STATE_*` path. Its terminal outcome must come from an explicit Tool Result or canonical Tool lifecycle; reaching `stageIndex === stages.length` alone does not mean success. Task and Subagent behavior stays on `SUBAGENT_*`.

## Resume and history boundary

On an initial live run, the backend sends a complete `ACTIVITY_SNAPSHOT`, followed by any `ACTIVITY_DELTA` updates. When a running thread is refreshed or resumed, the backend/resumable-run contract sends the latest complete snapshot again before later deltas. The frontend adds no localStorage Plan cache, `agentState.plan`, or reconstructed `activeIndex`.

This phase does not expand the ConversationService history contract. A completed historical conversation may omit its old execution Plan. The guarantee covers a live run and the active Plan restored when that run resumes.
