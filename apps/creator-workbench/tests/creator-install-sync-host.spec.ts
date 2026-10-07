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
  // Workspace display metadata only; commands, Python mutation guard,
  // ProjectControl, Source transactions, generated application and Preview are real.
  await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
    status: "ready", workspace: { id: preview.workspaceId, name: "Commands Host", displayPath: preview.hostRoot },
    project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
  } }));
  await page.goto(preview.creatorOrigin);
});
test("installs a missing capability through the Picker, persists it, and renders real AG-UI without Creator requests", async ({ page, preview }) => {
  let modelRequests = 0;
  let commandRequests = 0;
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/__agent-ui/creator") modelRequests++;
    if (pathname === "/__creator/commands/execute" && request.method() === "POST") commandRequests++;
  });
  const catalog = await page.request.get(`${preview.creatorOrigin}__creator/commands`, { headers: { "x-agent-ui-workspace-id": preview.workspaceId } });
  expect(catalog.ok()).toBe(true);
  expect((await catalog.json()).commands.find((command: { id: string }) => command.id === "install").options.find((option: { id: string }) => option.id === "web-search")).toMatchObject({ status: "available", disabled: false });
  const input = page.locator("#creator-request");
  await input.fill("/");
  const installOption = page.getByRole("option", { name: /安装能力/ });
  await expectOptionHitTarget(installOption);
  await tracePickerEvents(page);
  await installOption.click();
  await expect(input).toHaveValue("/install ");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(input).toHaveValue("/install ");
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
  const resourceOption = page.getByRole("option", { name: /网页搜索/ });
  await expectOptionHitTarget(resourceOption);
  await resourceOption.hover();
  await expect(input).toHaveValue("/install ");
  await resourceOption.click();
  const installed = await response;
  expect(installed.status(), await installed.text()).toBe(200);
  const result = await installed.json();
  expect(result).toMatchObject({ value: "web-search", changed: true, receipt: { verification: { status: "changed-and-statically-verified" } } });
  expect(result.receipt.transaction).toBeUndefined();
  expect(result.receipt.validations[0].status).toBe("passed");
  expect(await readFile(path.join(preview.hostRoot, "src/agent-ui/plugins/web-search/definition.ts"), "utf8")).toContain("web_search");
  expect(await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui/app-ui.json"), "utf8")).toContain('"pluginId": "web-search"');
  // Point the generated app at the disposable real AG-UI server.
  const connection = await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/connection`, {
    headers: { "x-agent-ui-workspace-id": preview.workspaceId }, data: { activeSource: "connected", endpoint: preview.agentEndpoint },
  });
  expect(connection.ok()).toBe(true);
  const assertRendered = async () => {
    await page.reload();
    const host = page.frameLocator('iframe[title="Host Application"]');
    await host.locator(".aui-composer-root").getByRole("textbox").fill("Show installed search");
    await host.locator(".aui-composer-send").click();
    await expect.poll(() => preview.pendingCount()).toBe(1);
    preview.finishRun();
    await expect(host.getByText("Installed search capability", { exact: true }).first()).toBeVisible();
    await expect(host.locator('[data-plugin-state="error"]')).toHaveCount(0);
  };
  await assertRendered(); await assertRendered();
  await input.fill("/install ");
  await expect(page.getByRole("option", { name: /网页搜索.*已安装/ })).toBeDisabled();
  expect(modelRequests).toBe(0);
  expect(commandRequests).toBe(1);
});
test("sync repairs stale and missing registry and returns a no-op for fresh output without model requests", async ({ page, preview }) => {
  let modelRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/__agent-ui/creator") modelRequests++; });
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
