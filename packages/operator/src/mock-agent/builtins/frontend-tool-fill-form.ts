import { defineScenario } from "../scenario.js";
export const frontendToolFillFormScenario = defineScenario({
  // Retain the scenario ID so existing Mock selections remain valid.
  id: "frontend-tool-fill-form", title: "Human Tool · Conversation Form",
  description: "会话内收集多个字段，校验并整体提交 ToolMessage 后继续 Agent。",
  category: "human-in-loop", capabilities: ["tool"],
  resources: ["human-form-demo"],
  reference: { audience: "frontend", protocol: "AG-UI", pattern: "Human Tool → Conversation form → success → ToolMessage → continuation",
    eventFlow: ["TOOL_CALL_START/ARGS/END", "RUN_FINISHED(success)", "ToolMessage", "TEXT_MESSAGE_*"],
    notes: ["All fields are collected together in one conversation card.", "The Agent waits for submission; it does not fill fields or submit an external form.", "History shows the submitted values without an editable form."] },
  steps: [
    { type: "message", text: "请填写个人资料和项目想法，提交后我会继续。" },
    { type: "tool", human: true, name: "collect_user_details", args: {}, result: null },
  ],
  async prepareRun(input) {
    if (input.resume?.length) throw new Error("Form answers must be sent as ToolMessages");
    const lastUser = input.messages.reduce((last, message, index) => message.role === "user" ? index : last, -1);
    const turn = input.messages.slice(lastUser + 1);
    const call = turn.flatMap(message => message.role === "assistant" ? message.toolCalls ?? [] : [])
      .reverse().find(tool => tool.function.name === "collect_user_details");
    if (call) {
      const result = turn.find(message => message.role === "tool" && message.toolCallId === call.id);
      if (result?.role !== "tool") return { steps: [] };
      if (result.error !== undefined) return { steps: [{ type: "message", text: "未收到有效的资料提交，资料收集已结束。" }] };
      const payload: unknown = JSON.parse(result.content);
      const values = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { values?: Record<string, unknown> }).values : undefined;
      const fields = ["firstName", "lastName", "email", "projectIdea"];
      if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== fields.length ||
          fields.some(name => !Object.hasOwn(values, name) || typeof values[name] !== "string" || values[name].length > 4000) ||
          !(values.firstName as string).trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email as string)) {
        throw new Error("Invalid user details");
      }
      return { steps: [
        { type: "message", text: `已收到 ${values.firstName} 的资料，联系邮箱是 ${values.email}。${values.projectIdea ? `我会根据你的项目想法“${values.projectIdea}”继续。` : "我们可以继续完善项目需求。"}` },
      ] };
    }
    if (!input.tools.some(tool => tool.name === "collect_user_details")) return { steps: [
      { type: "message", text: "信息收集表单不可用，请先启用对应资源。" },
    ] };
    return { steps: frontendToolFillFormScenario.steps };
  },
});
