import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import { Agent } from "./agent-ui";

/** Host-owned integration point. The generated Agent uses Assistant Mode. */
const demoAttachmentAdapter = import.meta.env.DEV ? new DemoAttachmentAdapter() : undefined;

export function AgentMount() {
  const props = { endpoint: import.meta.env.VITE_AGENT_ENDPOINT || "/agent",
    ...(demoAttachmentAdapter === undefined ? {} : { attachmentAdapter: demoAttachmentAdapter }),
  };
  return <Agent {...props} />;
}
