import type { ConversationToolCallProps } from "@agent-ui/react";
import type { ConversationFrontendToolUIRegistry } from "@agent-ui/runtime-conversation";
import { useAgentUILocale } from "../../i18n/useAgentUILocale";
function receipt(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null ? value as Record<string, unknown> : {}; }
/** Historical receipts only: never reads or mutates current form state. */
export function DemoFormToolUI({ args, result, status, isError, toolName }: ConversationToolCallProps) {
  const locale = useAgentUILocale("frontendTools");
  const data = receipt(result); const input = receipt(args);
  const failed = isError || status.type === "incomplete" || data.success === false;
  const running = status.type === "running" || status.type === "requires-action";
  const label = failed ? locale.formFailed : running ? locale.formUpdating
    : toolName === "submit_form" ? locale.formSubmitted : toolName === "reset_form" ? locale.formReset
    : `${locale.fieldUpdated} ${String(data.name ?? input.name ?? "")} ${locale.fieldTo} ${String(data.value ?? input.value ?? "")}`;
  return <div data-frontend-tool={toolName}>{label}</div>;
}
export const frontendToolUIs: ConversationFrontendToolUIRegistry = {
  set_form_field: { display: "standalone", render: DemoFormToolUI },
  submit_form: { display: "standalone", render: DemoFormToolUI },
  reset_form: { display: "standalone", render: DemoFormToolUI },
};
