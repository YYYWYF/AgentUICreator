import { useMemo } from "react";
import { useAgentUILocale, useAgentUILocaleCode } from "@za38.03/agent-ui-react";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-react/demo-attachments";
import { Agent } from "./agent-ui";

/** Host-owned integration point. The generated Agent uses Assistant Mode. */

export function AgentMount() {
  const locale = useAgentUILocaleCode();
  const attachmentMessages = useAgentUILocale("attachments");
  const demoAttachmentAdapter = useMemo(() => import.meta.env.DEV ? new DemoAttachmentAdapter(attachmentMessages) : undefined, [attachmentMessages]);
  return <Agent locale={locale} attachmentAdapter={demoAttachmentAdapter} />;
}
