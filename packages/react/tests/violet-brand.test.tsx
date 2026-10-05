import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentPlan } from "../src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
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
    expect(brand).toContain("--agent-brand: oklch(0.585477 0.225676 281.424656);");
    expect(brand).toContain("--primary: var(--agent-brand);");
    expect(brand).not.toContain("var(--primary)");
    for (const state of ["subtle", "surface", "hover", "selected", "border", "hover-border", "focus-border", "focus-ring", "active"]) {
      expect(brand).toContain(`--agent-brand-${state}:`);
    }
    expect(brand).toContain("--background: oklch(1 0 0);");
    expect(brand).toContain("--card: oklch(1 0 0);");
    expect(brand).toContain("--accent: var(--agent-brand-hover);");
    expect(brand).toContain("--ring: var(--agent-brand-focus-border);");
  });

  it("imports the brand after the palette and compatibility last", async () => {
    const css = await read("../src/styles.css");
    const imports = [...css.matchAll(/@import "\.\/theme\/([^";]+)";/gu)].map(match => match[1]);
    expect(imports).toEqual(["shadcn-theme-presets.css", "agent-ui-theme-extensions.css", "agent-ui-violet-theme.css", "assistant-ui-theme-overrides.css"]);
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
    expect(css).not.toMatch(/:nth-|:first-child|:last-child|::before|::after|\.bg-|\.text-|\bsvg\b|aui_thread-list/u);
    const thread = await read("../src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx");
    expect(thread).toContain('data-slot="aui_thread-list-item"');
    expect(thread).toContain("data-active:bg-muted");
    expect(await read(brandPath)).toContain("--muted: var(--agent-brand-selected);");
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
