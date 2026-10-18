import { parseUIPluginManifest } from "../../../operator/src/framework/contracts/ui-plugin";
import { describe, expect, it } from "vitest";
import { officialPackagePlugins } from "../../src/catalog/package-plugins";

import { pluginCapabilityCatalog } from "../../resources/registry/items/foundation-core/files/plugins/index";

describe("UI plugin identity", () => {
  it("requires default placement and matching semantics for official Creator-addable visual Plugins", () => {
    for (const pluginId of [
      "conversation-suggestions",
      "conversation-thread-list",
      "theme-switch",
    ]) {
      const raw = officialPackagePlugins.find(plugin => plugin.pluginId === pluginId)?.manifest;
      const manifest = raw && parseUIPluginManifest(raw);
      expect(manifest?.name).toBeTruthy();
      expect(manifest?.description).toBeTruthy();
      expect(manifest?.authoring?.intents.length).toBeGreaterThan(0);
      expect(manifest?.authoring?.visualRole).toBeTruthy();
      expect(manifest?.authoring?.defaultPlacement).toBeDefined();
    }
  });

  it("keeps the generated capability catalog on the canonical plugin set", () => {
    const ids = pluginCapabilityCatalog.list().map(({ manifest }) => manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["composer", "response-footer", "conversation-surface"]));
    expect(ids.every(id => !id.startsWith("assistant-ui-") && id !== "message-footer")).toBe(true);
  });
});
