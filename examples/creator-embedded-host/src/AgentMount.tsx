import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import { Agent } from "./agent-ui";

/** Host-owned integration point. The generated Agent uses Embedded Mode. */
const demoAttachmentAdapter = import.meta.env.DEV ? new DemoAttachmentAdapter() : undefined;

export function AgentMount() {
  return <Agent attachmentAdapter={demoAttachmentAdapter} />;
}
