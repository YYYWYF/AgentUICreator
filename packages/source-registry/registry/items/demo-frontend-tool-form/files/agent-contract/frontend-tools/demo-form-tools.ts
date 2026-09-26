import { z } from "zod";
import { defineFrontendTool, type AppFrontendToolExecutionContext } from "../../runtime/tools";
import { DEMO_FORM_SERVICE, DEMO_FORM_FIELDS, type DemoFormService } from "../../services/demo-form";
function capability({ services, signal }: AppFrontendToolExecutionContext) {
  if (signal.aborted) throw new DOMException("Frontend tool execution aborted", "AbortError");
  const form = services.get<DemoFormService>(DEMO_FORM_SERVICE);
  if (!form) throw new Error("Form capability unavailable");
  return form;
}
export const frontendTools = [
  defineFrontendTool({ name: "set_form_field", description: "Sets a form field. Call this when the user provides data for a field.",
    inputSchema: z.strictObject({ name: z.enum(DEMO_FORM_FIELDS), value: z.string() }), requires: [DEMO_FORM_SERVICE],
    async execute(context, { name, value }) { await capability(context).setField(name, value); return { success: true, name, value }; } }),
  defineFrontendTool({ name: "submit_form", description: "Submit the form. Confirm with the user before submitting.",
    inputSchema: z.strictObject({}), requires: [DEMO_FORM_SERVICE], execute(context) { return capability(context).submit(); } }),
  defineFrontendTool({ name: "reset_form", description: "Reset the form. Confirm with the user before resetting.",
    inputSchema: z.strictObject({}), requires: [DEMO_FORM_SERVICE], execute(context) { return capability(context).reset(); } }),
];
