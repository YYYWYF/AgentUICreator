import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import { agentMessageAttachmentsPlugin } from "../plugins/agent-message-attachments/definition";
import { AgentMessageAttachmentsPlugin } from "../plugins/agent-message-attachments";
import { MessageRenderProvider } from "../runtime/message-rendering";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const message: AgentMessage = {
  id: "message-with-attachments",
  producer: { type: "root" },
  role: "user",
  content: "Attachments",
};

describe("Agent Message Attachments runtime binding", () => {
  it("renders the canonical plugin from the current attachments context", () => {
    const output = renderToStaticMarkup(
      <MessageRenderProvider
        value={{
          kind: "attachments",
          message,
          turnId: "turn-with-attachments",
          items: [
            { key: "image", name: "image.png", kind: "image", href: "https://example.com/image.png" },
            { key: "audio", name: "audio.mp3", kind: "audio" },
            { key: "video", name: "video.mp4", kind: "video" },
            { key: "file", name: "report.pdf", kind: "file" },
          ],
        }}
      >
        <AgentMessageAttachmentsPlugin renderSlot={() => null} />
      </MessageRenderProvider>,
    );

    expect(agentMessageAttachmentsPlugin.manifest).toMatchObject({
      id: "agent-message-attachments",
      version: "1.0.0",
    });
    expect(output).toContain('data-ui-plugin="agent-message-attachments"');
    expect(output).toContain('data-agent-message-id="message-with-attachments"');
    expect(output).toContain('data-agent-turn-id="turn-with-attachments"');
    expect(output.match(/data-slot="agent-attachment"/gu)).toHaveLength(4);
    for (const kind of ["image", "audio", "video", "file"]) {
      expect(output).toContain(`data-kind="${kind}"`);
    }
    expect(output).toContain("image.png");
    expect(output).toContain('href="https://example.com/image.png"');
  });

  it("does not scan global Agent messages or state", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/agent-message-attachments/index.tsx"),
      "utf8",
    );
    expect(source).toContain("useMessageAttachmentsRenderContext");
    expect(source).not.toMatch(/useAgentMessages|useAgentState|inspectAttachments|usePluginService/u);
    expect(source).not.toMatch(/@ant-design\/x|@ant-design\/icons|from\s*["']antd["']/u);
  });
});
