import { defineScenario } from "../scenario.js";
export const composerSlashScenario = defineScenario({
  id: "composer-slash", title: "Composer · Slash Commands", category: "presentation",
  resources: ["conversation-lexical-input", "conversation-command-source", "conversation-slash-commands", "composer-trigger-demo"],
  description: "同一 Slash 列表支持前端 /new 和 Agent 指令 /summarize。",
  reference: { audience: "frontend", protocol: "AG-UI user text", pattern: "Frontend action / serialized command",
    presentation: "Agent UI Composer Trigger / Directive Text", eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
    notes: ["/new creates a conversation without sending an Agent request.", "/summarize inserts a directive; only explicit send produces an Agent request."] },
  steps: [{ type: "message", text: "输入 / 查看命令。选择 /new 只新建会话；选择 /summarize 会插入命令指令，等待你主动发送。", intervalMs: 20 }],
});
