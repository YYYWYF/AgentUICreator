import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
import type { AgentUIElement } from "@agentui/web-component";
// Demo-only file preparation; the Web Component never owns upload/storage.
const element = document.querySelector("agent-ui") as AgentUIElement;
element.config = { ...element.config, attachmentAdapter: new DemoAttachmentAdapter() };
