import { defineScenario } from "../scenario.js";

export const reasoningChatScenario = defineScenario({
  id: "reasoning-chat",
  title: "Reasoning + Message",
  description: "模拟一次思考和最终回复。",
  steps: [
    {
      type: "reasoning",
      text: "我先分析一下这个问题。",
      durationMs: 1200,
    },
    {
      type: "message",
      text: "分析完成，这是最终答案。",
      intervalMs: 40,
    },
  ],
});
