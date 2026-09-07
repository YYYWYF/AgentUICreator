import { defineScenario } from "../scenario.js";

export const multiToolScenario = defineScenario({
  id: "multi-tool",
  title: "Multiple Tools",
  description: "模拟一次思考、两个顺序工具调用和最终回复。",
  steps: [
    {
      type: "reasoning",
      text: "我需要检查几个不同的信息源。",
      durationMs: 800,
    },
    {
      type: "tool",
      name: "search_files",
      args: { keyword: "runtime" },
      prepareDurationMs: 400,
      durationMs: 1000,
      result: { files: ["runtime.ts"] },
    },
    {
      type: "tool",
      name: "inspect_file",
      args: { path: "runtime.ts" },
      prepareDurationMs: 400,
      durationMs: 1200,
      result: { lines: 128 },
    },
    {
      type: "message",
      text: "两个工具都执行完成。",
      intervalMs: 40,
    },
  ],
});
