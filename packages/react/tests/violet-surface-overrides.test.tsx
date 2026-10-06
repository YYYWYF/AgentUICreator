import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReasoningRoot } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning.aui.js";
import { ConversationComposerDirectiveChip } from "../src/lexical.js";

vi.mock("@assistant-ui/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@assistant-ui/react")>(),
  useScrollLock: () => () => {},
}));

const read = (relative: string) => readFile(new URL(relative, import.meta.url), "utf8");
const cssPath = "../src/theme/assistant-ui-theme-overrides.css";
const scope = ':is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"]';
async function surfaceRules() {
  const source = await read(cssPath);
  const css = source.slice(source.indexOf("/* Phase 4A"));
  return [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{([^{}]+)\}/gu)]
    .map(match => ({ selector: match[1]!.trim(), body: match[2]! }));
}

describe("Phase 4A Violet surfaces", () => {
  it("contains only scoped stable hooks and product input classes, with no palette definitions or brittle selectors", async () => {
    const rules = await surfaceRules();
    expect(rules.length).toBeGreaterThan(10);
    const dom = new JSDOM('<main data-theme="violet"><div data-slot="reasoning-root"></div></main><section class="agent-ui-root" data-theme="light"><div data-slot="reasoning-root"></div></section><section class="agent-ui-conversation" data-theme="dark"><div data-slot="reasoning-root"></div></section>');
    for (const { selector, body } of rules) {
      expect(selector.startsWith(scope)).toBe(true);
      expect(selector).toContain("[data-slot=");
      expect(selector).not.toMatch(/:nth-|:first-child|:last-child|[>+~]|\b(?:svg|span|div)\b|\[class/u);
      const classes = selector.match(/\.[\w-]+/gu) ?? [];
      expect(classes.every(name => [".agent-ui-root", ".agent-ui-conversation", ".agent-ui-composer-lexical-input", ".agent-ui-edit-composer-lexical-input"].includes(name))).toBe(true);
      expect(body).not.toMatch(/--agent-brand[\w-]*\s*:|var\(--primary\)|color-mix|gradient/u);
      // Pseudo-elements cannot be queried as DOM elements.
      expect(dom.window.document.querySelectorAll(selector.replace("::selection", ""))).toHaveLength(0);
    }
  });

  it.each([true, false, undefined])("derives Reasoning state directly from streaming=%s without changing disclosure", streaming => {
    const dom = new JSDOM(renderToStaticMarkup(<ReasoningRoot {...(streaming === undefined ? {} : { streaming })} defaultOpen>Content</ReasoningRoot>));
    const root = dom.window.document.querySelector('[data-slot="reasoning-root"]')!;
    expect(root.getAttribute("data-agent-state")).toBe(streaming ? "running" : "idle");
    expect(root.textContent).toBe("Content");
  });

  it("keeps default ToolGroup state tied to the existing grouped part status", async () => {
    const source = await read("../src/internal/composable-thread.tsx");
    expect(source).toMatch(/<ToolGroupRoot variant="ghost"\s+data-agent-state=\{part.status.type === "running" \? "running" : "idle"\}/u);
    const rules = await surfaceRules();
    expect(rules.filter(rule => rule.selector.includes('data-slot="tool-group-root"')).every(rule => rule.selector.includes('[data-agent-state="running"]'))).toBe(true);
    expect(rules.filter(rule => rule.selector.includes('data-slot="tool-fallback-')).every(rule => !rule.selector.includes("data-agent-state"))).toBe(true);
  });

  it("adds stable Popover hooks without relying on icon classes or text", async () => {
    const source = await read("../src/internal/adapters/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx");
    for (const hook of ["category-item", "item", "item-list", "back", "empty", "icon"]) {
      expect(source).toContain(`data-slot="composer-trigger-popover-${hook}"`);
    }
    expect(source).toContain("data-[highlighted]:bg-accent");
    expect(source).toContain('<div data-slot="composer-trigger-popover-item-list" className="py-1">');
    const rules = await surfaceRules();
    const list = rules.find(rule => rule.selector.includes('data-slot="composer-trigger-popover-item-list"'))!;
    expect(list.body).toContain("padding-block: 0");
    const items = rules.find(rule => rule.selector.endsWith('[data-slot="composer-trigger-popover-category-item"])'))!;
    expect(items.body).toContain("border-radius: 0");
    const chip = new JSDOM(renderToStaticMarkup(<ConversationComposerDirectiveChip directiveId="person-1" directiveType="user" label="Person" />)).window.document.querySelector('[data-slot="composer-directive-chip"]')!;
    expect(chip.getAttribute("data-directive-id")).toBe("person-1");
    expect(chip.textContent).toBe("@Person");
  });

  it("maps complete running surfaces, full highlighted rows and chip focus to visual brand tokens", async () => {
    const rules = await surfaceRules();
    const find = (ending: string) => rules.find(rule => rule.selector.endsWith(ending))!.body;
    expect(find('[data-slot="reasoning-root"]')).toContain("background-color: var(--card)");
    for (const hook of ["reasoning-root", "tool-group-root"]) {
      expect(find(`[data-slot="${hook}"][data-agent-state="running"]`)).toContain("background-color: var(--card)");
    }
    for (const hook of ["reasoning-trigger-icon", "tool-group-trigger-loader"]) {
      expect(find(`[data-slot="${hook}"]`)).toContain("color: var(--agent-brand-active)");
    }
    const hover = rules.findIndex(rule => rule.selector.includes('data-slot="composer-trigger-popover-item"') && rule.selector.endsWith(":is(:hover, :focus-visible)"));
    const highlight = rules.findIndex(rule => rule.selector.endsWith("[data-highlighted]"));
    expect(highlight).toBeGreaterThan(hover);
    expect(rules[hover]!.body).toContain("background-color: var(--muted)");
    expect(rules[highlight]!.body).toContain("background-color: var(--agent-brand-selected)");
    expect(rules[highlight]!.body).not.toMatch(/(?:^|;)\s*color:/u);
    const dom = new JSDOM('<section class="agent-ui-root" data-theme="violet"><button data-slot="composer-trigger-popover-item" data-highlighted>Label</button><button data-slot="composer-trigger-popover-category-item" data-highlighted>Category</button></section>');
    expect(dom.window.document.querySelectorAll(rules[highlight]!.selector)).toHaveLength(2);
    expect(find('[data-slot="composer-directive-chip"]')).toContain("background: var(--agent-brand-surface)");
    expect(find('[data-slot="composer-directive-chip"]')).toContain("color: var(--agent-brand-solid)");
    expect(rules.find(rule => rule.selector.includes('data-slot="tool-fallback-args"'))!.body).toContain("background-color: var(--card)");
    const focus = find(':focus-within [data-slot="composer-directive-chip"]');
    expect(focus).toContain("background: var(--agent-brand-selected)");
    expect(focus).toContain("border-color: var(--agent-brand-focus-border)");
    expect(find('[data-slot="composer-directive-chip"]::selection')).toContain("background: var(--agent-brand-selected)");
  });

  it("keeps running ToolGroup decoration out of the box model", async () => {
    const rules = (await surfaceRules()).filter(rule => rule.selector.includes('[data-slot="tool-group-root"][data-agent-state="running"]'));
    expect(rules.length).toBeGreaterThan(0);
    for (const { body } of rules) {
      const properties = body.split(";").map(declaration => declaration.split(":")[0]!.trim()).filter(Boolean);
      // Only paint properties may vary with status; padding, borders, sizing,
      // spacing and transforms would move or resize the completed ghost group.
      expect(properties.every(property => ["background-color", "box-shadow", "border-radius", "color"].includes(property))).toBe(true);
    }
  });

  it("runs surface regression tests behind the existing upstream provenance guard in the CI gate", async () => {
    const scripts = JSON.parse(await read("../../../package.json")).scripts as Record<string, string>;
    const gate = scripts["verify:style-isolation"]!;
    const stages = gate.split(" && ");
    const upstreamStage = stages.indexOf("pnpm check:assistant-ui-upstream");
    const themeStage = stages.findIndex(stage => stage.startsWith("pnpm --filter @agent-ui/react exec vitest run ") && stage.split(" ").includes("tests/violet-surface-overrides.test.tsx"));
    expect(upstreamStage).toBeGreaterThanOrEqual(0);
    expect(themeStage).toBeGreaterThan(upstreamStage);
  });
});
