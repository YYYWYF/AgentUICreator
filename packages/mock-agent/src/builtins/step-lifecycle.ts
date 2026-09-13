import { defineScenario } from "../scenario.js";

export const stepLifecycleScenario = defineScenario({
  id: "step-lifecycle",
  title: "Step Lifecycle",
  description: "使用标准 STEP_STARTED / STEP_FINISHED 验证步骤投影。",
  category: "agent",
  capabilities: ["reasoning"],
  steps: [
    { type: "reasoning", text: "我开始分阶段检查实现。", durationMs: 300 },
    { type: "step", name: "inspect-runtime", durationMs: 700 },
    { type: "step", name: "summarize-findings", durationMs: 500 },
    { type: "message", text: "阶段检查完成。", intervalMs: 30 },
  ],
});
