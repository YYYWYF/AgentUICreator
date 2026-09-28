import { defineScenario } from "../scenario.js";

export const askUserQuestionScenario = defineScenario({
  id: "ask-user-question",
  title: "询问用户偏好",
  description: "assistant-ui Human Tool · 提问、选择、Tool Result、继续回答",
  category: "human-in-loop",
  capabilities: ["tool"],
  resources: ["ask-user-question-demo"],
  reference: {
    audience: "frontend", protocol: "AG-UI",
    pattern: "Human Tool → requires-action → addResult → continuation → receipt",
    eventFlow: ["TOOL_CALL_START/ARGS/END", "RUN_FINISHED", "Human Tool addResult", "ToolMessage", "continuation"],
  },
  steps: [{ type: "tool", human: true, name: "ask_user_question", result: null,
    args: { schemaVersion: 1, steps: [{ id: "layout", question: "你希望采用哪种首页布局？",
      description: "这个选择会影响首页的整体结构。", selectionMode: "single", minSelections: 1, maxSelections: 1,
      options: [{ id: "dashboard", label: "Dashboard", description: "适合信息密度较高的首页" },
        { id: "sidebar", label: "Sidebar", description: "适合有持续导航的首页" }] }] } }],
  humanQuestionContinuation: {
    toolName: "ask_user_question", stepId: "layout",
    answerText: {
      dashboard: "好的，我会按 Dashboard 布局继续设计。",
      sidebar: "好的，我会按 Sidebar 布局继续设计。",
    },
    errorText: "没有收到有效的布局选择，请重新回答。",
  },
});
