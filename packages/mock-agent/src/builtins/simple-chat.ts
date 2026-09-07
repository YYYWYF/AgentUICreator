import { defineScenario } from "../scenario.js";

export const simpleChatScenario = defineScenario({
  id: "simple-chat",
  title: "Simple Chat",
  description: "模拟一次纯文本流式回复。",
  steps: [
    {
      type: "message",
      text: "你好，这是一个纯文本流式回复。",
      intervalMs: 50,
    },
  ],
});
