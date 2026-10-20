import { defineScenario } from "../scenario.js";

export const askUserQuestionScenario = defineScenario({
  id: "ask-user-question",
  title: "询问用户偏好",
  description: "Frontend Human Tool · 思考、提问、选择、ToolMessage、继续回答",
  category: "human-in-loop",
  capabilities: ["reasoning", "tool"],
  resources: ["ask-user-question-demo"],
  reference: {
    audience: "frontend", protocol: "AG-UI",
    pattern: "Reasoning → Human Tool → RUN_FINISHED(success) → ToolMessage → continuation",
    eventFlow: ["REASONING_*", "TOOL_CALL_START/ARGS/END", "RUN_FINISHED(success)", "ToolMessage", "TEXT_MESSAGE_*"],
  },
  steps: [{ type: "reasoning", durationMs: 2000,
    text: "我先梳理首页的展示和导航需求。数据总览适合集中展示信息，侧边导航适合持续导航；需要先确认你的布局偏好，再继续设计。" },
    { type: "tool", human: true, name: "ask_user_question", result: null,
    args: { steps: [{ id: "layout", question: "你希望采用哪种首页布局？",
      description: "这个选择会影响首页的整体结构。", selectionMode: "single", minSelections: 1, maxSelections: 1,
      options: [{ id: "dashboard", label: "数据总览", description: "适合信息密度较高的首页" },
        { id: "sidebar", label: "侧边导航", description: "适合需要持续导航的首页" }] }] } }],
  humanQuestionContinuation: {
    toolName: "ask_user_question", stepId: "layout",
    answerText: {
      dashboard: "好的，我会按数据总览布局继续设计。",
      sidebar: "好的，我会按侧边导航布局继续设计。",
    },
    errorText: "没有收到有效的布局选择，请重新回答。",
  },
});
