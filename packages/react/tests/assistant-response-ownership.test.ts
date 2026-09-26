import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("Assistant Response ownership", () => {
  it("uses public assistant-ui APIs and leaves protocol identity outside grouping", async () => {
    const files = await Promise.all([
      read("internal/assistant-response.ts"),
      read("internal/assistant-response-runtime.tsx"),
      read("internal/composable-thread.tsx"),
    ]);
    for (const source of files) {
      expect(source).not.toMatch(/@assistant-ui\/(?:core|react-ag-ui)\/src\//);
      expect(source).not.toMatch(/@assistant-ui\/react\//);
      expect(source).not.toMatch(/from ["'][^"']*vendor[^"']*(?:runtime|primitive|store)/);
    }
    expect(files[0]).not.toContain("runId");
    expect(files[0]).not.toContain("vendor/");
    expect(files[1]).not.toContain("vendor/");
    expect(files[1]).not.toContain("startRun(");
    expect(files[1]).not.toContain("aui.thread()");
    expect(files[1]).not.toMatch(/\baui\s*\.\s*thread\s*\(/u);
    expect(files[1]).toContain("group.headMessageId");
    const responseActions = files[2]!.slice(files[2]!.indexOf("export const CanonicalResponseCopyAction"), files[2]!.indexOf("const UserFilePart"));
    expect(responseActions).not.toMatch(/ActionBarPrimitive\.(Copy|Reload|ExportMarkdown)|BranchPickerPrimitive|message\.isCopied/);
  });

  it("keeps full-message grouping subscriptions out of the AssistantMessage hot path", async () => {
    const source = await read("internal/composable-thread.tsx");
    const tailHookStart = source.indexOf("function useIsAssistantResponseTail()");
    const footerHostStart = source.indexOf("const AssistantResponseFooterHost:");
    const messageStart = source.indexOf("const AssistantMessage:");
    const messageEnd = source.indexOf("export const ResponseActionBarRoot");
    expect(tailHookStart).toBeGreaterThanOrEqual(0);
    expect(footerHostStart).toBeGreaterThan(tailHookStart);
    expect(messageStart).toBeGreaterThan(footerHostStart);
    expect(messageEnd).toBeGreaterThan(messageStart);

    const tailHook = source.slice(tailHookStart, footerHostStart);
    const footerHost = source.slice(footerHostStart, messageStart);
    const assistantMessage = source.slice(messageStart, messageEnd);
    const fullMessagesSubscription = /useAuiState\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.thread\.messages\s*\)/u;
    for (const hotPath of [tailHook, assistantMessage]) {
      expect(hotPath).not.toMatch(fullMessagesSubscription);
      expect(hotPath).not.toContain("resolveAssistantResponseGroup(");
      expect(hotPath).not.toContain("useConversationTurnOwnership(");
    }
    expect(tailHook).toContain('s.message.role === "assistant"');
    expect(tailHook).toContain('s.thread.messages[index + 1]?.role !== "assistant"');
    expect(assistantMessage).toContain("const isResponseTail = useIsAssistantResponseTail();");
    expect(assistantMessage).toMatch(/isResponseTail && !isRunning\s*\?\s*\(\s*<AssistantResponseFooterHost/u);
    expect(footerHost).toMatch(fullMessagesSubscription);
    expect(footerHost).toContain("resolveAssistantResponseGroup(messages, messageIndex)");
    expect(footerHost).toContain("turnOwnership?.isFooterOwner !== true");
  });
});
