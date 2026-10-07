import { useAgentUILocaleCode } from "@agent-ui/react";
import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import { Agent } from "./agent-ui";

/** Host-owned integration point. The generated Agent uses Assistant Mode. */
const demoAttachmentAdapter = import.meta.env.DEV ? new DemoAttachmentAdapter() : undefined;

export function AgentMount() {
  const locale = useAgentUILocaleCode();
  return <Agent locale={locale} attachmentAdapter={demoAttachmentAdapter} />;
}
