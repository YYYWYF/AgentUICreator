import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("delivers a readable project theme contract matching the installed theme vocabulary", async () => {
  const plugins = new URL("../../plugins/", import.meta.url);
  const read = (relative: string) => readFile(fileURLToPath(new URL(relative, plugins)), "utf8");
  const [contract, css, itemText, stylesheet, presets] = await Promise.all([
    read("resources/registry/items/foundation/core-adapters/files/agent-ui/theme/theme-customization.md"),
    read("src/theme/agent-ui-violet-theme.css"),
    read("resources/registry/items/foundation/core-adapters/item.json"),
    read("resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/styles.css"),
    read("src/theme/theme-contract.ts"),
  ]);
  for (const token of new Set(contract.match(/--[a-z-]+/g))) {
    expect(css, token).toContain(`${token}:`);
  }
  expect(css).toContain(':is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"]');
  expect(stylesheet).toContain("../theme/theme-customization.md");
  expect(JSON.parse(itemText).files).toContainEqual({
    source: "files/agent-ui/theme/theme-customization.md", target: "agent-ui/theme/theme-customization.md",
  });
  for (const preset of ["light", "dark", "violet"]) expect(presets).toContain(`${preset}:`);
});
