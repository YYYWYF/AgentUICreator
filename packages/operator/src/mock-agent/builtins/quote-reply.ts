import { defineScenario } from "../scenario.js";
export const quoteReplyScenario = defineScenario({
  id: "quote-reply",
  title: "Quote / Reply",
  description: "选中 Assistant 正文、引用并发送追问。Quote 是用户交互，不是 AG-UI Event。",
  category: "presentation",
  reference: {
    audience: "frontend",
    protocol: "AG-UI normal text streaming",
    pattern: "User text selection → composer quote",
    presentation: "Agent UI Quote",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
    notes: ["Quote is not an AG-UI event.", "Select a passage, quote it, and send a follow-up question."],
  },
  steps: [{ type: "message", text: "React 19 引入了 Actions，用于简化异步状态变更。操作执行期间，Actions 会统一处理等待状态、乐观更新和错误处理。\n\n引用功能可以让你针对某一段内容提问，而不必重复整段回答。选中这条回复中的一段，点击“引用”，再询问这部分内容的含义。", intervalMs: 25 }],
});
