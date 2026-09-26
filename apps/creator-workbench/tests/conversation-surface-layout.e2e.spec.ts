import { expect, test, type Locator } from "@playwright/test";

const MOCK_SCENARIO_AUTORUN_STORAGE_KEY = "agent-ui:mock-scenario-autorun";

async function expectThreadViewportToFillSurface(
  surface: Locator,
  viewport: Locator,
): Promise<void> {
  await expect.poll(async () => {
    const [surfaceBox, viewportBox] = await Promise.all([
      surface.boundingBox(),
      viewport.boundingBox(),
    ]);
    if (surfaceBox === null || viewportBox === null) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.abs(surfaceBox.bottom - viewportBox.bottom);
  }).toBeLessThanOrEqual(2);

  await expect.poll(async () => {
    const box = await viewport.boundingBox();
    return box?.height ?? 0;
  }).toBeGreaterThan(0);
}

test.describe("ConversationSurface layout", () => {
  test("keeps the empty conversation thread full-height", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const preview = page.locator("[data-agent-ui-preview-root]");
    const surface = preview.locator(".conversation-surface-plugin");
    const viewport = surface.locator(
      '[data-slot="aui_thread-viewport"]',
    );

    await expect(surface).toBeVisible();
    await expectThreadViewportToFillSurface(surface, viewport);
  });

  test("places JobProgress in the transcript while the conversation stays full-height", async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.sessionStorage.setItem(storageKey, "1");
    }, MOCK_SCENARIO_AUTORUN_STORAGE_KEY);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?mockScenario=agent-state-sync&mockSpeed=1");

    const preview = page.locator("[data-agent-ui-preview-root]");
    const surface = preview.locator(".conversation-surface-plugin");
    const jobProgress = surface.locator(
      '[data-slot="aui_message-group"] [data-slot="job-progress"]',
    );
    const viewport = surface.locator('[data-slot="aui_thread-viewport"]');

    await expect(surface).toBeVisible();
    await expect(jobProgress).toBeVisible();
    await expect(surface.locator(".conversation-surface-live-status")).toHaveCount(0);
    await expectThreadViewportToFillSurface(surface, viewport);

    await expect(surface).toContainText("CI 验证完成，所有阶段通过。");
    await expect(
      surface.locator('[data-slot="aui_assistant-message-root"]'),
    ).toHaveCount(1);
    await expect(
      surface.locator('[data-slot="aui_assistant-response-footer"]'),
    ).toHaveCount(1);
    await expect(
      surface.locator('[data-slot="aui_assistant-response-footer-plugin"]'),
    ).toHaveCount(1);
    await expect(
      surface.locator(
        '[data-slot="aui_assistant-message-root"] [data-slot="job-progress"]',
      ),
    ).toHaveCount(1);
    await expect(
      surface.locator('[data-slot="aui_assistant-message-root"]'),
    ).toContainText("CI 验证完成，所有阶段通过。");
  });
});
