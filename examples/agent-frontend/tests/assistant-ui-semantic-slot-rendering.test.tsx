import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("assistant-ui semantic Slot rendering", () => {
  it("routes only public ThreadComponent seams through the adapter", async () => {
    const adapter = await read(
      "agent-ui/conversation/ConversationAdapter.tsx",
    );
    const plugin = await read(
      "plugins/conversation-surface/index.tsx",
    );
    expect(plugin).toContain('renderSlot("emptyWelcome"');
    expect(plugin).toContain('renderSlot("emptySuggestions"');
    expect(plugin).toContain('renderSlot("headerActions"');
    expect(plugin).toContain('renderSlot("liveStatus"');
    expect(plugin).toContain('data-conversation-surface-slot="liveStatus"');
    const styles = await read("plugins/conversation-surface/styles.css");
    expect(styles).toContain("display: flex;");
    expect(styles).toContain("flex-direction: column;");
    expect(styles).toContain("flex: 1 1 auto;");
    expect(styles).not.toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(adapter).toContain("welcome?: ReactNode");
    expect(adapter).toContain("suggestions?: ReactNode");
    expect(adapter).not.toContain("renderSlot");
    expect(adapter).not.toContain("emptyWelcome");
    expect(adapter).not.toContain("emptySuggestions");
    expect(adapter).not.toContain("SemanticReasoningOutlet");
    expect(adapter).not.toContain("SemanticToolActivityOutlet");
    expect(adapter).not.toContain("SemanticToolItemOutlet");
    expect(adapter).not.toMatch(
      /conversation\.timeline|conversation\.composer|conversation\.message\.attachments|conversation\.message\.sources/u,
    );
  });

  it("routes starter suggestions through the canonical child Slot", async () => {
    const app = await read("src/App.tsx");
    const thread = await read(
      "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    const globals = await read("../../packages/react/src/styles.css");
    expect(app).toContain("suggestions={conversationStarterSuggestions}");
    expect(app).toContain("ConversationRuntimeProvider");
    expect(thread).toContain("ThreadPrimitive.Suggestions");
    expect(thread).not.toContain("InitialSuggestionsWrapper");
    expect(globals).toContain(".aui-thread-welcome-suggestions");
    expect(globals).toContain("display: none");
  });

  it("keeps message auxiliary presentation in the upstream Thread", async () => {
    const thread = await read(
      "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    expect(thread).toContain("<UserMessageAttachments />");
    expect(thread).not.toContain("MessageFooter");
    expect(thread).not.toContain("UserAttachmentsWrapper");
  });
});
