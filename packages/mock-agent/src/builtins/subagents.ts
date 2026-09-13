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
  title: "Subagents",
  description: "并行检查架构、Runtime 和界面实现，观察三个子 Agent 的进度。",
  category: "agent",
  capabilities: ["tool", "parallel-tool", "subagent"],
  steps: [
    {
      type: "reasoning",
      text: "我把架构、Runtime 和 UI 检查拆给三个子 Agent 并行处理。",
      durationMs: 900,
    },
    {
      type: "parallel-tools",
      tools: [
        subagentDispatchTool({
          id: "subagent-architecture",
          name: "Architecture Researcher",
          progress: 20,
          durationMs: 2_400,
        }),
        subagentDispatchTool({
          id: "subagent-runtime",
          name: "Runtime Inspector",
          progress: 45,
          durationMs: 1_600,
          startDelayMs: 150,
        }),
        subagentDispatchTool({
          id: "subagent-ui",
          name: "UI Reviewer",
          progress: 70,
          durationMs: 1_000,
          startDelayMs: 300,
        }),
      ],
    },
    {
      type: "message",
      text: "三个子 Agent 的检查都已完成，我已经汇总结果。",
      intervalMs: 45,
    },
  ],
});
