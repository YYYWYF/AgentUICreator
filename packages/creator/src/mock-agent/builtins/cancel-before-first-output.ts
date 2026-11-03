import { defineScenario } from "../scenario.js";

export const cancelBeforeFirstOutputScenario = defineScenario({
  id: "cancel-before-first-output",
  title: "Cancel Before First Output",
  description: "运行开始后等待 10 秒再输出；等待期间点击 Stop 可查看空响应取消展示。",
  category: "presentation",
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "Cancellation before assistant output",
    presentation: "Empty cancelled response fallback",
    eventFlow: ["RUN_STARTED", "10s wait", "CUSTOM", "TEXT_MESSAGE_START/CONTENT/END", "RUN_FINISHED"],
    notes: ["在第一条内容出现前点击 Stop；保持默认速度以保留 10 秒等待窗口。"],
  },
  steps: [
    { type: "custom", name: "cancel-before-first-output.ready", value: {}, delayMs: 10_000 },
    { type: "message", text: "等待结束，开始生成内容。", intervalMs: 80 },
  ],
});
