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
      mount: { slotId: "conversation.navigation" },
    });
    expect(
      model.pluginInstances["agent-conversation-surface-main"],
    ).toMatchObject({
      pluginId: "conversation-surface",
      enabled: true,
      mount: { slotId: "conversation.surface" },
    });
    expect(model.pluginInstances["agent-conversation-service-main"]).toMatchObject({
      pluginId: "conversation-service",
      enabled: true,
    });
    expect(model.pluginInstances["theme-provider-main"]).toMatchObject({
      pluginId: "theme-provider",
      enabled: true,
    });
    expect(model.pluginInstances["theme-switch-main"]).toMatchObject({
      pluginId: "theme-switch",
      enabled: true,
      mount: { slotId: "application.theme-control" },
    });
    expect(model.pluginInstances["agent-message-sources-main"]).toBeUndefined();

    expect(model.pluginInstances["agent-conversations-main"]).toBeUndefined();
    expect(
      model.pluginInstances["assistant-ui-conversation-spike-main"],
    ).toBeUndefined();

    expect(Object.values(model.pluginInstances).filter((instance) => instance.enabled)).toHaveLength(6);
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

  it("keeps the canonical runtime diagnostics in the Dev Studio", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const devStudio = await readFile(
      new URL("../src/dev/DevStudio/DevStudio.tsx", import.meta.url),
      "utf8",
    );
    const runtimePanel = await readFile(
      new URL("../src/dev/DevStudio/RuntimePanel.tsx", import.meta.url),
      "utf8",
    );
    const runtimePanelView = await readFile(
      new URL("../src/dev/DevStudio/RuntimePanelView.tsx", import.meta.url),
      "utf8",
    );

    expect(app).toContain("DevStudio");
    expect(app).toContain("import.meta.env.DEV");
    expect(app).not.toContain("AssistantUiRuntimeDebugOverlay");
    expect(devStudio).toContain("useMockScenarioAutorun");
    expect(runtimePanel).toContain("useAgentRuntimeSnapshot");
    expect(runtimePanel).toContain("useAssistantUiRuntimeObservation");
    expect(runtimePanelView).toContain("Raw Snapshot");
    expect(runtimePanelView).toContain("assistantUiObservation");
  });
});
