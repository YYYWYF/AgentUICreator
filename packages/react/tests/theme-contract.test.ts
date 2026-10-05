import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AGENT_UI_THEME_PRESETS, getAgentUIThemeColorScheme, isAgentUITheme } from "../src/theme/theme-contract";

// Upstream semantic vocabulary; update deliberately when syncing shadcn.
const requiredTokens = [
  "radius", "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "sidebar", "sidebar-foreground",
  "sidebar-primary", "sidebar-primary-foreground", "sidebar-accent", "sidebar-accent-foreground",
  "sidebar-border", "sidebar-ring",
].sort();
const paletteUrl = new URL("../src/theme/shadcn-theme-presets.css", import.meta.url);
const extensionUrl = new URL("../src/theme/agent-ui-theme-extensions.css", import.meta.url);

describe("official theme contract", () => {
  it("keeps CSS and preset registry in parity with the complete upstream vocabulary", async () => {
    const css = await readFile(paletteUrl, "utf8");
    const blocks = [...css.matchAll(/:is\(\.agent-ui-root, \.agent-ui-conversation\)\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/gu)];
    expect(blocks.map((block) => block[1])).toEqual(Object.keys(AGENT_UI_THEME_PRESETS));
    for (const block of blocks) {
      const tokens = [...block[2]!.matchAll(/--([\w-]+):/gu)].map((token) => token[1]).sort();
      expect(tokens, block[1]).toEqual(requiredTokens);
      expect(block[2]).toContain(`color-scheme: ${getAgentUIThemeColorScheme(block[1] as keyof typeof AGENT_UI_THEME_PRESETS)}`);
    }
  });

  it("distinguishes presets from color schemes and rejects inherited property names", () => {
    expect(AGENT_UI_THEME_PRESETS).toEqual({ light: { colorScheme: "light" }, dark: { colorScheme: "dark" }, violet: { colorScheme: "light" } });
    for (const value of [undefined, null, "invalid", "toString", "__proto__"]) expect(isAgentUITheme(value)).toBe(false);
  });

  it("keeps palette and extension declarations scoped and aliases in one shared layer", async () => {
    const [palette, extension] = await Promise.all([readFile(paletteUrl, "utf8"), readFile(extensionUrl, "utf8")]);
    for (const css of [palette, extension]) {
      const clean = css.replace(/\/\*[\s\S]*?\*\//gu, "");
      for (const block of clean.matchAll(/([^{}]+)\{[^}]+\}/gu)) expect(block[1]!.trim()).toMatch(/^:is\(\.agent-ui-root, \.agent-ui-conversation\)\[data-/u);
      expect(clean).not.toMatch(/:root|\bbody\b/u);
    }
    expect(palette).not.toContain("--aui-");
    for (const token of ["success", "warning", "overlay"]) {
      expect(extension).toContain(`--aui-${token}: var(--${token});`);
      expect(extension.match(new RegExp(`--aui-${token}:`, "gu"))).toHaveLength(1);
    }
  });
});
