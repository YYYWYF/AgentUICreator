import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui message composition", () => {
  it("uses the upstream Thread message and part composition", async () => {
    const thread = await readFile(
      path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"),
      "utf8",
    );

    expect(thread).toContain("MessagePrimitive.Parts");
    expect(thread).toContain("AssistantMessage");
    expect(thread).toContain("UserMessage");
    expect(thread).toContain("Reasoning");
    expect(thread).toContain("ToolGroup");
  });

  it("keeps canonical AssistantMessage ownership while exposing scoped renderer adapters", async () => {
    const adapter = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationAdapter.tsx"),
      "utf8",
    );
    const bridge = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ScopedRendererBridge.tsx"),
      "utf8",
    );
    const composableThread = await readFile(
      path.join(projectRoot, "../../packages/react/src/internal/composable-thread.tsx"),
      "utf8",
    );

    expect(adapter).toContain("createConversationSemanticThreadComponents");
    expect(adapter).toContain("Welcome:");
    expect(adapter).toContain("ScopedReasoningGroup");
    expect(adapter).toContain("ScopedToolGroup");
    expect(adapter).toContain("ScopedToolFallback");
    expect(adapter).toContain("AssistantMessageFooter: ScopedAssistantMessageFooter");
    expect(adapter).not.toContain("AssistantMessage: ScopedAssistantMessage");
    expect(bridge).toContain("ScopedAssistantMessageFooter");
    expect(bridge).not.toContain("ConversationCanonicalAssistantMessage");
    expect(composableThread).toContain("taskAwareGroupBy");
  });
});
