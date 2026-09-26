import { defineScenario } from "../scenario.js";
export const frontendToolOpenDialogScenario = defineScenario({
  id: "frontend-tool-open-dialog",
  title: "Frontend Tool：Open Dialog",
  description: "标准 AG-UI 工具调用 → 浏览器弹窗能力 → Tool Result → continuation。",
  category: "tools",
  capabilities: ["tool"],
  reference: { audience: "frontend", protocol: "AG-UI", pattern: "Frontend Tool → result → continuation", eventFlow: ["TOOL_CALL_START/ARGS/END", "RUN_FINISHED", "ToolMessage", "continuation"] },
  steps: [{ type: "tool", frontend: true, name: "open_demo_dialog", args: { title: "Settings", message: "Review your preferences" }, result: null }],
  frontendContinuation: { toolName: "open_demo_dialog", successText: "已经打开设置弹窗。", errorText: "无法打开弹窗：前端能力不可用或执行失败。" },
});
