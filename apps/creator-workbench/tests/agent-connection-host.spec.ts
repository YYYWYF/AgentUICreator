import { expect, test as base } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

async function waitForSource(page: import("@playwright/test").Page, origin: string, source: string) {
  const frame = page.frames().find(frame => frame.url().startsWith(origin))!;
  await expect.poll(() => frame.evaluate(() => (window as Window & { __agentUIPreviewEnvironment?: { type: string } }).__agentUIPreviewEnvironment?.type ?? "application")).toBe(source);
  // The preview event starts a new session; wait for its React commit before typing.
  await frame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(frame.locator(".aui-composer-root").getByRole("textbox")).toBeEditable();
}

const test = base.extend<{ preview: Awaited<ReturnType<typeof createConnectionHostFixture>> }>({
  preview: async ({}, use) => { const fixture = await createConnectionHostFixture(); try { await use(fixture); } finally { await fixture.close(); } },
});
test.beforeEach(async ({ page, preview }) => {
  await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace`, route => route.fulfill({ json: {
    status: "ready", workspace: { id: preview.workspaceId, name: "Ordinary Host", displayPath: preview.hostRoot },
    project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
  } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(preview.creatorOrigin);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
  await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
});

for (const width of [1440, 900]) {
test(`ordinary Host receives Mock thread list, history and chat through Creator at ${width}px`, async ({ page, preview }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  expect(existsSync(path.join(preview.hostRoot, "node_modules/@za38.03/agent-ui-creator"))).toBe(false);
  await page.getByRole("button", { name: "返回对话", exact: true }).click();
  const host = page.frameLocator('iframe[title="Host Application"]');
  const list = host.locator('[data-ui-plugin="conversation-thread-list"]');
  await expect(host.locator("[data-layout-responsive]")).toHaveAttribute("data-layout-responsive", width === 900 ? "drawer" : "grid");
  const toggle = host.locator(".app-ui-layout-drawer-controls button");
  if (width === 900) await toggle.click();
  await expect(list.getByText("历史：基础会话", { exact: true })).toBeVisible();
  await list.getByText("历史：基础会话", { exact: true }).click();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始");
  await expect(host.locator('[data-plugin-state="error"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("history-loaded.png"), animations: "disabled" });
  const selection = await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "simple-chat", speed: 0 } });
  expect(selection.ok()).toBe(true);
  // The AppUIModel responsive Row uses its native dialog controls.
  if (width === 900) {
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
  }
  await list.getByRole("button", { name: /新建会话|New Thread/ }).click();
  if (width === 900) await page.keyboard.press("Escape");
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).not.toContainText("我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始");
  const response = page.waitForResponse(value => value.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`) && value.request().method() === "POST");
  await host.locator(".aui-composer-root").getByRole("textbox").fill("Mock chat through ordinary Host");
  await host.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(host.locator('[data-slot="aui_assistant-message-root"]')).toContainText("你好，这是一个纯文本流式回复。");
  await page.screenshot({ path: testInfo.outputPath("new-thread-completed.png"), animations: "disabled" });
  if (width === 900) {
    await expect(list).toBeHidden();
    await toggle.click();
  }
  await expect(list).toHaveAttribute("data-conversation-list-status", "ready");
  expect(errors).toEqual([]);
});
}

test("generated Host mounts independently without a root tsconfig or Creator preview", async ({ page, preview }) => {
  expect(existsSync(path.join(preview.hostRoot, "tsconfig.json"))).toBe(false);
  await page.goto(preview.hostOrigin);
  await expect(page.locator('[data-ui-plugin="conversation-thread-list"]')).toBeVisible();
  await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toBeVisible();
  await expect(page.locator(".aui-composer-root").getByRole("textbox")).toBeEditable();
  await expect(page.locator('[data-plugin-state="error"]')).toHaveCount(0);
});

