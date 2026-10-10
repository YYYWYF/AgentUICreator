import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
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
    return { html: button.outerHTML, fontSize: computed.fontSize, borderWidth: computed.borderTopWidth, boxSizing: computed.boxSizing };
  });
  const cdp = await page.context().newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root: documentRoot } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentRoot.nodeId, selector: '#agent-isolation-mount [data-agent-ui-root] button' });
  const rules = await cdp.send('CSS.getMatchedStylesForNode', { nodeId }); await cdp.detach();
  const directory = path.resolve('../../docs/verification/plugin-style-boundary/full-visual'); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `embedded-${process.env.STYLE_PHASE || 'after'}.json`), JSON.stringify({ style, rules: (rules.matchedCSSRules ?? []).map(entry => ({ origin: entry.rule.origin, selector: entry.rule.selectorList.text, properties: entry.rule.style.cssProperties.filter(property => /^(box-sizing|border)/.test(property.name)) })).filter(entry => entry.properties.length) }, null, 2));
  await page.screenshot({ path: path.join(directory, `screenshots/embedded-${process.env.STYLE_PHASE || 'after'}.png`), fullPage: true });
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

// Isolated geometry regression for the product Surface stylesheet. Multiple
// action consumers must wrap without covering either messages or the composer.
for (const viewportWidth of [390, 1440]) {
  test(`narrow Surface reserves flowing header space in a ${viewportWidth}px Host`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 844 });
    const css = readFileSync(new URL("../../../packages/source-registry/registry/items/plugin-conversation-surface/files/plugins/conversation-surface/styles.css", import.meta.url), "utf8");
    await page.setContent(`<style>
      * { box-sizing: border-box; }
      .agent-ui-conversation { height: 100%; display: flex; flex-direction: column; }
      .message-viewport { flex: 1; min-height: 0; overflow: auto; }
      .fixture-action { min-width: 140px; height: 44px; }
      ${css}
    </style><div class="conversation-surface-plugin" style="width:360px;height:600px">
      <div class="conversation-surface-header-actions">
        <div class="app-ui-plugin-slot-width-probe"><div class="app-ui-plugin-slot-content">
          <button class="fixture-action">Action A</button><button class="fixture-action">Action B</button><button class="fixture-action">Action C</button>
        </div></div>
      </div>
      <div class="agent-ui-conversation"><div class="message-viewport">
        <article data-message-id="first">Assistant fixture text</article>
      </div><div data-test-composer style="height:80px;flex-shrink:0">Composer fixture</div></div>
    </div>`);
    const header = await page.locator(".conversation-surface-header-actions").boundingBox();
    const firstMessage = await page.locator('[data-message-id="first"]').boundingBox();
    const composer = await page.locator("[data-test-composer]").boundingBox();
    const surface = await page.locator(".conversation-surface-plugin").boundingBox();
    expect(header).not.toBeNull(); expect(firstMessage).not.toBeNull();
    expect(header!.y + header!.height).toBeLessThanOrEqual(firstMessage!.y);
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(surface!.y + surface!.height);
  });
}

// Generic third-party slots inside an owned component do not opt into Preflight.
test("preserves business content nested inside Agent UI presentation", async ({ page }) => {
  await page.goto("/style-isolation.html");
  const content = page.locator("[data-test-business-content]");
  await expect(content.locator("[data-test-business-input]")).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await expect(content.locator("[data-test-business-button]")).toHaveCSS("font-size", "31px");
  await expect(content.locator("[data-test-business-button]")).toHaveCSS("border-top-width", "9px");
  await expect(content.locator("[data-test-business-heading]")).toHaveCSS("font-size", "72px");
  await expect(content.locator("[data-test-business-list]")).toHaveCSS("list-style-type", "square");
});
