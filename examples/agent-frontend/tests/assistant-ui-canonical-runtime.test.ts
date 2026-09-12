import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";

async function readModel() {
  return parseAppUIModelJson(
    await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"),
  );
}

describe("assistant-ui canonical runtime", () => {
  it("keeps canonical conversation owners enabled", async () => {
    const model = await readModel();

    expect(
      model.pluginInstances["assistant-ui-thread-list-main"],
    ).toMatchObject({
      pluginId: "assistant-ui-thread-list",
      enabled: true,
      mount: { slotId: "agent-conversations" },
    });
    expect(
      model.pluginInstances["agent-conversation-surface-main"],
    ).toMatchObject({
      pluginId: "conversation-surface",
      enabled: true,
      mount: { slotId: "workspace.conversation" },
    });
    expect(model.pluginInstances["agent-message-sources-main"]).toBeUndefined();

    expect(model.pluginInstances["agent-conversations-main"]).toBeUndefined();
    expect(
      model.pluginInstances["assistant-ui-conversation-spike-main"],
    ).toBeUndefined();

    expect(Object.values(model.pluginInstances).filter((instance) => instance.enabled)).toHaveLength(4);
  });

  it("keeps App on one assistant-ui Runtime owner", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(app).toContain("function AssistantUiRuntimeBoundary");
    expect(app).toContain("<AssistantUiAgUiRuntimeProvider");
    expect(app).toContain("<AssistantUiRuntimeBoundary");
    expect(app.match(/<AssistantUiAgUiRuntimeProvider/gu)).toHaveLength(1);
    expect(app).toContain(
      'import "../agent-ui/adapters/assistant-ui/styles/globals.css";',
    );
    expect(app).not.toMatch(
      /createAgUiTransport|createAgentRuntime|LegacyRuntimeBoundary|RuntimeModeBoundary|resolveConversationRuntimeMode|legacyRuntime|assistantUiSpike/u,
    );
  });

  it("keeps the canonical runtime diagnostics in the development surface", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const overlay = await readFile(
      new URL("../src/dev/AssistantUiRuntimeDebugOverlay.tsx", import.meta.url),
      "utf8",
    );

    expect(app).toContain("AssistantUiRuntimeDebugOverlay");
    expect(app).toContain("import.meta.env.DEV");
    expect(overlay).toContain("useAssistantUiRuntimeObservation");
    expect(overlay).toContain("data-assistant-ui-runtime-debug");
    expect(overlay).not.toContain("spike");
  });
});
