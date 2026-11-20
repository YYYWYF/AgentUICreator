import { development } from './agent-ui/application/environment';
import { useMemo } from "react";
import { useLocale, useLocaleCode } from "@za38.03/agent-ui-plugins";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import { Agent } from "./agent-ui";
import { createConversationDataSource } from "./agent-ui/services/conversations";

/** Host-owned integration point. The generated Agent uses Embedded Mode. */

export function AgentMount() {
  const locale = useLocaleCode();
  const attachmentMessages = useLocale("attachments");
  // Production Hosts supply their own history data source and API credentials.
  const conversationDataSource = useMemo(() => development
    ? createConversationDataSource({ endpoint: "/__agent-ui/mock-data" })
    : undefined, []);
  const demoAttachmentAdapter = useMemo(() => development ? new DemoAttachmentAdapter(attachmentMessages) : undefined, [attachmentMessages]);
  return <Agent endpoint="/agent" locale={locale} attachmentAdapter={demoAttachmentAdapter} conversationDataSource={conversationDataSource} onError={reportHostError} />;
}

function reportHostError(error: Error) { console.error("AGENT_UI_HOST_ERROR", error); }
