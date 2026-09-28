import { formTools } from "@assistant-ui/react-hook-form";

export const reactHookFormToolContracts = {
  set_form_field: { name: "set_form_field", description: formTools.set_form_field.description },
  submit_form: { name: "submit_form", description: formTools.submit_form.description },
  reset_form: { name: "reset_form", description: formTools.reset_form.description },
} as const;
export type ReactHookFormToolName = keyof typeof reactHookFormToolContracts;
