// @vitest-environment jsdom

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AgentUIRoot, type AgentUITheme } from "../agent-ui/foundation/AgentUIRoot";
import { Button } from "../agent-ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../agent-ui/primitives/dialog";
import { Input } from "../agent-ui/primitives/input";
import { Label } from "../agent-ui/primitives/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "../agent-ui/primitives/popover";
import { Separator } from "../agent-ui/primitives/separator";
import { Spinner } from "../agent-ui/primitives/spinner";
import { Textarea } from "../agent-ui/primitives/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../agent-ui/primitives/tooltip";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryRoot = path.resolve(projectRoot, "../../packages/source-registry/registry");
const mountedRoots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
        <Dialog>
          <DialogTrigger>Open settings</DialogTrigger>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
            Dialog content
          </DialogContent>
        </Dialog>
      </AgentUIRoot>,
    );
  });
  const trigger = container.querySelector("button");
  expect(trigger).toBeInstanceOf(HTMLButtonElement);
  (trigger as HTMLButtonElement).focus();
  await act(async () => {
    (trigger as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
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

  it("defines the public token contract and complete light/dark color themes", async () => {
    const tokens = await readFile(path.join(
      registryRoot,
      "items/foundation-core/files/styles/tokens.css",
    ), "utf8");
    const colorTokens = [
      "bg", "bg-elevated", "bg-subtle", "bg-muted", "bg-hover", "bg-active",
      "fg", "fg-muted", "fg-subtle", "fg-disabled", "fg-on-accent",
      "border", "border-strong", "accent", "accent-hover", "accent-active",
      "focus", "danger", "danger-hover", "danger-fg", "success", "warning",
      "info", "overlay",
    ];
    for (const token of colorTokens) {
      expect(tokens, token).toContain(`--aui-${token}:`);
    }
    const darkBlock = tokens.match(
      /\[data-agent-ui-root\]\[data-agent-ui-theme="dark"\]\s*\{([^}]*)\}/u,
    )?.[1] ?? "";
    for (const token of colorTokens) {
      expect(darkBlock, `dark ${token}`).toContain(`--aui-${token}:`);
    }
    for (const token of [
      "font-sans", "font-mono", "font-size-xs", "font-size-sm", "font-size-md",
      "font-size-lg", "line-height-tight", "line-height-normal",
      "font-weight-normal", "font-weight-medium", "font-weight-semibold",
      "space-1", "space-2", "space-3", "space-4", "space-5", "space-6",
      "radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-full",
      "control-height-sm", "control-height-md", "control-height-lg",
      "shadow-sm", "shadow-md", "shadow-lg", "duration-fast", "duration-normal",
      "duration-slow", "ease-standard", "ease-out",
    ]) {
      expect(tokens, token).toContain(`--aui-${token}:`);
    }
  });

  it("keeps hardcoded colors confined to the foundation token source", async () => {
    const cssPaths = await collectCssFiles(registryRoot);
    const tokenPath = path.join(
      registryRoot,
      "items/foundation-core/files/styles/tokens.css",
    );
    for (const cssPath of cssPaths.filter((entry) => entry !== tokenPath)) {
      const source = await readFile(cssPath, "utf8");
      expect(source, cssPath).not.toMatch(
        /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/iu,
      );
    }
  });

  it("forwards native primitive props, refs, and observable state", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const buttonRef = createRef<HTMLButtonElement>();
    const inputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    await act(async () => {
      root.render(
        <AgentUIRoot>
          <Button ref={buttonRef} variant="danger" size="lg" disabled>Delete</Button>
          <Label htmlFor="query" disabled>Query</Label>
          <Input ref={inputRef} id="query" name="query" aria-invalid />
          <Textarea ref={textareaRef} name="details" disabled />
          <Separator orientation="vertical" />
          <Spinner />
          <Spinner aria-label="Loading" />
        </AgentUIRoot>,
      );
    });
    expect(buttonRef.current).toMatchObject({ disabled: true, type: "button" });
    expect(buttonRef.current?.dataset).toMatchObject({
      slot: "button",
      size: "lg",
      state: "disabled",
      variant: "danger",
    });
    expect(inputRef.current).toMatchObject({ name: "query" });
    expect(inputRef.current?.dataset).toMatchObject({ slot: "input", state: "invalid" });
    expect(textareaRef.current).toMatchObject({ disabled: true, name: "details" });
    expect(textareaRef.current?.dataset).toMatchObject({ slot: "textarea", state: "disabled" });
    expect(container.querySelector('[data-slot="separator"]')?.getAttribute("aria-orientation"))
      .toBe("vertical");
    expect(container.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden"))
      .toBe("true");
    expect(container.querySelector('[data-slot="spinner"][aria-label="Loading"]')?.getAttribute("role"))
      .toBe("status");
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
    expect(themedRoot?.getAttribute("data-agent-ui-theme")).toBe("dark");
  });

  it("opens Tooltip on focus without delay inside the root portal", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <AgentUIRoot>
          <Tooltip>
            <TooltipTrigger delay={0}>Help</TooltipTrigger>
            <TooltipContent>Helpful detail</TooltipContent>
          </Tooltip>
        </AgentUIRoot>,
      );
    });
    const trigger = container.querySelector('[data-slot="tooltip-trigger"]') as HTMLElement;
    await act(async () => trigger.focus());
    const portalHost = container.querySelector("[data-agent-ui-portal-host]");
    expect(portalHost?.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain("Helpful detail");
  });

  it("opens and dismisses Popover inside the root portal with managed focus", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <AgentUIRoot>
          <Popover>
            <PopoverTrigger>Details</PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>Agent status</PopoverTitle>
              <PopoverDescription>Ready</PopoverDescription>
            </PopoverContent>
          </Popover>
        </AgentUIRoot>,
      );
    });
    const trigger = container.querySelector('[data-slot="popover-trigger"]') as HTMLButtonElement;
    trigger.focus();
    await act(async () => trigger.click());
    const portalHost = container.querySelector("[data-agent-ui-portal-host]") as HTMLElement;
    const popup = portalHost.querySelector('[data-slot="popover-content"]') as HTMLElement;
    expect(popup).toBeInstanceOf(HTMLElement);
    expect(popup.contains(document.activeElement)).toBe(true);
    await act(async () => {
      popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(portalHost.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
