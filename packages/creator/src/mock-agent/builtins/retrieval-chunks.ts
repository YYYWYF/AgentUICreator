import { defineScenario } from "../scenario.js";

export const retrievalChunksScenario = defineScenario({
  id: "retrieval-chunks",
  title: "Retrieval Chunks",
  description: "标准 AG-UI 工具调用，通过独立 UI Plugin 展示检索片段。",
  category: "tools",
  capabilities: ["tool"],
  resources: ["retrieval-chunks"],
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Tool call → result → assistant-ui Toolkit renderer",
    presentation: "assistant-ui RetrievalChunks",
    eventFlow: ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"],
    notes: ["Install retrieval-chunks explicitly; removing it restores ToolFallback without changing this scenario."],
  },
  steps: [{
    type: "tool",
    name: "search_docs",
    args: { query: "退款政策是什么？" },
    result: { chunks: [{
      id: "chunk-1",
      source: "policy.pdf",
      locator: "p.14",
      score: 0.91,
      text: "退款申请需在30天内提交。",
    }] },
    prepareDurationMs: 600,
    durationMs: 1800,
  }],
});
