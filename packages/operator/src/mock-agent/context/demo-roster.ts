import type { DirectiveContextResolver } from "./directive-context.js";

/** Development fixture only; never installed into a production frontend template. */
const demoRoster = new Map([
  ["employee_84721", { name: "张三", department: "产品部", title: "产品经理" }],
  ["employee_84722", { name: "张晓", department: "研发部", title: "前端工程师" }],
  ["employee_84723", { name: "李四", department: "设计部", title: "产品设计师" }],
]);

/** Authorization must come from server-owned session data in a production resolver. */
export function createDemoUserResolver(
  authorizedIds: ReadonlySet<string> = new Set(demoRoster.keys()),
): DirectiveContextResolver {
  return async (reference, { signal }) => {
    signal.throwIfAborted();
    if (!authorizedIds.has(reference.id)) return null;
    const employee = demoRoster.get(reference.id);
    if (employee === undefined) return null;
    const { name, department, title } = employee;
    return {
      description: `Mentioned employee ${reference.id}`,
      value: JSON.stringify({ name, department, title }),
    };
  };
}
