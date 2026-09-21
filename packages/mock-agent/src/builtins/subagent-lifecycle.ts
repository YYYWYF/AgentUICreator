import { defineScenario } from "../scenario.js";

/**
 * Protocol-only lifecycle fixture. The UI Agent Elements showcase uses
 * dispatch tool calls; this scenario keeps standard AG-UI subagent lifecycle
 * events independently covered by the mock endpoint.
 */
export const subagentLifecycleScenario = defineScenario({
  id: "subagent-lifecycle",
  title: "Subagent Lifecycle",
  description: "用于验证 SUBAGENT_STARTED / FINISHED / ERROR 生命周期本身，不是 nested TaskCard UI showcase。",
  category: "advanced",
  capabilities: ["subagent"],
  reference: {
    protocol: "AG-UI",
    pattern: "Subagent lifecycle",
    presentation: "Protocol-only fixture",
    level: "protocol",
    eventFlow: [
      "SUBAGENT_STARTED",
      "SUBAGENT_FINISHED",
      "SUBAGENT_ERROR",
    ],
    notes: [
      "This fixture has no parentToolCallId and is not a nested TaskCard showcase.",
    ],
  },
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
