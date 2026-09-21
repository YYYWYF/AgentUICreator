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
  test("keeps the empty liveStatus surface thread full-height", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const preview = page.locator("[data-agent-ui-preview-root]");
    const surface = preview.locator(".conversation-surface-plugin");
    const liveStatus = surface.locator(".conversation-surface-live-status");
    const viewport = surface.locator(
      '.conversation-surface-thread [data-slot="aui_thread-viewport"]',
    );

    await expect(surface).toBeVisible();
    await expect(liveStatus).toHaveCSS("display", "none");
    await expectThreadViewportToFillSurface(surface, viewport);
  });

  test("keeps JobProgress above a full-height thread within the surface", async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.sessionStorage.setItem(storageKey, "1");
    }, MOCK_SCENARIO_AUTORUN_STORAGE_KEY);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?mockScenario=agent-state-sync&mockSpeed=1");

    const preview = page.locator("[data-agent-ui-preview-root]");
    const surface = preview.locator(".conversation-surface-plugin");
    const liveStatus = surface.locator(".conversation-surface-live-status");
    const jobProgress = liveStatus.locator('[data-slot="job-progress"]');
    const thread = surface.locator(".conversation-surface-thread");
    const viewport = thread.locator('[data-slot="aui_thread-viewport"]');

    await expect(surface).toBeVisible();
    await expect(jobProgress).toBeVisible();
    await expect(liveStatus).toBeVisible();
    await expectThreadViewportToFillSurface(surface, viewport);

    await expect.poll(async () => {
      const [surfaceBox, statusBox, threadBox, viewportBox] = await Promise.all([
        surface.boundingBox(),
        jobProgress.boundingBox(),
        thread.boundingBox(),
        viewport.boundingBox(),
      ]);
      if (
        surfaceBox === null ||
        statusBox === null ||
        threadBox === null ||
        viewportBox === null
      ) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.max(
        surfaceBox.top - statusBox.top,
        statusBox.bottom - surfaceBox.bottom,
        statusBox.bottom - threadBox.top,
        threadBox.bottom - surfaceBox.bottom,
        Math.abs(viewportBox.bottom - threadBox.bottom),
      );
    }).toBeLessThanOrEqual(2);
  });
});
