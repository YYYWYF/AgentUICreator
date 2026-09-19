import { describe, expect, it } from "vitest";

import {
  conversationPresentationConfig,
  conversationWelcomeConfig,
} from "../agent-ui/conversation/config";

describe("assistant-ui application presentation config", () => {
  it("owns Welcome copy in application source", () => {
    expect(conversationWelcomeConfig).toEqual({
      title: "How can I help you today?",
    });
    expect(conversationPresentationConfig).toEqual({
      welcome: conversationWelcomeConfig,
    });
  });

  it("does not expose the removed Runtime Model presentation resolver", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const source = await readFile(
      fileURLToPath(new URL("../agent-ui/conversation/config/conversation-presentation-config.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("AppUIRuntimeModel");
    expect(source).not.toContain("pluginInstances");
    expect(source).not.toContain("resolveConversationPresentationConfig");
  });
});
