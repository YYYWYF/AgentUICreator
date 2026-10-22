import { generatedProjectFixture, repositoryRoot } from "../../../operator/control/tests/support/generated-project";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pluginCapabilityCatalog } from "../../resources/registry/items/foundation/core/files/plugins/index";

const projectRoot = await generatedProjectFixture();
const productLocalePlugins = new Set(["export-markdown-action", "composer", "submit-action"]);
const canonicalPluginIds = [
  "copy-action",
  "reload-action",
  "export-markdown-action",
  "response-footer",
  "composer",
  "add-attachment-action",
  "dictation-action",
  "submit-action",
] as const;

describe("assistant-ui canonical localization boundary", () => {
  it("keeps locale ownership in public composition or explicitly declared product Plugins", async () => {
    for (const pluginId of canonicalPluginIds) {
      const [definition, component] = await Promise.all([readFile(path.join(projectRoot, "plugins", pluginId, "definition.ts"), "utf8"), readFile(path.join(projectRoot, "plugins", pluginId, "index.tsx"), "utf8")]);
      if (productLocalePlugins.has(pluginId)) {
        expect(definition).toContain("optionalInject: [AGENT_UI_LOCALE_SERVICE]");
        if (pluginId === "submit-action") {
          const presentation = await readFile(path.join(repositoryRoot, "packages/plugins/src/plugins/submit-action/adapters/presentation/submit-action.tsx"), "utf8");
          expect(component).toContain("ConversationComposerSend");
          expect(presentation).toContain('useAgentUILocale("composer")');
        } else expect(component).toContain("useAgentUILocale");
      } else {
        expect(definition + component).not.toContain("useAgentUILocale");
        expect(definition + component).not.toContain("AGENT_UI_LOCALE_SERVICE");
      }
      expect(component).not.toMatch(/locale\s*===|zh-CN|en-US/);
    }
  });

  it("declares locale consumption only for product composition that needs it", () => {
    for (const pluginId of canonicalPluginIds) {
      const entry = pluginCapabilityCatalog.get(pluginId);
      expect(entry, pluginId).toBeDefined();
      expect(entry?.optionalInject, pluginId).toEqual(productLocalePlugins.has(pluginId) ? ["agent-ui.locale"] : []);
    }
  });
});
