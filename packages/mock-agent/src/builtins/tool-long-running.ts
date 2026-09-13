import { defineScenario } from "../scenario.js";

export const toolLongRunningScenario = defineScenario({
  id: "tool-long-running",
  title: "Long-running Tool",
  description: "模拟一个真实两分钟工具，并允许开发时按 speed 加速。",
  category: "tool",
  capabilities: ["reasoning", "tool"],
  steps: [
    {
      type: "reasoning",
      text: "我先检查大型工作区，再汇总检查结果。",
      durationMs: 900,
    },
    {
      type: "tool",
      name: "inspect_large_workspace",
      args: { root: ".", includeIgnored: false },
      result: { files: 1284, directories: 96, bytes: 4_812_000 },
      prepareDurationMs: 600,
      durationMs: 120_000,
    },
    {
      type: "message",
      text: "大型工作区检查完成。",
      intervalMs: 40,
    },
  ],
});
