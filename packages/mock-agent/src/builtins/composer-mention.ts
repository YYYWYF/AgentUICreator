import { defineScenario } from "../scenario.js";
export const composerMentionScenario = defineScenario({
  id: "composer-mention", title: "Composer · Mention", category: "presentation",
  resources: ["conversation-lexical-input", "conversation-command-source", "conversation-mention", "composer-trigger-demo"],
  description: "输入 @ 搜索示例花名册，选中对象后发送；在请求记录中检查稳定员工 ID。",
  reference: { audience: "frontend", protocol: "AG-UI user text", pattern: "Async source → directive → user message",
    presentation: "assistant-ui Composer Trigger / Directive Text", eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
    notes: ["Inspect the actual user.content for employee_84721; choosing a candidate does not send.", "Roster lookup and Agent context construction belong to the backend application."] },
  steps: [{ type: "message", text: "输入 @张（中文）或 @Zhang（英文）搜索示例对象。选择后输入问题并发送，再检查请求中的 employee_84721。", intervalMs: 20 }],
});
