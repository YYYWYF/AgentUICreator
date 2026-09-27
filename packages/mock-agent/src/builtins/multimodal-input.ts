import { defineScenario } from "../scenario.js";

export const multimodalInputScenario = defineScenario({
  id: "multimodal-input",
  title: "Multimodal Input",
  description: "发送文本、小图片或 PDF 附件，使用标准 AG-UI 多模态输入。固定回复不代表附件已经验收，请检查实际请求。",
  category: "basics",
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "UserMessage multimodal input",
    presentation: "assistant-ui Attachments",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
  },
  steps: [{
    type: "message",
    text: "多模态演示请求已完成。此场景返回固定确认文本；请在 Network 的 /agent 请求中检查最后一条 user message 的 text、image 或 document 内容。",
    intervalMs: 20,
  }],
});
