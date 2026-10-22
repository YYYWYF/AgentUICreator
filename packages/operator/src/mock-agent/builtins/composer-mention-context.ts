import { defineScenario } from "../scenario.js";
import { resolveDirectiveContexts } from "../context/directive-context.js";
import { createDemoUserResolver } from "../context/demo-roster.js";

const resolvers = { user: createDemoUserResolver() };
export const composerMentionContextScenario = defineScenario({
  id: "composer-mention-context",
  title: "Composer · Mention Backend Context",
  category: "basics",
  resources: ["conversation-lexical-input", "conversation-command-source", "conversation-mention", "composer-trigger-demo"],
  description: "服务端按稳定员工 ID 查询示例花名册，将安全字段注入 AG-UI Context 后回答。",
  reference: {
    audience: "backend", protocol: "AG-UI user text + Context",
    pattern: "Stable directive ID → authorized resolver → AG-UI Context → answer",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
    notes: ["Mock backend reference only; production applications supply their own business resolver.",
      "All user-message history is resolved on every run; labels are never trusted for lookup."],
  },
  steps: [],
  async prepareRun(input, options) {
    const preparedInput = await resolveDirectiveContexts(input, resolvers, options);
    // Consume only freshly server-resolved entries, never client-supplied lookalike context.
    const employees = preparedInput.context.slice(input.context.length).map(context =>
      JSON.parse(context.value) as { name: string; department: string; title: string });
    const text = employees.length === 0 ? "没有找到当前可用的人员上下文。"
      : employees.map(employee => `${employee.name}是${employee.department}的${employee.title}。`).join("\n");
    return { input: preparedInput, steps: [{ type: "message", text, intervalMs: 0 }] };
  },
});
