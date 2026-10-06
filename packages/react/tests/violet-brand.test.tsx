import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentPlan } from "../src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan";

const read = (relative: string) => readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), relative), "utf8");
const brandPath = "../src/theme/agent-ui-violet-theme.css";
const overridesPath = "../src/theme/assistant-ui-theme-overrides.css";
const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{([^{}]+)\}/gu)];

describe("Adaptable Violet brand boundary", () => {
  it("scopes every rule to Violet Agent UI boundaries, excluding host and light/dark", async () => {
    const dom = new JSDOM(`<main data-theme="violet"><div data-slot="aui_composer-shell"></div></main>
      <section class="agent-ui-root" data-theme="light"><div data-slot="aui_composer-shell"></div></section>
      <section class="agent-ui-root" data-theme="dark"><div data-slot="aui_composer-shell"></div></section>`);
    for (const path of [brandPath, overridesPath]) {
      const css = await read(path);
      for (const rule of rules(css)) {
        const selector = rule[1]!.trim();
        expect(selector).toMatch(/^:is\(\.agent-ui-root, \.agent-ui-conversation\)\[data-theme="violet"\]/u);
        expect(dom.window.document.querySelectorAll(selector)).toHaveLength(0);
      }
      expect(css).not.toMatch(/:root|\bbody\b|\bhtml\b/u);
    }
  });

  it("preserves only Light/Dark upstream snapshots and derives Violet from one cold seed", async () => {
    const palette = await read("../src/theme/shadcn-theme-presets.css");
    expect(createHash("sha256").update(palette).digest("hex")).toBe("b00390364b91b675c6d8144b8588592dc766b493d2cc1737bd8d4043bfab4f4b");
    expect(palette).not.toContain('[data-theme="violet"]');
    const brand = await read(brandPath);
    expect(brand).toContain("--agent-brand: oklch(0.567945 0.208743 287.302866);");
    expect(brand).toContain("--primary: var(--agent-brand-solid);");
    expect(brand).not.toContain("var(--primary)");
    for (const state of ["solid", "subtle", "surface", "hover", "selected", "border", "hover-border", "focus-border", "focus-ring", "active"]) {
      expect(brand).toContain(`--agent-brand-${state}:`);
    }
    expect(brand).toContain("--background: oklch(1 0 0);");
    expect(brand).toContain("--card: oklch(1 0 0);");
    expect(brand).toContain("--sidebar: var(--background);");
    expect(brand).toContain("--secondary: var(--background);");
    expect(brand).toContain("--input: var(--border);");
    expect(brand).toContain("--accent: var(--muted);");
    expect(brand).toContain("--ring: var(--agent-brand-focus-border);");
  });

  it("imports the brand after the palette and Composer styles after compatibility", async () => {
    const css = await read("../src/styles.css");
    const imports = [...css.matchAll(/@import "\.\/theme\/([^";]+)";/gu)].map(match => match[1]);
    expect(imports).toEqual(["shadcn-theme-presets.css", "agent-ui-theme-extensions.css", "agent-ui-violet-theme.css", "assistant-ui-theme-overrides.css", "composer-lexical.css"]);
  });

  it("keeps the Composer on solid card with semantic border/focus and no gradient", async () => {
    const css = await read(overridesPath);
    const shell = rules(css).find(rule => rule[1]!.trim().endsWith('[data-slot="aui_composer-shell"]'))!;
    expect(shell[2]).toContain("background: var(--card);");
    expect(shell[2]).toContain("background-image: none;");
    expect(shell[2]).toContain("border-color: var(--input);");
    const hover = rules(css).find(rule => rule[1]!.trim().endsWith(":hover"))!;
    const focus = rules(css).find(rule => rule[1]!.trim().endsWith(":focus-within"))!;
    expect(hover[2]).toContain("border-color: var(--agent-brand-hover-border);");
    expect(hover[2]).not.toMatch(/background|box-shadow/u);
    expect(focus[2]).toContain("border-color: var(--agent-brand-focus-border);");
    expect(focus[2]).toContain("box-shadow: 0 0 0 1px var(--agent-brand-focus-ring);");
    expect(css).not.toContain("color-mix(");
    for (const path of ["../src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx", "../src/internal/composable-thread.tsx"]) {
      expect(await read(path)).toContain('data-slot="aui_composer-shell"');
    }
    expect(css).not.toContain("gradient");
  });

  it("keeps Thread selection token-driven without markers or brittle selectors", async () => {
    const css = await read(overridesPath);
    expect(css).not.toMatch(/:nth-|:first-child|:last-child|::before|::after|\.bg-|\.text-|\bsvg\b/u);
    const thread = await read("../src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx");
    expect(thread).toContain('data-slot="aui_thread-list-item"');
    expect(thread).toContain("data-active:bg-muted");
    expect(await read(brandPath)).toContain("--muted: oklch(0.97 0 0);");
    expect(css).toContain('[data-slot="aui_thread-list-item"][data-active="true"]');
    expect(css).toContain('[data-slot="aui_user-message-content"]');
    const user = rules(css).find(rule => rule[1]!.trim().endsWith('[data-slot="aui_user-message-content"]'))!;
    const active = rules(css).find(rule => rule[1]!.trim().endsWith('[data-active="true"]'))!;
    const hover = rules(css).find(rule => rule[1]!.trim().endsWith('[data-slot="aui_thread-list-item"]:hover'))!;
    expect(user[2]).toContain("background-color: var(--agent-brand-selected);");
    expect(active[2]).toContain("background-color: var(--agent-brand-selected);");
    expect(hover[2]).toContain("background-color: var(--muted);");
    expect(css.indexOf(active[1]!.trim())).toBeGreaterThan(css.indexOf(hover[1]!.trim()));
    expect(await read("../src/internal/composable-thread.tsx")).toContain('data-slot="aui_user-message-content"');
  });

  it.each([1, 4])("colors only the progress track/fill while preserving progress at %i steps", async (activeIndex) => {
    const dom = new JSDOM(`<div class="agent-ui-root" data-theme="violet">${renderToStaticMarkup(
      <AgentPlan title="Workspace update" steps={["Inspect", "Compare", "Update", "Check"]} activeIndex={activeIndex} />,
    )}</div>`);
    const progressRules = rules(await read(overridesPath)).filter(rule => rule[1]!.includes('[role="progressbar"]'));
    expect(progressRules).toHaveLength(2);
    const track = dom.window.document.querySelector(progressRules[0]![1]!.trim())!;
    const fill = dom.window.document.querySelector(progressRules[1]![1]!.trim())!;
    expect(track.children).toHaveLength(1);
    expect(track.firstElementChild).toBe(fill);
    expect(track.getAttribute("aria-valuenow")).toBe(String(activeIndex * 25));
    expect(fill.getAttribute("style")).toContain(`width:${activeIndex * 25}%`);
    expect(progressRules[0]![2]).toContain("var(--agent-brand-subtle)");
    expect(progressRules[1]![2]).toContain("var(--agent-brand-active)");
  });
});

