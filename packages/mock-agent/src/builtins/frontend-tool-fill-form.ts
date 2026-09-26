import { defineScenario } from "../scenario.js";
export const frontendToolFillFormScenario = defineScenario({
  id: "frontend-tool-fill-form", title: "Frontend Tool · Fill Form",
  description: "标准 AG-UI Frontend Tool 填写 React Hook Form，不提交表单。",
  category: "tools", capabilities: ["tool"],
  resources: [{ id: "frontend-tool-form", label: "React Hook Form Frontend Tool Demo", sourceItemId: "demo/frontend-tool-form" }],
  reference: { audience: "frontend", protocol: "AG-UI", pattern: "Frontend Tool → Form state mutation → ToolMessage → continuation",
    eventFlow: ["TOOL_CALL_START/ARGS/END", "RUN_FINISHED", "ToolMessage", "continuation"],
    notes: ["Semantics follow assistant-ui @assistant-ui/react-hook-form.", "Tools use the application-owned permission layer.", "Viewing history never rewrites, resets or submits the current form."] },
  steps: [
    { type: "tool", frontend: true, name: "set_form_field", args: { name: "firstName", value: "Alice" }, result: null },
    { type: "tool", frontend: true, name: "set_form_field", args: { name: "email", value: "alice@example.com" }, result: null },
  ],
  frontendContinuation: { toolName: "set_form_field", successText: "已填写姓名和邮箱，表单尚未提交。", errorText: "表单填写失败：前端能力不可用或执行失败。" },
});
