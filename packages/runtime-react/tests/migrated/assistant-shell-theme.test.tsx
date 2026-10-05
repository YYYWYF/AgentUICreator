import { readFile } from "node:fs/promises";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AgentUIRoot, getAgentUIThemeColorScheme } from "@agent-ui/react";
import { AssistantShell } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/mode-shell/AssistantShell";
import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";

describe("Assistant shell preset theme boundary", () => {
  it("inherits the root preset while preserving panel state and its mounted consumer", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const mounted = vi.fn();
    function Consumer() {
      useEffect(() => { mounted(); }, []);
      return <span data-shell-consumer="" />;
    }
    try {
      for (const [index, theme] of (["light", "dark", "violet", "light"] as const).entries()) {
        await act(async () => root.render(<AgentUIRoot theme={theme}>
          <AssistantShell><Consumer /></AssistantShell>
        </AgentUIRoot>));
        const boundary = host.querySelector("[data-agent-ui-root]")!;
        const shell = host.querySelector(".agent-ui-assistant-shell")!;
        const panel = host.querySelector<HTMLElement>(".agent-ui-assistant-panel")!;
        const trigger = host.querySelector<HTMLButtonElement>(".agent-ui-assistant-trigger")!;
        expect(boundary.getAttribute("data-theme")).toBe(theme);
        expect(boundary.getAttribute("data-color-scheme")).toBe(getAgentUIThemeColorScheme(theme));
        expect(boundary.classList.contains("dark")).toBe(theme === "dark");
        for (const element of [shell, panel, trigger]) {
          expect(element.closest("[data-agent-ui-root]")).toBe(boundary);
          expect(element.hasAttribute("data-theme")).toBe(false);
          expect(element.hasAttribute("data-color-scheme")).toBe(false);
        }
        if (index === 0) await act(async () => trigger.click());
        expect(panel.hidden).toBe(false);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(mounted).toHaveBeenCalledTimes(1);
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("derives only panel and launcher colors from semantic tokens", async () => {
    const css = await readFile(new URL("runtime/mode-shell/mode-shell.css", `file://${await generatedProjectFixture()}/`), "utf8");
    const rules = new Map([...css.matchAll(/([^{}]+)\{([^}]+)\}/gu)].map((match) => [match[1]!.trim(), match[2]!]));
    const panel = rules.get(".agent-ui-assistant-panel")!;
    const trigger = rules.get(".agent-ui-assistant-trigger")!;
    const hover = rules.get(".agent-ui-assistant-trigger:hover")!;
    const focus = rules.get(".agent-ui-assistant-trigger:focus-visible")!;
    for (const declarations of [panel, trigger, hover, focus]) {
      expect(declarations).toBeDefined();
      expect(declarations).not.toMatch(/#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch)\s*\(/iu);
    }
    for (const token of ["card", "card-foreground", "border", "aui-shadow-lg"]) expect(panel).toContain(`var(--${token})`);
    for (const token of ["primary", "primary-foreground", "border"]) expect(trigger).toContain(`var(--${token})`);
    expect(hover).toContain("var(--primary)");
    expect(focus).toContain("var(--ring)");
    expect(css).not.toMatch(/\[data-theme=[^\]]+\][^{]*\.agent-ui-assistant-(?:panel|trigger)/u);
  });
});
