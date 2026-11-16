// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AgentUIPluginPlacementGuide } from "../src/commands/types.js";
import { CreatorPluginPlacementNotice, parsePluginPlacementGuide } from "../src/ui/commands/CreatorPluginPlacementNotice.js";
import { CreatorLocaleProvider } from "../src/ui/i18n/locale.js";

const guide: AgentUIPluginPlacementGuide = {
  modelPath: "界面 src/app-ui/app-ui.json", pluginId: "tool-fallback",
  target: { parentPluginId: "conversation-surface", slot: "toolFallback", cardinality: "one" },
  example: JSON.stringify({ pluginId: "conversation-surface", slots: { toolFallback: [{ id: "tool-fallback-main", pluginId: "tool-fallback", enabled: true }] } }, null, 2),
};

it.each(["zh-CN", "en-US"] as const)("%s identifies the Plugin and actual file, with a partial example and single-Slot caution", locale => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CreatorLocaleProvider locale={locale}>
    <CreatorPluginPlacementNotice pluginId="tool-fallback" pluginName="查看工具调用详情" guide={guide} />
  </CreatorLocaleProvider>);
  const text = container.textContent ?? "";
  for (const value of ["查看工具调用详情", "tool-fallback", guide.modelPath, "conversation-surface", "toolFallback"]) expect(text).toContain(value);
  expect(text).toContain(locale === "zh-CN" ? "不要同时保留两项" : "do not keep both entries");
  expect(text).toContain(locale === "zh-CN" ? "不要用示例替换整个文件" : "do not replace the entire file");
  expect(text).toContain("/sync");
  const example: unknown = JSON.parse(container.querySelector("pre code")!.textContent!);
  expect(example).toEqual(JSON.parse(guide.example) as unknown);
});

it("restores the guide from saved activity and rejects an invalid Slot cardinality", () => {
  expect(parsePluginPlacementGuide(JSON.parse(JSON.stringify(guide)) as unknown)).toEqual(guide);
  expect(parsePluginPlacementGuide({ ...guide, target: { ...guide.target, cardinality: "invalid" } })).toBeUndefined();
  expect(parsePluginPlacementGuide({ pluginId: "tool-fallback" })).toBeUndefined();
});
