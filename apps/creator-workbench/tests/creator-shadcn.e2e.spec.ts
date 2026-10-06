import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("uses scoped shadcn controls and keeps the settings portal inside Creator", async ({ page }, testInfo) => {
  await page.route("**/__agent-ui/creator/workspace", route => route.fulfill({ json: {
    status: "ready", workspace: { id: "shadcn-preview", name: "Project", displayPath: "/project" },
    project: { mode: "platform", sourceRoot: "agent-ui" }, runtime: { status: "ready" },
  } }));
  let checks = 0;
  await page.route("**/__creator/updates/check", route => {
    checks++;
    return route.fulfill({ json: {
      releaseVersion: "0.0.2", compatibility: "compatible", fingerprint: "shadcn-preview",
      plugins: Array.from({ length: 24 }, (_, index) => ({
        pluginId: `plugin-${index}`, name: index === 0 ? "Conversation Surface" : `Plugin ${index + 1}`,
        currentVersion: "0.0.1", targetVersion: "0.0.2", status: "managed", updateAvailable: true,
        changelog: [{ version: "0.0.2", entry: { summary: "更新会话组件", changes: ["修复显示与交互"] } }],
      })),
    } });
  });
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto("/dock.html");
  const settings = page.getByRole("button", { name: "设置", exact: true });
  const banner = page.locator(".creator-update-banner");
  await expect(banner).toContainText("有 24 个插件可以更新");
  await expect(settings).toHaveAttribute("data-creator-ui-button", "");
  const updateEntry = banner.getByRole("button", { name: "查看更新", exact: true });
  expect(await banner.evaluate(element => !!element.closest(".creator-panel-header"))).toBe(true);
  await expect(updateEntry).toHaveCSS("color", "rgb(21, 128, 61)");
  await expect(updateEntry).toHaveAttribute("title", "有 24 个插件可以更新");
  const clear = page.getByRole("button", { name: "清空 Creator 会话", exact: true });
  await expect(clear).toBeVisible();
  expect(await clear.evaluate(element => !!element.closest(".creator-panel-composer"))).toBe(true);
  await expect(page.locator(".creator-panel-header").getByRole("button", { name: "清空 Creator 会话" })).toHaveCount(0);
  await page.locator("#creator-request").fill("未发送的草稿");
  await clear.click();
  await expect(page.locator("#creator-request")).toHaveValue("");
  for (const width of [480, 400, 360, 320]) {
    await page.setViewportSize({ width, height: 720 });
    const header = page.locator(".creator-panel-header");
    const geometry = await header.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const brand = element.querySelector(".creator-panel-brand")!.getBoundingClientRect();
      const actions = element.querySelector(".creator-panel-header-actions")!.getBoundingClientRect();
      return { height: bounds.height, overflow: element.scrollWidth > element.clientWidth, aligned: Math.abs((brand.top + brand.height / 2) - (actions.top + actions.height / 2)) < 2, overlap: brand.right > actions.left };
    });
    expect(geometry).toMatchObject({ overflow: false, aligned: true, overlap: false });
    expect(geometry.height).toBeLessThanOrEqual(64);
    const composer = page.locator(".creator-panel-composer");
    expect(await composer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await composer.screenshot({ path: testInfo.outputPath(`creator-composer-${width}.png`) });
    await page.screenshot({ path: testInfo.outputPath(`creator-toolbar-${width}.png`), clip: { x: 0, y: 0, width, height: 100 } });
  }
  await page.setViewportSize({ width: 480, height: 720 });
  await updateEntry.click();
  await expect(page.locator(".creator-update-page [data-slot=card]")).toHaveCount(24);
  await expect(banner).toBeHidden();
  await page.route("**/__agent-ui/creator/mock**", route => route.fulfill({ json: { status: "stopped", endpoint: null, scenarioId: "simple-chat", speed: 1, scenarios: [] } }));
  await page.getByRole("button", { name: "打开 Mock Agent 面板", exact: true }).click();
  await expect(page.locator(".creator-update-page")).toBeHidden();
  await expect(page.locator(".creator-mock-panel")).toBeVisible();
  await updateEntry.click();
  await expect(page.locator(".creator-update-page")).toBeVisible();
  await expect(page.locator(".creator-mock-panel")).toBeHidden();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(banner).toBeVisible();
  await settings.click();
  const popover = page.getByRole("dialog", { name: "设置" });
  await expect(popover).toBeVisible();
  expect(await popover.evaluate(element => !!element.closest(".creator-panel"))).toBe(true);
  await expect(popover).toHaveCSS("width", "176px");
  await expect(popover.getByRole("button", { name: "检查更新" })).toBeFocused();
  await expect(popover).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("creator-settings.png"), clip: { x: 0, y: 0, width: 480, height: 156 } });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(settings).toBeFocused();
  await settings.click();
  await page.locator(".creator-panel-header h1").click();
  await expect(popover).toBeHidden();
  await settings.click();
  const beforeManual = checks;
  await popover.getByRole("button", { name: "检查更新" }).click();
  await expect(popover).toBeHidden();
  await expect(page.locator(".creator-update-page [data-slot=card]")).toHaveCount(24);
  expect(checks).toBeGreaterThan(beforeManual);
  await page.getByRole("button", { name: "关闭插件更新提示" }).click();
  await expect(banner).toBeHidden();
});

test("compiled Creator CSS preserves ordinary Host elements", async ({ page }) => {
  await page.setContent(`<style>button { font-size:31px; border:9px solid red; background:pink; padding:17px; }
    h2 { font-size:72px; } p { margin:19px; }</style>
    <button>Host</button><h2>Host heading</h2><p>Host paragraph</p>`);
  const snapshot = () => page.locator("button,h2,p").evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return Object.fromEntries(["font-size", "border-width", "background-color", "padding", "margin", "box-sizing"].map(key => [key, style.getPropertyValue(key)]));
  }));
  const before = await snapshot();
  const css = [
    readFileSync(new URL("../../../packages/creator/src/ui/components/creator-ui.css", import.meta.url), "utf8"),
    readFileSync(new URL("../../../packages/creator/src/ui/creator-workbench.css", import.meta.url), "utf8").replace('@import "./components/creator-ui.css";', ""),
    readFileSync(new URL("../../../packages/creator/src/ui/setup/creator-project-setup.css", import.meta.url), "utf8"),
  ].join("\n");
  await page.addStyleTag({ content: css });
  expect(await snapshot()).toEqual(before);
});
