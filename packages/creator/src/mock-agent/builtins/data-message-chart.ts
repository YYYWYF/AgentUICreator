import { defineScenario } from "../scenario.js";

export const dataMessageChartScenario = defineScenario({
  id: "data-message-chart",
  resources: ["chart-message"],
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
        title: "季度销售额",
        items: [
          { label: "第一季度", value: 120 },
          { label: "第二季度", value: 180 },
          { label: "第三季度", value: 160 },
          { label: "第四季度", value: 240 },
        ],
      },
    },
    { type: "message", text: "第四季度是当前销售额最高的季度。", intervalMs: 35 },
  ],
});
