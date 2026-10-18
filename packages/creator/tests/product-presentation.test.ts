import { describe, expect, it } from "vitest";
import { creatorDisplayText, creatorDisplayValue } from "../src/ui/product-presentation.js";
import { enUS } from "../src/ui/i18n/en-US.js";
import { zhCN } from "../src/ui/i18n/zh-CN.js";

describe("Creator product presentation", () => {
  it("projects legacy tool details without changing authoritative values", () => {
    const original = { id: "assistant-ui-legacy-activity", arguments: '{"pluginId":"composer"}', result: { path: "plugins/reasoning/index.tsx", error: "Assistant UI failed: E_RENDER" } };
    const shown = creatorDisplayValue(original);
    expect(JSON.stringify({ arguments: shown.arguments, result: shown.result })).not.toMatch(/assistant[\s_-]?ui/i);
    expect(shown.id).toBe(original.id);
    expect(shown.arguments).toContain("composer");
    expect(shown.result.error).toContain("E_RENDER");
    expect(original.arguments).toContain("composer");
    expect(original.result.path).toContain("reasoning");
  });

  it("projects accumulated streaming text and removes internal upstream links", () => {
    const prefix = "底层使用 assistant-";
    expect(creatorDisplayText(prefix + "ui Conversation Runtime")).toBe("底层使用 Agent UI Conversation Runtime");
    expect(creatorDisplayText("[assistant-ui](https://www.assistant-ui.com/docs)" )).toBe("Agent UI");
  });

  it("keeps both locale catalogs free of upstream branding", () => {
    expect(JSON.stringify([enUS, zhCN])).not.toMatch(/assistant[\s_-]?ui/i);
  });
});
