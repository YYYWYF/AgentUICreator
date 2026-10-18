import { useMemo, type ReactNode } from "react";
import { useAgentUILocale, useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import { Agent, AgentUIProvider } from "./agent-ui";

/** Host-owned integration point. The generated Agent uses Embedded Mode. */

export function AgentHostProvider({ children }: { children: ReactNode }) {
  const locale = useAgentUILocaleCode();
  const attachmentMessages = useAgentUILocale("attachments");
  const demoAttachmentAdapter = useMemo(() => import.meta.env.DEV ? new DemoAttachmentAdapter(attachmentMessages) : undefined, [attachmentMessages]);
  return <AgentUIProvider locale={locale} attachmentAdapter={demoAttachmentAdapter} onError={reportHostError}>{children}</AgentUIProvider>;
}

export function AgentMount() { return <Agent />; }

function reportHostError(error: Error) { console.error("AGENT_UI_HOST_ERROR", error); }
