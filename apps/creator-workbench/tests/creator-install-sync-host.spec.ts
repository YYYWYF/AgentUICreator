import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
const test = base.extend<{ preview: Awaited<ReturnType<typeof createConnectionHostFixture>> }>({
  preview: async ({}, use) => {
    const fixture = await createConnectionHostFixture({ themeCommands: true, webSearchCommands: true });
    try { await use(fixture); } finally { await fixture.close(); }
  },
});
async function expectOptionHitTarget(option: Locator) {
  await expect(option).toBeVisible();
  await expect(option).toBeEnabled();
  await option.scrollIntoViewIfNeeded();
  const hitTarget = () => option.evaluate(element => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      matched: box.width > 0 && box.height > 0 && target?.closest('[role="option"]') === element,
      target: target ? { tag: target.tagName, id: target.id, className: target.getAttribute("class"), role: target.getAttribute("role"), text: target.textContent?.slice(0, 100) } : null,
      optionRect: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
  try {
    await expect.poll(async () => (await hitTarget()).matched).toBe(true);
  } catch (error) {
    throw new Error(`Slash option hit-test failed: ${JSON.stringify(await hitTarget(), null, 2)}`, { cause: error });
  }
}
async function tracePickerEvents(page: Page) {
  await page.evaluate(() => {
    const events: unknown[] = [];
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "beforeinput", "input"]) {
      document.addEventListener(type, event => {
        const target = event.target;
        events.push({
          type, time: performance.now(),
          tag: target instanceof Element ? target.tagName : undefined,
          role: target instanceof Element ? target.getAttribute("role") : undefined,
          id: target instanceof Element ? target.id : undefined,
          text: target instanceof Element ? target.textContent?.slice(0, 80) : undefined,
          value: target instanceof HTMLTextAreaElement ? target.value : undefined,
          draft: (document.querySelector("#creator-request") as HTMLTextAreaElement | null)?.value,
          inputType: event instanceof InputEvent ? event.inputType : undefined,
          data: event instanceof InputEvent ? event.data : undefined,
        });
      }, true);
    }
    (window as Window & { __creatorPickerEvents?: unknown[] }).__creatorPickerEvents = events;
  });
}
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  const events = await page.evaluate(() => (window as Window & { __creatorPickerEvents?: unknown[] }).__creatorPickerEvents);
  if (events) {
    const trace = JSON.stringify(events, null, 2);
    console.log("Creator picker events:", trace);
    await testInfo.attach("creator-picker-events", { body: trace, contentType: "application/json" });
  }
});
test.beforeEach(async ({ page, preview }) => {
  // Workspace display metadata only; commands, Agent mutation guard,
  // Operator, Source transactions, generated application and Preview are real.
  await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
    status: "ready", workspace: { id: preview.workspaceId, name: "Commands Host", displayPath: preview.hostRoot },
    project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
  } }));
  await page.goto(preview.creatorOrigin);
  await expect(page.frameLocator('iframe[title="Host Application"]').locator(".aui-composer-root").getByRole("textbox")).toBeVisible({ timeout: 15000 });
});
test("enable prepares missing application files only after confirmation and delegates composition to Creator", async ({ page, preview }) => {
  const definition = path.join(preview.hostRoot, "src/agent-ui/plugins/web-search/definition.ts");
  const beforeModel = await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8");
  await expect(readFile(definition, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const modelRequests: unknown[] = [];
  await page.route("**/__creator/run", async route => {
    modelRequests.push(route.request().postDataJSON());
    // This test verifies the handoff, without calling a configured external model.
    await route.fulfill({ status: 409, json: { error: "CREATOR_MODEL_CONFIGURATION_MISSING" } });
  });
  const catalogResponse = await page.request.get(`${preview.creatorOrigin}__creator/commands`, { headers: { "x-agent-ui-workspace-id": preview.workspaceId } });
  expect(catalogResponse.ok(), await catalogResponse.text()).toBe(true);
  const catalog = await catalogResponse.json();
  expect(catalog.commands.some((entry: { id: string }) => entry.id === "install")).toBe(false);
  expect(catalog.commands.find((entry: { id: string }) => entry.id === "enable").options.find((option: { pluginId: string }) => option.pluginId === "web-search")).toMatchObject({ id: "add:web-search", action: "add", status: "available" });
  const input = page.locator("#creator-request");
  await input.fill("/");
  const enable = page.getByRole("option", { name: /启用插件/ });
  await expectOptionHitTarget(enable); await tracePickerEvents(page); await enable.click();
  await expect(input).toHaveValue("/enable ");
  const search = page.getByRole("option", { name: /网页搜索/ });
  await expectOptionHitTarget(search);
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("web-search"); await dialog.dismiss(); });
  await search.click();
  await expect(input).toHaveValue("");
  await expect(readFile(definition, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(modelRequests).toEqual([]);
  await input.fill("/enable ");
  await expectOptionHitTarget(search);
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("web-search"); await dialog.accept(); });
  await search.click();
  await expect.poll(() => modelRequests.length).toBe(1);
  expect(JSON.stringify(modelRequests[0])).toContain("web-search");
  expect(await readFile(definition, "utf8")).toContain("web_search");
  expect(await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8")).toBe(beforeModel);
  await expect(page.locator(".creator-command-activity").last()).toContainText("Creator");
});
test("sync repairs stale and missing registry and returns a no-op for fresh output without model requests", async ({ page, preview }) => {
  let modelRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/__creator/run") modelRequests++; });
  const registry = path.join(preview.hostRoot, "src/agent-ui/plugins/registry.generated.ts");
  const expected = await readFile(registry, "utf8");
  const input = page.locator("#creator-request");
  const sync = async () => {
    await input.fill("/sync");
    const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
    await input.press("Enter");
    const result = await response; expect(result.status(), await result.text()).toBe(200);
    const body = await result.json(); expect(body.receipt.transaction).toBeUndefined();
    expect(body.receipt.validations[0].command).toBe("synchronize_plugin_registry");
    return body;
  };
  await writeFile(registry, "// stale registry\n");
  expect(await sync()).toMatchObject({ changed: true, receipt: { verification: { status: "changed-unverified" } } });
  expect(await readFile(registry, "utf8")).toBe(expected);
  await rm(registry); expect((await sync()).changed).toBe(true);
  expect(await readFile(registry, "utf8")).toBe(expected);
  expect(await sync()).toMatchObject({ changed: false, receipt: { verification: { status: "no-project-change" } } });
  expect(modelRequests).toBe(0);
});
