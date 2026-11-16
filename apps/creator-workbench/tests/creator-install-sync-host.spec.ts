import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../../../packages/creator/operator/src/framework/contracts/app-ui-model";
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
test("enable confirms missing application files and adds the official Plugin without a model request", async ({ page, preview }) => {
  const definition = path.join(preview.hostRoot, "src/agent-ui/plugins/web-search/definition.ts");
  const beforeModel = await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8");
  await expect(readFile(definition, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const modelRequests: unknown[] = [];
  await page.route("**/__creator/run", async route => {
    modelRequests.push(route.request().postDataJSON());
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
  await expect(page.locator(".creator-command-activity").last()).toContainText("已启用");
  expect(await readFile(definition, "utf8")).toContain("web_search");
  const model = parseAppUIModelJson(await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8"));
  expect(model.root).toEqual(parseAppUIModelJson(beforeModel).root);
  expect(collectAppUIPluginLocations(model).find(({ plugin }) => plugin.pluginId === "web-search")?.target).toEqual({ type: "application" });
  expect(modelRequests).toEqual([]);
});
test("Creator enables slash and its command source with default composition and no model requests", async ({ page, preview }) => {
  const modelRequests: unknown[] = [];
  await page.route("**/__creator/run", async route => {
    modelRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "CREATOR_MODEL_CONFIGURATION_MISSING" } });
  });
  const input = page.locator("#creator-request");
  for (const label of [/快捷命令来源/, /输入 \/ 使用命令/]) {
    await input.fill("/enable ");
    const option = page.getByRole("option", { name: label });
    await expectOptionHitTarget(option);
    page.once("dialog", dialog => dialog.accept());
    await option.click();
    await expect(page.locator(".creator-command-activity").last()).toContainText("已启用");
  }
  const model = parseAppUIModelJson(await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8"));
  const locations = collectAppUIPluginLocations(model);
  const composer = locations.find(({ plugin }) => plugin.pluginId === "composer")!.plugin;
  expect(locations.find(({ plugin }) => plugin.pluginId === "slash-command-trigger")?.target)
    .toEqual({ type: "plugin_slot", parentInstanceId: composer.id, slot: "triggers" });
  expect(locations.find(({ plugin }) => plugin.pluginId === "conversation-command-source")?.target).toEqual({ type: "application" });
  await expect(page.frameLocator('iframe[title="Host Application"]').locator(".aui-composer-root").getByRole("textbox")).toBeVisible();
  expect(modelRequests).toEqual([]);
});
test("an occupied default Slot keeps prepared files and shows a persistent notice without blocking commands", async ({ page, preview }) => {
  const modelPath = path.join(preview.hostRoot, "src/agent-ui/app-ui.json");
  const beforeModel = await readFile(modelPath, "utf8");
  const registryPath = path.join(preview.hostRoot, "src/agent-ui/plugins/registry.generated.ts");
  const beforeRegistry = await readFile(registryPath, "utf8");
  const modelRequests: unknown[] = [];
  await page.route("**/__creator/run", async route => {
    modelRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "CREATOR_MODEL_CONFIGURATION_MISSING" } });
  });
  const input = page.locator("#creator-request");
  await input.fill("/enable tool-fallback");
  const option = page.getByRole("option", { name: /tool-fallback/ });
  await expectOptionHitTarget(option);
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("tool-fallback"); await dialog.accept(); });
  await option.click();
  const activity = page.locator(".creator-command-activity").last();
  await expect(activity).toContainText("已准备好");
  await expect(activity).toContainText("尚未放入界面，也未启用");
  await expect(activity).toContainText("查看工具调用详情");
  await expect(activity).toContainText("tool-fallback");
  await expect(activity).toContainText("src/agent-ui/app-ui.json");
  await expect(activity).toContainText("slots.toolFallback");
  await expect(activity).toContainText("不要同时保留两项");
  await expect(activity.locator('pre[aria-label="app-ui.json 放置示例"] code')).toContainText('"pluginId": "tool-fallback"');
  await expect(activity).toContainText("待手动放置");
  await expect(activity).not.toContainText("Runtime 暂不可用");
  await expect(activity).not.toContainText("修改已通过静态验证");
  const entry = path.join(preview.hostRoot, "src/agent-ui/plugins/tool-fallback/index.tsx");
  expect(await readFile(entry, "utf8")).toContain("ToolFallback");
  expect(await readFile(modelPath, "utf8")).toBe(beforeModel);
  expect(await readFile(registryPath, "utf8")).toBe(beforeRegistry);
  await page.reload();
  await expect(activity).toContainText("已准备好");
  await expect(activity).toContainText("src/agent-ui/app-ui.json");
  await expect(activity.locator('pre[aria-label="app-ui.json 放置示例"] code')).toContainText('"toolFallback"');
  await expect(input).toBeEnabled();
  const syncResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/__creator/commands/execute");
  await input.fill("/sync");
  await input.press("Enter");
  const synced = await syncResponse;
  expect(synced.status(), await synced.text()).toBe(200);
  await expect(page.locator(".creator-command-activity").last()).toContainText("插件列表已是最新");
  expect(modelRequests).toEqual([]);
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
