import { defineScenario } from "../scenario.js";

/** The HTTP handler owns this scenario's timer and persisted snapshot. */
export const resumableLongRunScenario = defineScenario({
  id: "resumable-long-run",
  title: "长任务：刷新后继续",
  description: "首段输出后刷新页面，重新订阅同一个 Mock Run。",
  category: "advanced",
  durableRun: true,
  steps: [],
});
