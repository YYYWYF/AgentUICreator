import { defineScenario } from "../scenario.js";

export const simpleChatScenario = defineScenario({
  id: "simple-chat",
  title: "Simple Chat",
  description: "模拟一次纯文本流式回复。",
  category: "basics",
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Text Message Streaming",
    presentation: "assistant-ui Message",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
  },
  steps: [
    {
      type: "message",
      text: "你好，这是一个纯文本流式回复。",
      intervalMs: 50,
    },
  ],
});
