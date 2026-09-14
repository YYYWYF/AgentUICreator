import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui interaction state contract", () => {
  it("leaves reasoning and tool presentation with upstream assistant-ui", async () => {
    const adapter = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationAdapter.tsx"),
      "utf8",
    );
    const thread = await readFile(
      path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"),
      "utf8",
    );

    expect(adapter).toContain("Welcome:");
    expect(adapter).not.toMatch(/ReasoningGroup|ToolGroup|ToolFallback/u);
    expect(thread).toContain("MessagePrimitive.Parts");
    expect(thread).toContain("Reasoning");
    expect(thread).toContain("ToolGroup");
  });

  it("does not expose legacy message Slot bridge ownership", async () => {
    const slots = await readFile(
      path.join(projectRoot, "agent-ui/conversation/slots/semantic-slots.ts"),
      "utf8",
    );
    expect(slots).toContain("emptyWelcome");
    expect(slots).toContain("emptySuggestions");
    expect(slots).not.toMatch(/conversation\.message|conversation\.timeline|conversation\.composer/u);
  });
});
