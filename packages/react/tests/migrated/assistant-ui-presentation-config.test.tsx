import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";
import { describe, expect, it } from "vitest";

import {
  conversationPresentationConfig,
  conversationWelcomeConfig,
} from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/config/index";

describe("assistant-ui application presentation config", () => {
  it("lets locale defaults own Welcome copy while preserving explicit application overrides", () => {
    expect(conversationWelcomeConfig).toEqual({});
    expect(conversationPresentationConfig).toEqual({
      welcome: conversationWelcomeConfig,
    });
  });

  it("does not expose the removed Runtime Model presentation resolver", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const source = await readFile(
      fileURLToPath(new URL("agent-ui/conversation/config/conversation-presentation-config.ts", `file://${await generatedProjectFixture()}/`)),
      "utf8",
    );
    expect(source).not.toContain("AppUIRuntimeModel");
    expect(source).not.toContain("pluginInstances");
    expect(source).not.toContain("resolveConversationPresentationConfig");
  });
});
