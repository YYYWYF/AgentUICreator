import { development } from './agent-ui/application/environment';
import { useMemo } from "react";
import { useAgentUILocale, useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import { Agent } from "./agent-ui";
import { createHttpConversationDataSource } from "./agent-ui/services/conversations";

/** Host-owned integration point. The generated Agent uses Embedded Mode. */

export function AgentMount() {
  const locale = useAgentUILocaleCode();
  const attachmentMessages = useAgentUILocale("attachments");
  // Production Hosts supply their own history data source and API credentials.
  const conversationDataSource = useMemo(() => development
    ? createHttpConversationDataSource({ endpoint: "/__agent-ui/mock-data" })
    : undefined, []);
  const demoAttachmentAdapter = useMemo(() => development ? new DemoAttachmentAdapter(attachmentMessages) : undefined, [attachmentMessages]);
  return <Agent endpoint="/agent" locale={locale} attachmentAdapter={demoAttachmentAdapter} conversationDataSource={conversationDataSource} onError={reportHostError} />;
}

function reportHostError(error: Error) { console.error("AGENT_UI_HOST_ERROR", error); }
