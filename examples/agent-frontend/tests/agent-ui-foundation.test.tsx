// @vitest-environment jsdom

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AgentUIRoot, type AgentUITheme } from "../agent-ui/foundation/AgentUIRoot";
import { Dialog } from "../agent-ui/primitives/dialog";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryRoot = path.resolve(projectRoot, "../../packages/source-registry/registry");
const mountedRoots: Root[] = [];

async function collectCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectCssFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : [];
  }));
  return nested.flat().sort();
}

async function renderOpenDialog(theme: AgentUITheme = "light") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot theme={theme}>
        <Dialog trigger="Open settings" title="Settings" description="Dialog description">
          Dialog content
        </Dialog>
      </AgentUIRoot>,
    );
  });
  const trigger = container.querySelector("button");
  expect(trigger).toBeInstanceOf(HTMLButtonElement);
  (trigger as HTMLButtonElement).focus();
  await act(async () => {
    (trigger as HTMLButtonElement).click();
  });
  const portalHost = container.querySelector("[data-agent-ui-portal-host]");
  const dialog = portalHost?.querySelector('[role="dialog"]');
  expect(portalHost).toBeInstanceOf(HTMLElement);
  expect(dialog).toBeInstanceOf(HTMLElement);
  return {
    container,
    dialog: dialog as HTMLElement,
    portalHost: portalHost as HTMLElement,
    trigger: trigger as HTMLButtonElement,
  };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("Agent UI foundation isolation", () => {
  it("keeps every distributable Registry CSS file scoped and variables namespaced", async () => {
    const cssPaths = await collectCssFiles(registryRoot);
    expect(cssPaths.length).toBeGreaterThan(0);
    for (const cssPath of cssPaths) {
      const source = (await readFile(cssPath, "utf8")).replace(/\/\*[\s\S]*?\*\//gu, "");
      for (const rule of source.matchAll(/([^{}]+)\{/gu)) {
        const selectorList = rule[1]?.trim() ?? "";
        if (selectorList.startsWith("@")) continue;
        for (const selector of selectorList.split(",").map((value) => value.trim())) {
          expect(selector, cssPath).not.toMatch(/:root\b/u);
          expect(selector, cssPath).not.toMatch(
            /(^|[\s>+~])(html|body|button|input|textarea|select)(?![a-z0-9_-])/iu,
          );
          expect(selector, cssPath).not.toMatch(/^\*(?=$|::?|\[)/u);
        }
      }
      for (const declaration of source.matchAll(/--([a-z0-9-]+)\s*:/gu)) {
        expect(declaration[1], cssPath).toMatch(/^aui-/u);
      }
    }
  });

  it("renders the Dialog portal inside the root-owned portal host", async () => {
    const { dialog, portalHost } = await renderOpenDialog();
    expect(portalHost.contains(dialog)).toBe(true);
    expect(dialog.closest("[data-agent-ui-portal-host]")).toBe(portalHost);
    expect([...document.body.children].some((element) => element === dialog)).toBe(false);
  });

  it("closes the Dialog on Escape", async () => {
    const { dialog, portalHost } = await renderOpenDialog();
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(portalHost.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves focus into the Dialog and restores it to the trigger", async () => {
    const { dialog, portalHost, trigger } = await renderOpenDialog();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(portalHost.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps a dark Portal Dialog inside the themed token scope", async () => {
    const { dialog, portalHost } = await renderOpenDialog("dark");
    const themedRoot = portalHost.closest(
      '[data-agent-ui-root][data-agent-ui-theme="dark"]',
    );
    expect(themedRoot).toBeInstanceOf(HTMLElement);
    expect(dialog.closest("[data-agent-ui-root]")).toBe(themedRoot);
    expect(getComputedStyle(themedRoot as HTMLElement).getPropertyValue("--aui-bg")).not.toBe("");
  });
});
