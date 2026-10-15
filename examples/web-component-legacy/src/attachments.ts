import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import type { AgentUIElement } from "@za38.03/agent-ui-web-component";
// Demo-only file preparation; the Web Component never owns upload/storage.
const element = document.querySelector("agent-ui") as AgentUIElement;
element.config = { ...element.config, attachmentAdapter: new DemoAttachmentAdapter() };
