import { formTools as upstreamFormTools } from "@assistant-ui/react-hook-form";

/** Product-facing descriptions; form execution stays with the existing frontend tool integration. */
export const formTools: Record<"set_form_field" | "submit_form" | "reset_form", { description: string }> = {
  set_form_field: { description: upstreamFormTools.set_form_field.description },
  submit_form: { description: upstreamFormTools.submit_form.description },
  reset_form: { description: upstreamFormTools.reset_form.description },
};
