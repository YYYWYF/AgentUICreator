import { createReactHookFormFrontendTools } from "../../integrations/react-hook-form";
import { DEMO_FORM_SERVICE, DEMO_FORM_FIELDS } from "../../services/demo-form";

export const frontendTools = createReactHookFormFrontendTools({
  serviceName: DEMO_FORM_SERVICE,
  fields: DEMO_FORM_FIELDS,
  expose: ["set_form_field", "submit_form", "reset_form"],
});
