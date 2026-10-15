import { defineScenario } from "../scenario.js";

export const webSearchScenario = defineScenario({
  id: "web-search",
  title: "Web Search",
  description: "标准 AG-UI 工具调用，通过独立 UI Plugin 展示网页搜索结果。",
  category: "tools",
  capabilities: ["tool"],
  resources: ["web-search"],
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Tool call → result → assistant-ui Toolkit renderer",
    presentation: "assistant-ui WebSearch",
    eventFlow: ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"],
    notes: ["Install web-search explicitly; removing it restores ToolFallback without changing this scenario."],
  },
  steps: [{
    type: "tool",
    name: "web_search",
    args: { query: "assistant-ui AG-UI" },
    result: { results: [
      { title: "assistant-ui", domain: "assistant-ui.com" },
      { title: "AG-UI", domain: "docs.ag-ui.com" },
    ] },
    prepareDurationMs: 600,
    durationMs: 1800,
  }],
});
