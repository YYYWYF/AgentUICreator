import { defineScenario } from "../scenario.js";

/**
 * Protocol-only lifecycle fixture. The UI Agent Elements showcase uses
 * dispatch tool calls; this scenario keeps standard AG-UI subagent lifecycle
 * events independently covered by the mock endpoint.
 */
export const subagentLifecycleScenario = defineScenario({
  id: "subagent-lifecycle",
  title: "Subagent Lifecycle",
  description: "使用标准 SUBAGENT_STARTED / FINISHED / ERROR 验证生命周期投影。",
  category: "agent",
  capabilities: ["subagent"],
  steps: [
    {
      type: "subagent",
      id: "lifecycle-completed",
      name: "Completing Worker",
      durationMs: 0,
      outcome: { type: "completed", result: { verified: true } },
    },
    {
      type: "subagent",
      id: "lifecycle-error",
      name: "Failing Worker",
      durationMs: 0,
      outcome: { type: "error", message: "Worker failed", code: "WORKER_FAILED" },
    },
    { type: "message", text: "Subagent lifecycle checked.", intervalMs: 0 },
  ],
});
