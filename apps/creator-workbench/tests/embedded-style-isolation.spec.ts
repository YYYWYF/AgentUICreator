import { expect, test } from "@playwright/test";

test("keeps ordinary Host globals outside Agent UI and preserves Host probes", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const agent = page.locator("#agent-isolation-mount [data-agent-ui-root]");
  await expect(agent).toHaveCount(1);
  await expect(agent.locator("[data-agent-ui-mode=embedded]")).toHaveCount(1);
  await expect(agent.locator("[data-ui-plugin=conversation-surface]")).toHaveCount(1);
  await expect(agent.locator("[data-agent-ui-conversation]")).toHaveCount(1);
  await expect(agent.locator('[role="alert"][data-plugin-id]')).toHaveCount(0);

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
  const controls = page.locator("#portal-isolation-mount [data-agent-ui-root]");
  expect(await controls.locator("[data-test-agent-heading]").evaluate((element) => getComputedStyle(element).fontSize)).not.toBe("72px");
  expect(await controls.locator("[data-test-agent-input]").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 0)");
  expect(await controls.locator("[data-test-agent-list]").evaluate((element) => getComputedStyle(element).listStyleType)).not.toBe("square");
  const composerSend = agent.locator(".aui-composer-send");
  await expect(composerSend).toHaveCount(1);
  expect(await composerSend.evaluate((button) => getComputedStyle(button).borderRadius)).not.toBe("0px");
});

test("preserves runtime Row tracks inside the Agent UI style boundary", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const root = page.locator("#portal-isolation-mount [data-agent-ui-root]");
  const row = root.locator("[data-layout-node-id=style-isolation-row]");
  await expect(row).toHaveCSS("display", "grid");
  const list = await root.locator("[data-test-layout-region=list]").boundingBox();
  const chat = await root.locator("[data-test-layout-region=chat]").boundingBox();
  expect(list).not.toBeNull();
  expect(chat).not.toBeNull();
  expect(list!.width).toBeCloseTo(280, 0);
  expect(chat!.x).toBeCloseTo(list!.x + list!.width, 0);
  expect(chat!.width).toBeCloseTo(620, 0);
});

test("mounts Tooltip, Popover and Dialog within the themed Portal boundary", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const root = page.locator("#portal-isolation-mount [data-agent-ui-root]");
  await expect(root.locator("[data-agent-ui-portal-root]")).toHaveCount(1);
  const buttonBackgrounds: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await root.locator("[data-test-theme]").click();
    await expect(root).toHaveAttribute("data-theme", theme);
    await expect(root).toHaveClass(theme === "dark" ? /\bdark\b/u : /\bagent-ui-root\b/u);
    expect(await root.locator("[data-agent-ui-portal-root]").evaluate((node) => node.closest(".dark") === node.closest("[data-agent-ui-root]"))).toBe(theme === "dark");
    for (const [kind, selector] of [
      ["tooltip", "[data-slot=tooltip-content]"],
      ["popover", "[data-slot=popover-content]"],
      ["dialog", "[data-test-dialog]"],
      ["facade-dialog", "[data-test-facade-dialog]"],
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
      if (kind === "facade-dialog") {
        buttonBackgrounds.push(await portal.locator("[data-test-dark-button]").evaluate((button) => getComputedStyle(button).backgroundColor));
      }
      if (kind === "dialog" || kind === "facade-dialog") await page.keyboard.press("Escape");
    }
  }
  expect(buttonBackgrounds).toHaveLength(2);
  expect(buttonBackgrounds[0]).not.toBe(buttonBackgrounds[1]);
});
