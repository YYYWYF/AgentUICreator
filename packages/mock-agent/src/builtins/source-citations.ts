import { defineScenario } from "../scenario.js";

export const sourceCitationsScenario = defineScenario({
  id: "source-citations",
  resources: ["source-citations-message"],
  title: "Tool Result：Source Citations",
  description: "search_sources 返回应用自定义来源结构，由 named Tool UI 展示官方 Sources。",
  category: "presentation",
  capabilities: ["tool", "sources"],
  reference: {
    audience: "backend",
    protocol: "AG-UI Tool Call",
    pattern: "Application-defined Tool Result → Sources",
    presentation: "assistant-ui Sources",
    level: "recommended",
    eventFlow: [
      "TOOL_CALL_START (search_sources)",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT (JSON string)",
      "react-ag-ui → tool-call.result → named Tool UI → Sources",
      "TEXT_MESSAGE_START / CONTENT / END",
    ],
    notes: [
      "AG-UI does not define a citation/source event.",
      "The sources schema belongs to search_sources Tool Result.",
      "assistant-ui SourceMessagePart is a frontend/runtime presentation contract.",
      "AG-UI document.source describes attachment URL/data origin, not answer citations.",
      "This backend renderer does not advertise search_sources in RunAgentInput.tools.",
      "No CUSTOM or SOURCE_* event is used. This demo performs no RAG search or source persistence.",
    ],
  },
  steps: [
    {
      type: "tool",
      name: "search_sources",
      args: { query: "React 19 migration" },
      result: {
        sources: [
          { sourceType: "url", id: "react-19", url: "https://react.dev/blog/2024/12/05/react-19", title: "React 19" },
          { sourceType: "document", id: "migration-guide", title: "Internal migration guide", mediaType: "application/pdf", filename: "migration-guide.pdf" },
        ],
      },
      prepareDurationMs: 250,
      durationMs: 1_200,
    },
    { type: "message", text: "可参考 React 19 官方说明和内部迁移指南。", intervalMs: 35 },
  ],
});
