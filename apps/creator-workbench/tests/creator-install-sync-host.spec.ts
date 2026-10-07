import { expect, test as base } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
const test = base.extend<{ preview: Awaited<ReturnType<typeof createConnectionHostFixture>> }>({
  preview: async ({}, use) => {
    const fixture = await createConnectionHostFixture({ themeCommands: true, webSearchCommands: true });
    try { await use(fixture); } finally { await fixture.close(); }
  },
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
  page.on("request", request => { if (new URL(request.url()).pathname === "/__agent-ui/creator") modelRequests++; });
  const catalog = await page.request.get(`${preview.creatorOrigin}__creator/commands`, { headers: { "x-agent-ui-workspace-id": preview.workspaceId } });
  expect(catalog.ok()).toBe(true);
  expect((await catalog.json()).commands.find((command: { id: string }) => command.id === "install").options.find((option: { id: string }) => option.id === "web-search")).toMatchObject({ status: "available", disabled: false });
  const input = page.locator("#creator-request");
  await input.fill("/");
  await page.getByRole("option", { name: /安装能力/ }).click();
  await expect(input).toHaveValue("/install ");
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
  await page.getByRole("option", { name: /网页搜索/ }).click();
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
