// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AgentUIRoot, AgentUIDialog, getAgentUIThemeColorScheme } from "../src/public";

it("keeps all three presets and portal content inside their color-scheme boundary", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    for (const theme of ["light", "dark", "violet", "light"] as const) {
      await act(async () => root.render(<AgentUIRoot theme={theme}>
        <AgentUIDialog.Root open><AgentUIDialog.Portal><span data-theme-portal="" /></AgentUIDialog.Portal></AgentUIDialog.Root>
      </AgentUIRoot>));
      const boundary = host.querySelector("[data-agent-ui-root]")!;
      expect(boundary.getAttribute("data-theme")).toBe(theme);
      expect(boundary.getAttribute("data-color-scheme")).toBe(getAgentUIThemeColorScheme(theme));
      expect(boundary.classList.contains("dark")).toBe(theme === "dark");
      expect(host.querySelector("[data-theme-portal]")?.closest("[data-agent-ui-root]")).toBe(boundary);
      expect(document.body.hasAttribute("data-theme")).toBe(false);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
