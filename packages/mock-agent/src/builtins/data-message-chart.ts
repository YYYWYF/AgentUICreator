import { defineScenario } from "../scenario.js";

export const dataMessageChartScenario = defineScenario({
  id: "data-message-chart",
  title: "Data Message / Custom Chart",
  description: "标准 AG-UI CUSTOM 在 assistant 消息中渲染图表。",
  category: "presentation",
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "CUSTOM → Data Message UI",
    presentation: "AgentUI Chart Message plugin",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END", "CUSTOM chart", "TEXT_MESSAGE_START/CONTENT/END"],
  },
  steps: [
    { type: "message", text: "下面是季度销售情况：", intervalMs: 35 },
    {
      type: "custom",
      name: "chart",
      value: {
        title: "Quarterly Sales",
        items: [
          { label: "Q1", value: 120 },
          { label: "Q2", value: 180 },
          { label: "Q3", value: 160 },
          { label: "Q4", value: 240 },
        ],
      },
    },
    { type: "message", text: "Q4 是当前最高季度。", intervalMs: 35 },
  ],
});
