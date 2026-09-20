import { defineScenario } from "../scenario.js";

import { subagentDispatchTool } from "./subagents.js";

export const agentElementsShowcaseScenario = defineScenario({
  id: "agent-elements-showcase",
  title: "Agent Elements Showcase",
  description: "一次展示 Reasoning、Plan、Status、并行 Tools、SubagentList 和最终回复。",
  category: "agent",
  capabilities: [
    "reasoning",
    "tool",
    "parallel-tool",
    "plan",
    "agent-status",
    "subagent",
  ],
  steps: [
    { type: "reasoning", text: "我先分析任务并制定执行计划。", durationMs: 450 },
    {
      type: "tool",
      name: "mock_agent_plan",
      args: { source: "showcase" },
      result: {
        steps: [
          "Inspect current implementation",
          "Compare AG-UI runtime",
          "Update UI composition",
          "Run regression checks",
        ],
        activeIndex: 1,
      },
      prepareDurationMs: 200,
      durationMs: 700,
    },
    {
      type: "tool",
      name: "mock_agent_status",
      args: { phase: "working" },
      result: { state: "working", label: "Inspecting runtime", elapsed: "0:12" },
      prepareDurationMs: 200,
      durationMs: 600,
    },
    {
      type: "parallel-tools",
      tools: [
        {
          id: "showcase-search-files",
          name: "search_files",
          args: { query: "agent elements" },
          result: { matches: ["agent-plan.tsx", "agent-status.tsx"] },
          startDelayMs: 0,
          prepareDurationMs: 250,
          durationMs: 900,
        },
        {
          id: "showcase-inspect-runtime",
          name: "inspect_runtime",
          args: { package: "runtime-conversation" },
          result: { lifecycle: ["step", "subagent", "interrupt"] },
          startDelayMs: 80,
          prepareDurationMs: 200,
          durationMs: 550,
        },
        {
          id: "showcase-read-config",
          name: "read_config",
          args: { path: "app-ui/app-ui.json" },
          result: { composition: "workspace-shell" },
          startDelayMs: 160,
          prepareDurationMs: 180,
          durationMs: 1_100,
        },
      ],
    },
    {
      type: "parallel-tools",
      tools: [
        subagentDispatchTool({
          id: "showcase-architecture",
          name: "Architecture Researcher",
          progress: 20,
          durationMs: 350,
        }),
        subagentDispatchTool({
          id: "showcase-runtime",
          name: "Runtime Inspector",
          progress: 48,
          durationMs: 450,
          startDelayMs: 50,
        }),
        subagentDispatchTool({
          id: "showcase-ui",
          name: "UI Reviewer",
          progress: 72,
          durationMs: 250,
          startDelayMs: 90,
        }),
      ],
    },
    { type: "reasoning", text: "并行检查已经完成，我汇总结果。", durationMs: 350 },
    {
      type: "tool",
      name: "mock_agent_status",
      args: { phase: "done" },
      result: { state: "done", label: "Analysis complete", elapsed: "0:24" },
      prepareDurationMs: 200,
      durationMs: 500,
    },
    { type: "message", text: "计划、状态、工具和子 Agent 检查都已完成。", intervalMs: 30 },
  ],
});
