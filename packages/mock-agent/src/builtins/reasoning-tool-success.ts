import { defineScenario } from "../scenario.js";

export const reasoningToolSuccessScenario = defineScenario({
  id: "reasoning-tool-success",
  title: "Reasoning + Tool",
  description: "模拟一次思考、工具调用、再次思考和最终回复。",
  steps: [
    {
      type: "reasoning",
      text: "我先检查当前项目中和 AG-UI 相关的实现。",
      durationMs: 1200,
    },
    {
      type: "tool",
      name: "search_files",
      args: { keyword: "AG-UI" },
      result: {
        files: [
          "packages/runtime-agui/src/AgUiTransport.ts",
          "packages/runtime-agui/src/lifecycle-projector.ts",
        ],
      },
      prepareDurationMs: 600,
      durationMs: 1800,
    },
    {
      type: "reasoning",
      text: "已经找到相关代码，我整理一下结果。",
      durationMs: 800,
    },
    {
      type: "message",
      text: "检查完成，我找到了 AG-UI Transport 和生命周期投影相关实现。",
      intervalMs: 40,
    },
  ],
});
