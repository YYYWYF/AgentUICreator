import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import {
  applyAssistantUiSpikeMode,
  ASSISTANT_UI_SPIKE_INSTANCE_ID,
  CONVERSATION_SURFACE_INSTANCE_ID,
  isAssistantUiSpikeRequested,
} from "../src/spikes/assistant-ui/spike-mode";

async function readModel() {
  return parseAppUIModelJson(
    await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"),
  );
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
  });

  it("selects only the assistant-ui conversation surface in Spike mode", async () => {
    const spike = applyAssistantUiSpikeMode(await readModel(), true);

    expect(
      spike.pluginInstances[CONVERSATION_SURFACE_INSTANCE_ID]?.enabled,
    ).toBe(false);
    expect(
      spike.pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID],
    ).toMatchObject({
      pluginId: "assistant-ui-conversation-spike",
      enabled: true,
      mount: { slotId: "workspace.conversation" },
    });
  });

  it("only enables the development switch for the exact value 1", () => {
    expect(isAssistantUiSpikeRequested("?assistantUiSpike=1")).toBe(true);
    expect(isAssistantUiSpikeRequested("?assistantUiSpike=true")).toBe(false);
    expect(isAssistantUiSpikeRequested("?mockScenario=reasoning-chat")).toBe(
      false,
    );
  });
});
