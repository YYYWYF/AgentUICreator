import { describe, expect, it } from "vitest";

import { pluginCapabilityCatalog } from "../plugins";

describe("UI plugin identity", () => {
  it("requires default placement and matching semantics for official Creator-addable visual Plugins", () => {
    for (const pluginId of [
      "conversation-suggestions",
      "conversation-thread-list",
      "theme-switch",
    ]) {
      const manifest = pluginCapabilityCatalog.list().find(({ manifest }) => manifest.id === pluginId)?.manifest;
      expect(manifest?.name).toBeTruthy();
      expect(manifest?.description).toBeTruthy();
      expect(manifest?.authoring?.intents.length).toBeGreaterThan(0);
      expect(manifest?.authoring?.visualRole).toBeTruthy();
      expect(manifest?.authoring?.defaultPlacement).toBeDefined();
    }
  });

  it("keeps the generated capability catalog on the canonical plugin set", () => {
    expect(pluginCapabilityCatalog.list().map(({ manifest }) => manifest.id)).toEqual([
      "assistant-ui-copy-action",
      "assistant-ui-export-markdown-action",
      "assistant-ui-message-footer",
      "assistant-ui-reasoning",
      "assistant-ui-reload-action",
      "assistant-ui-tool-fallback",
      "assistant-ui-tool-group",
      "conversation-data-source",
      "conversation-service",
      "conversation-suggestions",
      "conversation-surface",
      "conversation-thread-list",
      "locale-provider",
      "theme-provider",
      "theme-switch",
    ]);
  });
});
