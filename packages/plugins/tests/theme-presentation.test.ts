import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compactPath = "resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/compact.css";
const read = (file: string) => readFile(path.join(root, file), "utf8");
const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/([^{}]+)\{([^{}]+)\}/gu)]
  .map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));

function fixture(theme: string) {
  return new JSDOM(`<main data-theme="${theme}"><button data-slot="aui_composer-shell"></button></main>
    <div class="agent-ui-root" data-theme="${theme}" data-color-scheme="${theme === "dark" ? "dark" : "light"}">
      <div class="agent-ui-assistant-shell"><div class="agent-ui-assistant-panel">
        <div class="agent-ui-conversation" data-theme="${theme}" data-color-scheme="${theme === "dark" ? "dark" : "light"}">
          <div data-slot="aui_composer-shell"></div><div data-slot="aui_user-message-content"></div>
          <div data-slot="tool-fallback-root"></div><button class="conversation-suggestion"></button>
        </div>
      </div></div>
    </div>`);
}

function tokensFor(element: Element, css: string) {
  const tokens = new Map<string, string>();
  for (const rule of rules(css)) {
    if (!element.matches(rule.selector)) continue;
    for (const [, name, value] of rule.body.matchAll(/(--[\w-]+):\s*([^;{}]+);/gu)) tokens.set(name!, value!.trim());
  }
  return tokens;
}

function resolveToken(name: string, tokens: Map<string, string>, chain: string[] = []): string {
  expect(chain, `Cyclic palette token ${name}`).not.toContain(name);
  const value = tokens.get(name);
  expect(value, `Missing palette token ${name}`).toBeDefined();
  return value!.replace(/var\((--[\w-]+)\)/gu, (_, dependency: string) => resolveToken(dependency, tokens, [...chain, name]));
}

describe("custom presentation in all theme presets", () => {
  it("resolves every product paint token on outer and conversation roots without leaking Violet colors", async () => {
    const [palette, extensions, violet, presentation, compact] = await Promise.all([
      read("src/theme/shadcn-theme-presets.css"), read("src/theme/agent-ui-theme-extensions.css"),
      read("src/theme/agent-ui-violet-theme.css"), read("src/theme/assistant-ui-theme-overrides.css"), read(compactPath),
    ]);
    const css = [palette, extensions, violet, compact].join("\n");
    const consumed = [...new Set([...`${presentation}\n${compact}`.matchAll(/var\((--agent-(?:brand|composer|error|compact)[\w-]*)\)/gu)].map(match => match[1]!))];
    expect(consumed.length).toBeGreaterThan(20);
    for (const theme of ["light", "dark", "violet"]) {
      const dom = fixture(theme);
      try {
        for (const element of dom.window.document.querySelectorAll(".agent-ui-root, .agent-ui-conversation")) {
          const tokens = tokensFor(element, css);
          for (const name of consumed) {
            const resolved = resolveToken(name, tokens);
            expect(resolved).not.toContain("var(");
            if (theme !== "violet") expect(resolved).not.toMatch(/#(?:866dfd|7863d8|6850cb|f1edfc|f5f1ff)/iu);
          }
          if (theme === "violet") expect(resolveToken("--agent-compact-identity-background", tokens)).toBe("#f1edfc");
          else expect(resolveToken("--agent-brand-solid", tokens)).toBe(resolveToken("--primary", tokens));
        }
      } finally { dom.window.close(); }
    }
  });

  it("retains Composer, message and tool geometry in all presets and excludes the Host", async () => {
    const [presentation, compact] = await Promise.all([read("src/theme/assistant-ui-theme-overrides.css"), read(compactPath)]);
    const shared = rules(presentation);
    const layoutRules = [
      ["[data-slot=\"aui_composer-shell\"]", "min-height: 112px;"],
      ["[data-slot=\"aui_user-message-content\"]", "padding: 10px 14px;"],
      ["[data-slot=\"tool-fallback-root\"]", "padding: 0.25rem 0.5rem;"],
    ];
    for (const theme of ["light", "dark", "violet"]) {
      const dom = fixture(theme);
      try {
        for (const [target, geometry] of layoutRules) {
          const rule = shared.find(rule => rule.selector.endsWith(target!))!;
          expect(rule.body).toContain(geometry);
          expect(dom.window.document.querySelector(`.agent-ui-root ${target}`)!.matches(rule.selector)).toBe(true);
          expect(dom.window.document.querySelector(`main ${target}`)?.matches(rule.selector) ?? false).toBe(false);
        }
        const card = rules(compact).find(rule => rule.selector.endsWith(" .conversation-suggestion"))!;
        expect(card.body).toContain("grid-template-columns: 32px minmax(0, 1fr) 12px;");
        expect(card.body).toContain("border-radius: 14px;");
        expect(card.body).toContain("background: var(--card);");
        expect(dom.window.document.querySelector(".conversation-suggestion")!.matches(card.selector)).toBe(true);
      } finally { dom.window.close(); }
    }
  });
});