for (const mode of ["proxy", "direct"] as const) {
test(`Host dropdown Creator applies ${mode} connection to its outer conversation`, async ({ page, preview }) => {
  if (mode === "direct") preview.enableCors();
  await page.goto(preview.hostOrigin);
  await page.getByRole("button", { name: /Creator Agent/ }).click();
  const dock = page.frameLocator('iframe[title="Creator Agent"]');
  await dock.getByRole("button", { name: "设置", exact: true }).click();
  await dock.getByRole("button", { name: "连接 Agent", exact: true }).click();
  await dock.getByRole("textbox", { name: "Agent 服务地址" }).fill(preview.agentEndpoint);
  await dock.getByRole("combobox", { name: "连接方式" }).selectOption(mode);
  await dock.getByRole("button", { name: "使用此地址", exact: true }).click();
  await expect(dock.getByText("当前使用：自己的 Agent 服务", { exact: true })).toBeVisible();
  await waitForSource(page, preview.hostOrigin, "connected");
  await expect(page.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /收起 Creator/ }).click();
  await page.locator(".aui-composer-root").getByRole("textbox").fill("Dropdown connection");
  const destination = mode === "direct" ? preview.agentEndpoint : `${preview.hostOrigin}__agent-ui/agent-proxy/run`;
  const response = page.waitForResponse(value => value.url() === destination && value.request().method() === "POST");
  await page.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:first");
  expect(preview.runCount()).toBe(1);
  await page.getByRole("button", { name: /Creator Agent/ }).click();
  await expect(dock.getByRole("button", { name: "使用示例 Agent", exact: true })).toBeDisabled();
  await expect(dock.getByRole("combobox", { name: "连接方式" })).toBeDisabled();
  preview.finishRun();
  await expect(dock.getByRole("button", { name: "使用示例 Agent", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
  await expect(page.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
  await expect(page.getByText(/wire:first/)).toHaveCount(0);
  const saved = await page.request.get(`${preview.creatorOrigin}__agent-ui/creator/connection`, { headers: { "X-Agent-UI-Workspace-Id": preview.workspaceId } });
  expect(await saved.json()).toMatchObject({ connectionMode: mode, endpoint: preview.agentEndpoint });
});
}

test("no-CORS Connected Agent streams before completion and Source switching isolates sessions", async ({ page, preview }) => {
  const host = page.frameLocator('iframe[title="Host Application"]');
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
  const endpoint = page.getByRole("textbox", { name: "Agent 服务地址" });
  await endpoint.fill(preview.agentEndpoint);
  await page.getByRole("button", { name: "使用此地址", exact: true }).click();
  await expect(page.getByText("当前使用：自己的 Agent 服务", { exact: true })).toBeVisible();
  await expect(host.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  const child = page.frames().find(frame => frame.url().startsWith(preview.hostOrigin))!;
  // A direct browser POST is blocked by CORS; the Agent has no OPTIONS support.
  expect(await child.evaluate(async endpoint => {
    try { await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return false; }
    catch { return true; }
  }, preview.agentEndpoint)).toBe(true);
  await waitForSource(page, preview.hostOrigin, "connected");
  await host.locator(".aui-composer-root").getByRole("textbox").fill("Connected chat");
  await host.locator(".aui-composer-send").click();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:first");
  expect(preview.runCount()).toBe(1);
  expect(preview.pendingCount()).toBe(1); // Upstream has not finished: proves browser-visible streaming.
  await expect(page.getByRole("button", { name: "使用示例 Agent", exact: true })).toBeDisabled();
  preview.finishRun();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:finished");
  await expect(page.getByRole("button", { name: "使用示例 Agent", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
  await expect(endpoint).toHaveValue(preview.agentEndpoint);
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
  await expect(host.getByText(/wire:first/)).toHaveCount(0);
  await page.getByRole("button", { name: "使用此地址", exact: true }).click();
  await expect(endpoint).toHaveValue(preview.agentEndpoint);
  await expect(host.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  await expect(host.getByText(/wire:first/)).toHaveCount(0);
});

for (const source of ["mock", "connected"] as const) {
test(`turning off ${source} restores the application endpoint and stays off after a workbench reload`, async ({ page, preview }) => {
  preview.enableCors();
  const endpoint = `${preview.agentEndpoint}?application=1`;
  await preview.writeHostEntry(`import { createRoot } from "react-dom/client"; import { Agent } from "./agent-ui"; import "./host.css"; createRoot(document.getElementById("root")!).render(<Agent endpoint={${JSON.stringify(endpoint)}} />);`);
  if (source === "connected") {
    await page.getByRole("textbox", { name: "Agent 服务地址" }).fill(preview.agentEndpoint);
    await page.getByRole("button", { name: "使用此地址", exact: true }).click();
  }
  if (source === "mock") await page.locator(".creator-agent-connection").screenshot({ path: path.resolve("../../artifacts/docs-agent-connection-20261027/connection-enabled.png") });
  await page.getByRole("button", { name: "关闭临时连接", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("临时连接已关闭，当前使用应用代码中的 endpoint。");
  await expect(page.getByRole("button", { name: "关闭临时连接", exact: true })).toBeDisabled();
  if (source === "mock") await page.locator(".creator-agent-connection").screenshot({ path: path.resolve("../../artifacts/docs-agent-connection-20261027/connection-disabled.png") });
  if (source === "connected") await expect(page.getByRole("textbox", { name: "Agent 服务地址" })).toHaveValue(preview.agentEndpoint);

  await page.reload();
  const host = page.frameLocator('iframe[title="Host Application"]');
  await expect(host.locator(".aui-composer-root").getByRole("textbox")).toBeEditable({ timeout: 15_000 });
  await expect(host.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  const response = page.waitForResponse(value => value.url() === endpoint && value.request().method() === "POST");
  await host.locator(".aui-composer-root").getByRole("textbox").fill("Use the application endpoint");
  await host.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:first");
  expect(preview.runUrls()).toEqual(["/agent?application=1"]);
  preview.finishRun();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:finished");

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("临时连接已关闭");
  await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
});
}

test("turning off a dock connection restores the outer application without reloading", async ({ page, preview }) => {
  preview.enableCors();
  const endpoint = `${preview.agentEndpoint}?application=dock`;
  await preview.writeHostEntry(`import { createRoot } from "react-dom/client"; import { Agent } from "./agent-ui"; import "./host.css"; createRoot(document.getElementById("root")!).render(<Agent endpoint={${JSON.stringify(endpoint)}} />);`);
  await page.goto(preview.hostOrigin);
  await page.getByRole("button", { name: /Creator Agent/ }).click();
  const dock = page.frameLocator('iframe[title="Creator Agent"]');
  await dock.getByRole("button", { name: "设置", exact: true }).click();
  await dock.getByRole("button", { name: "连接 Agent", exact: true }).click();
  await dock.getByRole("textbox", { name: "Agent 服务地址" }).fill(preview.agentEndpoint);
  await dock.getByRole("button", { name: "使用此地址", exact: true }).click();
  await expect(dock.getByText("当前使用：自己的 Agent 服务", { exact: true })).toBeVisible();
  await waitForSource(page, preview.hostOrigin, "connected");
  await dock.getByRole("button", { name: "关闭临时连接", exact: true }).click();
  await expect(dock.getByRole("status")).toContainText("临时连接已关闭");
  await waitForSource(page, preview.hostOrigin, "application");
  await page.getByRole("button", { name: /收起 Creator/ }).click();
  const response = page.waitForResponse(value => value.url() === endpoint && value.request().method() === "POST");
  await page.locator(".aui-composer-root").getByRole("textbox").fill("Use the application endpoint from the dock");
  await page.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:first");
  expect(preview.runUrls()).toEqual(["/agent?application=dock"]);
  preview.finishRun();
  await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:finished");
});
