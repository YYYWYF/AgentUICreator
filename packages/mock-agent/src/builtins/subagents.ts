import { defineScenario, type MockParallelTool } from "../scenario.js";

const subagentModel = "mimo-v2.5-pro";

export interface MockSubagentDispatchFixture {
  readonly id: string;
  readonly name: string;
  readonly progress: number;
  readonly durationMs: number;
  readonly startDelayMs?: number;
}

export function subagentDispatchTool(
  fixture: MockSubagentDispatchFixture,
): MockParallelTool {
  return {
    id: fixture.id,
    name: "mock_dispatch_subagent",
    args: {
      name: fixture.name,
      model: subagentModel,
      status: "running",
      progress: fixture.progress,
    },
    result: {
      name: fixture.name,
      model: subagentModel,
      status: "completed",
      progress: 100,
    },
    startDelayMs: fixture.startDelayMs,
    prepareDurationMs: 200,
    durationMs: fixture.durationMs,
  };
}

export const subagentsScenario = defineScenario({
  id: "subagents",
  title: "Subagent Dispatch",
  description: "通过多个真实 dispatch tool call 聚合 SubagentList。",
  category: "agent",
  capabilities: ["tool", "subagent"],
  steps: [
    { type: "reasoning", text: "我把检查拆给多个子 Agent 并行观察。", durationMs: 400 },
    {
      type: "parallel-tools",
      tools: [
        subagentDispatchTool({
          id: "subagent-architecture",
          name: "Architecture Researcher",
          progress: 20,
          durationMs: 500,
        }),
        subagentDispatchTool({
          id: "subagent-runtime",
          name: "Runtime Inspector",
          progress: 42,
          durationMs: 600,
          startDelayMs: 40,
        }),
        subagentDispatchTool({
          id: "subagent-ui",
          name: "UI Reviewer",
          progress: 68,
          durationMs: 350,
          startDelayMs: 80,
        }),
      ],
    },
    { type: "message", text: "子 Agent 检查已汇总。", intervalMs: 35 },
  ],
});
