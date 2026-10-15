import { defineScenario } from "../scenario.js";

export const concurrentConversationsScenario = defineScenario({
  id: "concurrent-conversations",
  title: "Concurrent Conversations",
  description: "在两个会话分别发送 AAA / BBB，观察交错的慢速 stream 和独立 Stop。",
  category: "advanced",
  reference: {
    audience: "backend", protocol: "AG-UI", pattern: "Concurrent thread streams",
    eventFlow: ["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED"],
  },
  steps: [{ type: "message", text: "A-1\nA-2\nA-3\n", intervalMs: 750 }],
});
