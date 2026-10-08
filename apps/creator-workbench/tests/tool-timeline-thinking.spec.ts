import { expect, test } from "@playwright/test";
import { createI18nPluginHost } from "./support/i18n-plugin-visual-host";
import { readReleasePluginCoverage } from "./support/i18n-plugin-visual-coverage";
let host: Awaited<ReturnType<typeof createI18nPluginHost>>;
test.beforeAll(async () => { host = await createI18nPluginHost((await readReleasePluginCoverage()).releaseIds); });
test.afterAll(async () => { await host?.close(); });
for (const theme of ["light", "dark", "violet"]) {
  test(`T02/T03/T14 official timeline keyboard/details/overflow: ${theme}`, async ({ page }, info) => {
    await host.setMessagePresentation({ timeline: true, thinking: true, reasoning: true });
    await page.goto(`${host.url}?locale=${info.project.metadata.locale}&scenario=tool-timeline-thinking&speed=0.1`);
    await page.locator('[data-ui-plugin="theme-switch"] select').selectOption(theme);
    const input = page.locator('[contenteditable="true"]').first();
    await input.fill("Timeline visual fixture"); await input.press("Enter");
    const timeline = page.locator('[data-slot="tool-timeline"]');
    await expect(timeline).toHaveCount(1);
    await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
    await expect(timeline).toHaveCount(1);
    const trigger = timeline.locator('button').first();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.focus(); await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(timeline).toContainText(info.project.metadata.locale === "zh-CN" ? "已执行 3 个步骤" : "Executed 3 steps");
    await expect(page.locator('[data-slot="thinking-indicator"]')).toHaveCount(0);
    const details = page.locator('[data-slot="agent-ui-tool-timeline"]').getByRole('button', { name: info.project.metadata.locale === "zh-CN" ? "原始工具详情" : "Original tool details" });
    await details.click();
    await expect(page.locator('[data-slot="tool-fallback-root"]')).toHaveCount(3);
    const overflow = await page.locator('[data-ui-plugin="conversation-surface"]').evaluate(node => node.scrollWidth > node.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: info.outputPath(`timeline-${theme}.png`), fullPage: true, animations: "disabled" });
  });
}
test("T08/T09/T10 placeholder-only, reasoning-only and both", async ({ page }, info) => {
  for (const mode of ["placeholder", "reasoning", "both"] as const) {
    await host.setMessagePresentation({ timeline: false, thinking: mode !== "reasoning", reasoning: mode !== "placeholder" });
    await page.goto(`${host.url}?locale=${info.project.metadata.locale}&scenario=thinking-placeholder&speed=0.5`);
    const input = page.locator('[contenteditable="true"]').first();
    await input.fill("Thinking visual fixture"); await input.press("Enter");
    if (mode === "placeholder") {
      await expect(page.locator('[data-slot="thinking-indicator"]')).toHaveCount(1);
      await expect(page.locator('[data-slot="reasoning-root"]')).toHaveCount(0);
      await expect(page.locator('[data-slot="aui_assistant-message-indicator"]')).toHaveCount(0);
    } else {
      await expect(page.locator('[data-slot="reasoning-root"]')).toBeVisible();
      await expect(page.locator('[data-slot="thinking-indicator"]')).toHaveCount(0);
    }
    await page.screenshot({ path: info.outputPath(`thinking-${mode}.png`), fullPage: true, animations: "disabled" });
    await expect(page.locator('.aui-composer-send')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-slot="thinking-indicator"]')).toHaveCount(0);
  }
});