// WCAG 2.2 relative luminance: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
// Convert CSS OKLCH to linear sRGB before applying the luminance weights.
function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/u.exec(value);
  if (!match) throw new Error(`Unsupported contrast-test color: ${value}`);
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]) * Math.PI / 180;
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  for (const channel of rgb) {
    expect(channel).toBeGreaterThanOrEqual(-0.000001);
    expect(channel).toBeLessThanOrEqual(1.000001);
  }
  return rgb.reduce((sum, channel, index) => sum + Math.min(1, Math.max(0, channel)) * [0.2126, 0.7152, 0.0722][index]!, 0);
}

it("maintains surface < hover < selected intensity independently of muted", async () => {
  const css = await read(brandPath);
  const tint = (state: string) => {
    const weight = css.match(new RegExp(`--agent-brand-${state}: color-mix\\(in oklab, var\\(--background\\) (\\d+)%`))?.[1];
    if (!weight) throw new Error(`Missing tint: ${state}`);
    return 100 - Number(weight);
  };
  expect(tint("surface")).toBeLessThan(tint("hover"));
  expect(tint("hover")).toBeLessThan(tint("selected"));
});

it("keeps both solid primary color pairs at WCAG AA contrast while preserving the visual seed", async () => {
  const css = await read(brandPath);
  const tokens = new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/gu)].map(match => [match[1]!, match[2]!.trim()]));
  const resolve = (name: string, visited = new Set<string>()): string => {
    if (visited.has(name)) throw new Error(`Cyclic color alias: ${name}`);
    visited.add(name);
    const value = tokens.get(name);
    if (!value) throw new Error(`Missing color token: ${name}`);
    const alias = /^var\((--[\w-]+)\)$/u.exec(value);
    return alias ? resolve(alias[1]!, visited) : value;
  };
  const contrast = (background: string, foreground: string) => {
    const values = [luminance(resolve(background)), luminance(resolve(foreground))].sort((a, b) => b - a);
    return (values[0]! + 0.05) / (values[1]! + 0.05);
  };
  expect(contrast("--primary", "--primary-foreground")).toBeGreaterThanOrEqual(4.5);
  expect(contrast("--sidebar-primary", "--sidebar-primary-foreground")).toBeGreaterThanOrEqual(4.5);
  expect(contrast("--agent-brand", "--primary-foreground")).toBeGreaterThanOrEqual(4.5);
  expect(resolve("--primary")).not.toBe(resolve("--agent-brand"));
});


it("keeps the keyboard focus outline at least 3:1 against white surfaces", async () => {
  const css = await read(brandPath);
  const tokens = new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/gu)].map(match => [match[1]!, match[2]!.trim()]));
  const resolve = (name: string): string => {
    const value = tokens.get(name)!;
    const alias = /^var\((--[\w-]+)\)$/u.exec(value);
    return alias ? resolve(alias[1]!) : value;
  };
  const focus = luminance(resolve("--agent-brand-focus-border"));
  for (const surface of ["--background", "--card", "--popover"]) {
    expect((luminance(resolve(surface)) + 0.05) / (focus + 0.05)).toBeGreaterThanOrEqual(3);
  }
  const outlines = rules(await read(overridesPath)).filter(rule => rule[2]!.includes("outline: 2px solid var(--agent-brand-focus-border)"));
  expect(outlines).toHaveLength(1);
  expect(outlines[0]![1]).toContain(":focus-visible");
  expect(outlines[0]![2]).toContain("outline-offset: 2px");
});
