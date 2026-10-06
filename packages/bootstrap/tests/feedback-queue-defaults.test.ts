import { describe, expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "../src/index.js";
const agentUIPresetRegistry = createDefaultAgentUIPresetRegistry(value => value);
import { readFile } from "node:fs/promises";

describe("generated feedback and Queue defaults", () => {
  it.each(["assistant", "embedded", "platform"] as const)("%s includes Feedback without introducing a Queue Plugin", mode => {
    const preset = agentUIPresetRegistry.get(`${mode}/default`);
    const model = JSON.stringify(preset.createAppUIModel());
    expect(preset.sourceItems).toContain("plugin/assistant-ui-feedback-actions");
    expect(model).toContain('"id":"assistant-ui-feedback-actions-main"');
    expect(preset.sourceItems.some(id => id.includes("message-queue"))).toBe(false);
  });
  it("passes the generated application config to the Runtime", async () => {
    const config = await readFile(new URL("../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/config/conversation-runtime-config.ts", import.meta.url), "utf8");
    const agent = await readFile(new URL("../../source-registry/registry/items/foundation-core/files/application/Agent.tsx", import.meta.url), "utf8");
    expect(config).toContain("conversationMessageQueueEnabled = true");
    expect(agent).toContain("enableMessageQueue={conversationMessageQueueEnabled}");
    expect(agent).toContain("feedbackAdapter={feedbackAdapter}");
  });
});
