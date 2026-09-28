import { defineScenario } from "../scenario.js";

export const fileOutputScenario = defineScenario({
  id: "file-output",
  title: "Tool Result：File Output",
  description: "Backend generate_file 返回虚拟 PDF URL，由 named Tool UI 展示官方文件卡片和下载入口。",
  category: "presentation",
  capabilities: ["tool"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "Backend Tool Result",
    presentation: "assistant-ui Tool UI + File",
    level: "recommended",
    eventFlow: [
      "TOOL_CALL_START (generate_file)",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT (JSON string)",
      "react-ag-ui → tool-call.result → named Tool UI → File",
      "TEXT_MESSAGE_START / CONTENT / END",
    ],
    notes: [
      "AG-UI 0.0.59 requires TOOL_CALL_RESULT.content to remain a string. react-ag-ui 0.0.62 converts the JSON result into an object.",
      "The filename/mimeType/url schema belongs only to generate_file, not to the global AG-UI protocol.",
      "This backend renderer does not advertise generate_file in RunAgentInput.tools.",
      "The URL is virtual: no file is generated and a successful remote download is not required.",
    ],
  },
  steps: [
    {
      type: "tool",
      name: "generate_file",
      args: { filename: "quarterly-report.pdf", format: "pdf" },
      result: {
        filename: "quarterly-report.pdf",
        mimeType: "application/pdf",
        url: "https://example.com/generated/quarterly-report.pdf",
      },
      prepareDurationMs: 250,
      durationMs: 1_200,
    },
    { type: "message", text: "报告已经生成。", intervalMs: 35 },
  ],
});
