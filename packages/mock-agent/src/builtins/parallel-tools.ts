import { defineScenario } from "../scenario.js";

export const parallelToolsScenario = defineScenario({
  id: "parallel-tools",
  title: "Parallel Tools",
  description: "三个工具以确定性的交错顺序并行执行。",
  category: "tools",
  capabilities: ["tool", "parallel-tool"],
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Parallel Tool Calls",
    presentation: "assistant-ui ToolCall",
    eventFlow: [
      "TOOL_CALL_START/ARGS/END (each tool)",
      "TOOL_CALL_RESULT (each tool)",
    ],
  },
  steps: [
    {
      type: "parallel-tools",
      tools: [
        {
          id: "parallel-search-files",
          name: "search_files",
          args: { query: "assistant-ui" },
          result: { matches: ["MessageList.tsx", "assistant-ui-toolkit.tsx"] },
          startDelayMs: 0,
          prepareDurationMs: 400,
          durationMs: 2_400,
        },
        {
          id: "parallel-inspect-component",
          name: "inspect_component",
          args: { component: "ConversationSurface" },
          result: { props: ["model", "runtime", "threadBinding"] },
          startDelayMs: 100,
          prepareDurationMs: 500,
          durationMs: 1_200,
        },
        {
          id: "parallel-read-config",
          name: "read_config",
          args: { path: "app-ui/app-ui.json" },
          result: { version: 1, root: "workspace-shell" },
          startDelayMs: 200,
          prepareDurationMs: 300,
          durationMs: 3_200,
        },
      ],
    },
    {
      type: "message",
      text: "并行检查已经完成。",
      intervalMs: 35,
    },
  ],
});
