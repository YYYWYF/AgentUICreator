import contextRetrievalSample from "./context-retrieval-sample.json" with { type: "json" };
import { defineScenario } from "../scenario.js";

export const contextRetrievalScenario = defineScenario({
  id: "context-retrieval",
  resources: ["context-retrieval-message"],
  title: "Data Message / Context Retrieval",
  description: "标准 AG-UI CUSTOM 上下文检索事件，并在 assistant 消息中显示检索结果。",
  category: "presentation",
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "CUSTOM → Data Message UI",
    presentation: "Agent UI Context Retrieval Message plugin",
    eventFlow: [
      "TEXT_MESSAGE_START/CONTENT/END",
      "CUSTOM CONTEXT_STARTED",
      "CUSTOM CONTEXT_CONTENT",
      "CUSTOM CONTEXT_FINISHED",
      "TEXT_MESSAGE_START/CONTENT/END",
    ],
  },
  steps: [
    { type: "message", text: "我先查一下公司请假制度。", intervalMs: 35 },
    { type: "custom", name: "CONTEXT_STARTED", value: undefined },
    { type: "custom", name: "CONTEXT_CONTENT", value: contextRetrievalSample },
    { type: "custom", name: "CONTEXT_FINISHED", value: undefined },
    { type: "message", text: "公司实行五天工作制，具体假期和申请要求如下方检索内容。", intervalMs: 35 },
  ],
});
