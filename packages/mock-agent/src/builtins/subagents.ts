import { defineScenario } from "../scenario.js";

const subagentFixture = {
  agents: [
    {
      name: "Architecture Researcher",
      model: "mimo-v2.5-pro",
      status: "completed",
      progress: 100,
    },
    {
      name: "Runtime Inspector",
      model: "mimo-v2.5-pro",
      status: "running",
      progress: 58,
    },
    {
      name: "UI Reviewer",
      model: "mimo-v2.5-pro",
      status: "running",
      progress: 24,
    },
  ],
  showSummary: false,
};

export const subagentsScenario = defineScenario({
  id: "subagents",
  title: "Subagents",
  description: "同时验证 SubagentList fixture 与标准 subagent lifecycle。",
  category: "agent",
  capabilities: ["tool", "subagent"],
  steps: [
    { type: "reasoning", text: "我把检查拆给多个子 Agent 并行观察。", durationMs: 400 },
    {
      type: "tool",
      name: "mock_subagents",
      args: { view: "mixed-progress" },
      result: subagentFixture,
      prepareDurationMs: 250,
      durationMs: 700,
    },
    {
      type: "subagent",
      id: "subagent-architecture",
      name: "Architecture Researcher",
      description: "检查整体架构边界",
      durationMs: 500,
      outcome: { type: "completed", result: { findings: 3 } },
    },
    {
      type: "subagent",
      id: "subagent-runtime",
      name: "Runtime Inspector",
      description: "检查 AG-UI 生命周期",
      durationMs: 600,
      outcome: { type: "error", message: "Runtime fixture reached a controlled error", code: "MOCK_SUBAGENT_ERROR" },
    },
    {
      type: "subagent",
      id: "subagent-ui",
      name: "UI Reviewer",
      description: "检查 assistant-ui 显示",
      steps: [
        { type: "reasoning", text: "我正在检查 UI 组合。", durationMs: 250 },
        { type: "message", text: "UI 组合检查完成。", intervalMs: 20 },
      ],
      outcome: { type: "completed" },
    },
    { type: "message", text: "子 Agent 检查已汇总。", intervalMs: 35 },
  ],
});

export { subagentFixture };
