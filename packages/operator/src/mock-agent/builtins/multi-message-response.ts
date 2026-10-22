import { defineScenario } from "../scenario.js";

/** Three standard AG-UI messages in one user-visible response. */
export const multiMessageResponseScenario = defineScenario({
  id: "multi-message-response",
  title: "Multi-message Response",
  description: "一次回答包含三条连续 assistant 消息，共用一组 Response 操作。",
  category: "basics",
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "Multiple Text Messages",
    presentation: "Assistant Response Footer",
    eventFlow: ["RUN_STARTED", "TEXT_MESSAGE_START/CONTENT/END × 3", "RUN_FINISHED"],
  },
  steps: [
    { type: "message", text: "第一段回答", intervalMs: 50 },
    { type: "message", text: "第二段回答", intervalMs: 50 },
    { type: "message", text: "最终总结", intervalMs: 50 },
  ],
});
