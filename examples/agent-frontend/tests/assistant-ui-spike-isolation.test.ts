import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseAppUIModelJson,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  applyAssistantUiSpikeMode,
  ASSISTANT_UI_ADAPTED_PRESENTATION_INSTANCE_IDS,
  ASSISTANT_UI_NATIVE_PRESENTATION_INSTANCE_IDS,
  ASSISTANT_UI_SPIKE_INSTANCE_ID,
  ASSISTANT_UI_THREAD_LIST_INSTANCE_ID,
  CONVERSATION_SURFACE_INSTANCE_ID,
  LEGACY_CONVERSATION_LIST_INSTANCE_ID,
  isAssistantUiSpikeRequested,
} from "../src/spikes/assistant-ui/spike-mode";

const STRUCTURAL_HOST_INSTANCE_IDS = [
  "agent-messages-main",
  "agent-tool-activity-main",
] as const;

const DEFERRED_PRESENTATION_INSTANCE_IDS = [
  "agent-message-sources-main",
] as const;

async function readModel() {
  return parseAppUIModelJson(
    await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"),
  );
}

function expectInstancesEnabled(
  model: AppUIModel,
  instanceIds: readonly string[],
  enabled: boolean,
): void {
  for (const instanceId of instanceIds) {
    expect(model.pluginInstances[instanceId]?.enabled).toBe(enabled);
  }
}

describe("assistant-ui Spike isolation", () => {
  it("keeps the current conversation surface active in normal mode", async () => {
    const model = await readModel();
    const normal = applyAssistantUiSpikeMode(model, false);

    expect(normal).toBe(model);
    expect(
      normal.pluginInstances[CONVERSATION_SURFACE_INSTANCE_ID]?.enabled,
    ).toBe(true);
    expect(
      normal.pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID]?.enabled,
    ).toBe(false);
    expect(
      normal.pluginInstances[LEGACY_CONVERSATION_LIST_INSTANCE_ID]?.enabled,
    ).toBe(true);
    expect(
      normal.pluginInstances[ASSISTANT_UI_THREAD_LIST_INSTANCE_ID]?.enabled,
    ).toBe(false);
    expectInstancesEnabled(
      normal,
      ASSISTANT_UI_NATIVE_PRESENTATION_INSTANCE_IDS,
      true,
    );
    expectInstancesEnabled(
      normal,
      ASSISTANT_UI_ADAPTED_PRESENTATION_INSTANCE_IDS,
      true,
    );
  });

  it("keeps conversation-surface as the product host in Spike mode", async () => {
    const spike = applyAssistantUiSpikeMode(await readModel(), true);

    expect(
      spike.pluginInstances[CONVERSATION_SURFACE_INSTANCE_ID]?.enabled,
    ).toBe(true);
    expect(
      spike.pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID],
    ).toMatchObject({
      pluginId: "assistant-ui-conversation-spike",
      enabled: false,
      mount: { slotId: "workspace.conversation" },
    });
    expect(
      spike.pluginInstances[LEGACY_CONVERSATION_LIST_INSTANCE_ID]?.enabled,
    ).toBe(false);
    expect(
      spike.pluginInstances[ASSISTANT_UI_THREAD_LIST_INSTANCE_ID]?.enabled,
    ).toBe(true);
    expectInstancesEnabled(
      spike,
      ASSISTANT_UI_NATIVE_PRESENTATION_INSTANCE_IDS,
      false,
    );
    expectInstancesEnabled(
      spike,
      ASSISTANT_UI_ADAPTED_PRESENTATION_INSTANCE_IDS,
      false,
    );
    expectInstancesEnabled(spike, STRUCTURAL_HOST_INSTANCE_IDS, true);
    expectInstancesEnabled(spike, DEFERRED_PRESENTATION_INSTANCE_IDS, true);
  });

  it("only enables the development switch for the exact value 1", () => {
    expect(isAssistantUiSpikeRequested("?assistantUiSpike=1")).toBe(true);
    expect(isAssistantUiSpikeRequested("?assistantUiSpike=true")).toBe(false);
    expect(isAssistantUiSpikeRequested("?mockScenario=reasoning-chat")).toBe(
      false,
    );
  });

  it("constructs legacy and assistant-ui wire owners only inside exclusive boundaries", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const modulePrefix = app.slice(0, app.indexOf("function LegacyRuntimeBoundary"));
    expect(modulePrefix).not.toMatch(/createAgUiTransport\s*\(/u);
    expect(modulePrefix).not.toMatch(/createAgentRuntime\s*\(/u);
    expect(app).toContain("function LegacyRuntimeBoundary");
    expect(app).toContain("function AssistantUiRuntimeBoundary");
    expect(app).toContain("<AssistantUiAgUiRuntimeProvider");
    expect(app.match(/createAgUiTransport\s*\(/gu)).toHaveLength(1);
    expect(app.match(/<AssistantUiAgUiRuntimeProvider/gu)).toHaveLength(1);
    await expect(stat(
      path.join(projectRoot, "src/spikes/assistant-ui/AssistantUiRuntimeProvider.tsx"),
    )).rejects.toMatchObject({ code: "ENOENT" });
  });
});
