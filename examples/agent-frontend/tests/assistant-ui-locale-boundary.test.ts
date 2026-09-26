import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pluginCapabilityCatalog } from "../plugins";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPluginIds = [
  "assistant-ui-copy-action",
  "assistant-ui-reload-action",
  "assistant-ui-export-markdown-action",
  "assistant-ui-response-footer",
  "assistant-ui-composer",
  "assistant-ui-add-attachment-action",
  "assistant-ui-dictation-action",
  "assistant-ui-submit-action",
] as const;

describe("assistant-ui canonical localization boundary", () => {
  it("keeps canonical Plugins independent from AgentUICreator LocaleService", async () => {
    const sources = await Promise.all(
      canonicalPluginIds.flatMap(async (pluginId) => [
        await readFile(path.join(projectRoot, "plugins", pluginId, "definition.ts"), "utf8"),
        await readFile(path.join(projectRoot, "plugins", pluginId, "index.tsx"), "utf8"),
      ]),
    );

    for (const source of sources.flat()) {
      expect(source).not.toContain("useAgentUILocale");
      expect(source).not.toContain("AGENT_UI_LOCALE_SERVICE");
      expect(source).not.toContain("agent-ui.locale");
    }
  });

  it("keeps generated canonical capability entries free from locale injection", () => {
    for (const pluginId of canonicalPluginIds) {
      const entry = pluginCapabilityCatalog.get(pluginId);
      expect(entry, pluginId).toBeDefined();
      expect(entry?.optionalInject, pluginId).toEqual([]);
    }
  });
});
