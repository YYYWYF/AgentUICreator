import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentPlan } from "../src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const brandPath = "../src/theme/agent-ui-violet-brand.css";
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

  it("preserves the official snapshot and derives only brand/interaction semantics", async () => {
    const palette = await read("../src/theme/shadcn-theme-presets.css");
    expect(createHash("sha256").update(palette).digest("hex")).toBe("043b9d8151206467e643045abdcb1d215810bf5ab6eac8a640312e342aa710f5");
    const brand = await read(brandPath);
    expect(brand).not.toMatch(/#[\da-f]+|(?:oklch|rgb)\(\s*[\d.]/iu);
    expect(brand).not.toMatch(/--(?:background|foreground|card|card-foreground|primary|destructive|success|warning)\s*:/u);
    for (const rule of rules(brand)) {
      expect(rule[2]).toContain("var(--primary)");
      expect(rule[2]).toContain("var(--background)");
    }
  });

  it("imports the brand after the palette and compatibility last", async () => {
    const css = await read("../src/styles.css");
    const imports = [...css.matchAll(/@import "\.\/theme\/([^";]+)";/gu)].map(match => match[1]);
    expect(imports).toEqual(["shadcn-theme-presets.css", "agent-ui-theme-extensions.css", "agent-ui-violet-brand.css", "assistant-ui-theme-overrides.css"]);
  });

  it("keeps the Composer on solid card with semantic border/focus and no gradient", async () => {
    const css = await read(overridesPath);
    const shell = rules(css).find(rule => rule[1]!.trim().endsWith('[data-slot="aui_composer-shell"]'))!;
    expect(shell[2]).toContain("background: var(--card);");
    expect(shell[2]).toContain("background-image: none;");
    expect(shell[2]).toContain("border-color: var(--input);");
    expect(css).toContain("border-color: var(--ring);");
    expect(css).not.toContain("gradient");
  });

  it("keeps Thread selection token-driven without markers or brittle selectors", async () => {
    const css = await read(overridesPath);
    expect(css).not.toMatch(/:nth-|:first-child|:last-child|::before|::after|\.bg-|\.text-|\bsvg\b|aui_thread-list/u);
    const thread = await read("../src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx");
    expect(thread).toContain('data-slot="aui_thread-list-item"');
    expect(thread).toContain("data-active:bg-muted");
    expect(await read(brandPath)).toContain("--muted: var(--agent-brand-surface);");
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
    expect(progressRules[1]![2]).toContain("var(--primary)");
  });
});
