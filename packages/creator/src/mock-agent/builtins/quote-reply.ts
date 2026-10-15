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
    presentation: "assistant-ui Quote",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
    notes: ["Quote is not an AG-UI event.", "Select a passage, quote it, and send a follow-up question."],
  },
  steps: [{ type: "message", text: "React 19 introduces Actions to simplify asynchronous state changes. Actions coordinate pending states, optimistic updates, and error handling while an operation completes.\n\nA quote lets you ask about one specific passage without repeating the entire answer. Select part of this response, choose Quote, and ask why that detail matters.", intervalMs: 25 }],
});
