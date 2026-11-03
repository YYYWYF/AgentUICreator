import { z } from "zod";
import { defineFrontendTool, type AppFrontendToolDefinition, type AppFrontendToolExecutionContext } from "../../runtime/tools";
import { reactHookFormToolContracts, type ReactHookFormToolName } from "./form-tool-contract";

export interface ReactHookFormCapability<TField extends string = string> {
  setField(name: TField, value: string): unknown | Promise<unknown>;
  reset(): unknown | Promise<unknown>;
  submit(): unknown | Promise<unknown>;
}

/** Installing this adapter grants no permission. The application must expose tools explicitly. */
export function createReactHookFormFrontendTools<TField extends string>(options: {
  serviceName: string;
  fields: readonly [TField, ...TField[]];
  expose: readonly ReactHookFormToolName[];
}): readonly AppFrontendToolDefinition<any>[] {
  function capability({ services, signal }: AppFrontendToolExecutionContext) {
    if (signal.aborted) throw new DOMException("Frontend tool execution aborted", "AbortError");
    const form = services.get<ReactHookFormCapability<TField>>(options.serviceName);
    if (!form) throw new Error("Form capability unavailable");
    return form;
  }
  if (!Array.isArray(options.expose)) throw new Error("Form tool exposure must be explicit");
  if (new Set(options.expose).size !== options.expose.length) throw new Error("Duplicate form tool exposure");
  return options.expose.map(name => {
    switch (name) {
      case "set_form_field": return defineFrontendTool({
        ...reactHookFormToolContracts.set_form_field,
        inputSchema: z.strictObject({ name: z.enum(options.fields), value: z.string() }),
        requires: [options.serviceName],
        async execute(context, { name, value }) {
          await capability(context).setField(name, value);
          return { success: true, name, value };
        },
      });
      case "submit_form": return defineFrontendTool({
        ...reactHookFormToolContracts.submit_form, inputSchema: z.strictObject({}), requires: [options.serviceName],
        execute(context) { return capability(context).submit(); },
      });
      case "reset_form": return defineFrontendTool({
        ...reactHookFormToolContracts.reset_form, inputSchema: z.strictObject({}), requires: [options.serviceName],
        execute(context) { return capability(context).reset(); },
      });
      default: throw new Error(`Unknown form tool: ${name}`);
    }
  });
}
