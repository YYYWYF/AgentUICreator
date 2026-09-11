import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import { agentMessageSourcesPlugin } from "../plugins/agent-message-sources/definition";
import { AgentMessageSourcesPlugin } from "../plugins/agent-message-sources";
import { MessageRenderProvider } from "../runtime/message-rendering";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const message: AgentMessage = {
  id: "message-with-sources",
  producer: { type: "root" },
  role: "assistant",
  content: "Sources",
};

describe("Agent Message Sources runtime binding", () => {
  it("renders normalized source context without parsing raw metadata", () => {
    const output = renderToStaticMarkup(
      <MessageRenderProvider
        value={{
          kind: "sources",
          message,
          turnId: "turn-with-sources",
          items: [
            {
              key: "docs",
              title: "OpenAI Docs",
              href: "https://example.com/docs",
              description: "API reference",
            },
            { key: "spec", title: "AG-UI specification" },
          ],
        }}
      >
        <AgentMessageSourcesPlugin renderSlot={() => null} />
      </MessageRenderProvider>,
    );

    expect(agentMessageSourcesPlugin.manifest).toMatchObject({
      id: "agent-message-sources",
      version: "1.0.0",
    });
    expect(output).toContain('data-ui-plugin="agent-message-sources"');
    expect(output).toContain('data-agent-message-id="message-with-sources"');
    expect(output).toContain("来源 · 2");
    expect(output.match(/data-slot="agent-source"/gu)).toHaveLength(2);
    expect(output).toContain("OpenAI Docs");
    expect(output).toContain("API reference");
    expect(output).toContain('href="https://example.com/docs"');
    expect(output).toContain("AG-UI specification");
  });

  it("does not read Agent state, conversation services, or source metadata", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/agent-message-sources/index.tsx"),
      "utf8",
    );
    expect(source).toContain("useMessageSourcesRenderContext");
    expect(source).not.toMatch(/useAgentMessages|useAgentState|inspectSources|usePluginService/u);
    expect(source).not.toMatch(/metadata|agentUI|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']/u);
  });
});
