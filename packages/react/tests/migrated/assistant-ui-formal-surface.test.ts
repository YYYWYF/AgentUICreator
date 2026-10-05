import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = await generatedProjectFixture();

describe("formal Conversation surface", () => {
  it("composes presentation through the public facade without creating a Runtime", async () => {
    const surface = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationSurface.tsx"),
      "utf8",
    );

    expect(surface).toContain('from "@agent-ui/react"');
    expect(surface).toContain("ConversationThread");
    expect(surface).toContain("TooltipProvider");
    expect(surface).toContain('data-agent-ui-conversation="true"');
    expect(surface).toContain('export type ConversationTheme = AgentUITheme');
    expect(surface).toContain("theme?: ConversationTheme");
    expect(surface).toContain('theme = "light"');
    expect(surface).toContain('colorScheme === "dark" ? "dark" : undefined');
    expect(surface).toContain("data-theme={theme}");
    expect(surface).not.toMatch(
      /@ag-ui\/client|@assistant-ui\/|AgentRuntime|AppUIModel|PluginRegistry|internal\/vendor/u,
    );
  });
});
