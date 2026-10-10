import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

// Selector matching is deterministic here; browser geometry and visual parity
// remain a separate acceptance step.
describe("element-owned Agent UI style baseline", () => {
  it.each(["agent-ui-root", "agent-ui-conversation"])("does not reset business descendants in %s", async (rootClass) => {
    const css = (await source("preflight.scoped.css")).replace(/\/\*[\s\S]*?\*\//gu, "");
    const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/gu)].map(match => match[1]!.trim());
    const shield = await source("styles.css");
    const shieldSelectors = [...shield.matchAll(/([^{}]+)\{\s*(?:box-sizing|display): revert-layer;/gu)].map(match => match[1]!.trim().replace(/\/\*[\s\S]*?\*\//gu, ""));
    const dom = new JSDOM(`<div class="${rootClass}">
      <div class="aui-message"><div class="app-ui-plugin-instance">
        <input data-slot="input"><button data-slot="button">Business</button>
        <h1>Title</h1><ul><li>Item</li></ul><img><svg></svg>
        <div data-slot="dialog-content"><textarea></textarea></div>
      </div></div>
      <input data-agent-ui-owned><button class="aui-composer-send">Send</button>
      <button data-slot="button" class="group/button">Primitive</button>
      <div data-agent-ui-owned data-slot="aui_thread-list-item">
        <button data-agent-ui-owned data-slot="aui_thread-list-item-trigger">Thread</button>
        <div class="app-ui-plugin-instance"><input data-slot="input"><button data-slot="button">Nested business</button></div>
      </div>
    </div>`);
    try {
      const business = dom.window.document.querySelectorAll(".app-ui-plugin-instance, .app-ui-plugin-instance *");
      for (const element of business) {
        for (const selector of [...selectors, ...shieldSelectors]) {
          expect(element.matches(selector), `${element.outerHTML}: ${selector}`).toBe(false);
        }
      }
      for (const element of dom.window.document.querySelectorAll("[data-agent-ui-owned], .aui-composer-send, .group\\/button")) {
        expect(selectors.some(selector => element.matches(selector)), element.outerHTML).toBe(true);
      }
    } finally {
      dom.window.close();
    }
  });
});
