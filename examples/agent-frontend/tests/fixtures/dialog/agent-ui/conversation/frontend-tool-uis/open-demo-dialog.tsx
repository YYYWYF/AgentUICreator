import type { ConversationToolCallProps } from "@agent-ui/react";
import type { ConversationFrontendToolUIRegistry } from "@agent-ui/runtime-conversation";
import { useAgentUILocale } from "../../../../../../agent-ui/i18n/useAgentUILocale";
function titleOf(value: unknown): string {
  if (value === null || typeof value !== "object") return "";
  const title = (value as Record<string, unknown>).title;
  return typeof title === "string" ? title : "";
}
/** A replayable projection. Mounting this component never invokes a capability. */
export function OpenDemoDialogToolUI({ args, result, status, isError }: ConversationToolCallProps) {
  const locale = useAgentUILocale("frontendTools");
  const label = isError || status.type === "incomplete" ? locale.failed
    : status.type === "running" || status.type === "requires-action" ? locale.opening : locale.opened;
  return <div data-frontend-tool="open_demo_dialog">{label} {titleOf(result) || titleOf(args)}</div>;
}
export const frontendToolUIs: ConversationFrontendToolUIRegistry = {
  open_demo_dialog: { display: "standalone", render: OpenDemoDialogToolUI },
};
