import { expect, test } from "@playwright/test";

test("keeps ordinary Host globals outside Agent UI and preserves Host probes", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const agent = page.locator("#agent-isolation-mount [data-agent-ui-root]");
  await expect(agent).toHaveCount(1);
  await expect(agent.locator("[data-agent-ui-mode=embedded]")).toHaveCount(1);
  await expect(agent.locator("[data-ui-plugin=conversation-surface]")).toHaveCount(1);
  await expect(agent.locator("[data-agent-ui-conversation]")).toHaveCount(1);

  const probes = await page.locator("[data-host-probe]").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const before = JSON.parse((element as HTMLElement).dataset.beforeAgent ?? "null") as Record<string, string>;
    return { name: element.getAttribute("data-host-probe"), before,
      after: Object.fromEntries(Object.keys(before).map((key) => [key, style.getPropertyValue(key.replace(/[A-Z]/g, (part) => `-${part.toLowerCase()}`))])) };
  }));
  for (const probe of probes) expect(probe.after, probe.name ?? undefined).toEqual(probe.before);
  expect(probes.find((probe) => probe.name === "button")?.before.fontSize).toBe("31px");

  const style = await agent.locator("button").first().evaluate((button) => {
    const computed = getComputedStyle(button);
    return { fontSize: computed.fontSize, borderWidth: computed.borderTopWidth, boxSizing: computed.boxSizing };
  });
  expect(style.fontSize).not.toBe("31px");
  expect(style.borderWidth).not.toBe("9px");
  expect(style.boxSizing).toBe("border-box");
  const composerSend = agent.locator(".aui-composer-send");
  await expect(composerSend).toHaveCount(1);
  expect(await composerSend.evaluate((button) => getComputedStyle(button).borderRadius)).not.toBe("0px");
});

test("mounts Tooltip, Popover and Dialog within the themed Portal boundary", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const root = page.locator("#portal-isolation-mount [data-agent-ui-root]");
  await expect(root.locator("[data-agent-ui-portal-root]")).toHaveCount(1);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await root.locator("[data-test-theme]").click();
    await expect(root).toHaveAttribute("data-theme", theme);
    for (const [kind, selector] of [
      ["tooltip", "[data-slot=tooltip-content]"],
      ["popover", "[data-slot=popover-content]"],
      ["dialog", "[data-test-dialog]"],
    ] as const) {
      await root.locator(`[data-test-open=${kind}]`).click();
      const portal = root.locator(`[data-agent-ui-portal-root] ${selector}`);
      await expect(portal).toBeVisible();
      const tokens = await portal.evaluate((node) => {
        const root = node.closest("[data-agent-ui-root]")!;
        const values = ["--popover", "--popover-foreground", "--border", "--foreground"];
        return values.map((name) => ({ portal: getComputedStyle(node).getPropertyValue(name).trim(), root: getComputedStyle(root).getPropertyValue(name).trim() }));
      });
      for (const token of tokens) {
        expect(token.portal).toBeTruthy();
        expect(token.portal).toBe(token.root);
      }
      expect(await portal.evaluate((node) => node.parentElement === document.body)).toBe(false);
      if (kind === "dialog") await page.keyboard.press("Escape");
    }
  }
});
