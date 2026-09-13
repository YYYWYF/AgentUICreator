# P5-A Mock Scenario Matrix

P5-A extends the existing `@agent-ui/mock-agent` Vite development endpoint. Each
scenario is compiled into standard `@ag-ui/core@0.0.59` events and continues
through `HttpAgent`, `runtime-agui`, `runtime-assistant-ui`, and assistant-ui.
The mock endpoint is development-only; it is not a production Agent Contract.

| Scenario | Reasoning | Tool | Parallel | Approval | Plan | Status | Subagents | Error |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `reasoning-tool-success` | ✅ | ✅ | | | | | | |
| `tool-long-running` | ✅ | ✅ | | | | | | |
| `parallel-tools` | | ✅ | ✅ | | | | | |
| `tool-error` | | ✅ | | | | | | ✅ |
| `step-lifecycle` | ✅ | | | | | | | |
| `approval-resume` | ✅ | ✅ | | ✅ | | | | |
| `agent-plan` | ✅ | ✅ | | | ✅ | | | |
| `agent-status` | | ✅ | | | | ✅ | | |
| `subagents` | ✅ | ✅ | | | | | ✅ | |
| `subagents-out-of-order` | | ✅ | | | | | ✅ | |
| `agent-elements-showcase` | ✅ | ✅ | ✅ | | ✅ | ✅ | ✅ | |

Sources discovery is intentionally deferred in P5-A. No standard live
AG-UI-to-source-part projection is added here, and no `CUSTOM` event is used to
pretend that it exists. Persisted source metadata remains available for the
planned P5-B conversation/history work.

## Development URLs

From `examples/agent-frontend`, start the existing Vite app:

```bash
pnpm --filter @agent-ui/example-agent-frontend dev
```

Then select a fixture with one of these query parameters:

```text
?mockScenario=agent-plan
?mockScenario=agent-status
?mockScenario=subagents
?mockScenario=parallel-tools
?mockScenario=approval-resume
?mockScenario=agent-elements-showcase
```

The long-running fixture can be accelerated without changing its declared
two-minute duration:

```text
?mockScenario=tool-long-running&mockSpeed=0.05
```

`mockSpeed` is clamped by the HTTP handler to `0..10`; invalid values use the
normal speed of `1`. The default remains `reasoning-tool-success`.

## Boundaries

- `mock_agent_plan`, `mock_agent_status`, and `mock_subagents` are mock-only
  backend presentation fixtures.
- Production toolkit configuration and `appFrontendTools` remain unchanged.
- The P4-3C contract map remains dormant for AgentPlan, AgentStatus, and
  SubagentList.
- The AppUIModel and Workspace Shell composition are not changed by these
  scenarios.
