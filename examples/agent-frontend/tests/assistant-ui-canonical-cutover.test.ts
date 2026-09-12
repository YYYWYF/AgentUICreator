import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyLegacyRuntimeComposition,
  resolveConversationRuntimeMode,
} from "../src/conversation-runtime-mode";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";

const LEGACY_PRESENTATION_INSTANCE_IDS = [
  "agent-welcome-main",
  "agent-prompts-main",
  "agent-sender-main",
  "agent-messages-main",
  "agent-reasoning-main",
  "agent-message-attachments-main",
  "agent-tool-activity-main",
  "agent-tool-message-main",
] as const;

async function readModel() {
  return parseAppUIModelJson(
    await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"),
  );
}

describe("assistant-ui canonical cutover", () => {
  it("uses assistant-ui by default and only opts into legacy in dev", () => {
    expect(
      resolveConversationRuntimeMode({ isDev: true, search: "" }),
    ).toBe("assistant-ui");
    expect(
      resolveConversationRuntimeMode({
        isDev: true,
        search: "?legacyRuntime=1",
      }),
    ).toBe("legacy");
    expect(
      resolveConversationRuntimeMode({
        isDev: false,
        search: "?legacyRuntime=1",
      }),
    ).toBe("assistant-ui");
  });

  it("keeps assistant-ui presentation canonical in the checked-in model", async () => {
    const model = await readModel();

    expect(model.pluginInstances["agent-conversation-surface-main"]?.enabled).toBe(
      true,
    );
    expect(model.pluginInstances["assistant-ui-thread-list-main"]?.enabled).toBe(
      true,
    );
    expect(model.pluginInstances["agent-conversations-main"]?.enabled).toBe(
      false,
    );
    expect(model.pluginInstances["agent-message-sources-main"]?.enabled).toBe(
      true,
    );

    for (const instanceId of LEGACY_PRESENTATION_INSTANCE_IDS) {
      expect(model.pluginInstances[instanceId]?.enabled, instanceId).toBe(false);
    }
  });

  it("restores the legacy composition only for the rollback mode", async () => {
    const model = await readModel();
    const rollback = applyLegacyRuntimeComposition(model, true);

    expect(rollback).not.toBe(model);
    expect(rollback.pluginInstances["agent-conversation-surface-main"]?.enabled).toBe(
      true,
    );
    expect(rollback.pluginInstances["agent-conversations-main"]?.enabled).toBe(
      true,
    );
    expect(rollback.pluginInstances["assistant-ui-thread-list-main"]?.enabled).toBe(
      false,
    );
    expect(rollback.pluginInstances["agent-message-sources-main"]?.enabled).toBe(
      true,
    );

    for (const instanceId of LEGACY_PRESENTATION_INSTANCE_IDS) {
      expect(rollback.pluginInstances[instanceId]?.enabled, instanceId).toBe(true);
    }
  });
});
