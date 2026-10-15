import { expect, test as base } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
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

test("ordinary Host receives Mock thread list, history and chat through Creator", async ({ page, preview }) => {
  expect(existsSync(path.join(preview.hostRoot, "node_modules/@za38.03/agent-ui-creator"))).toBe(false);
  await page.getByRole("button", { name: "返回对话", exact: true }).click();
  const host = page.frameLocator('iframe[title="Host Application"]');
  const list = host.locator('[data-ui-plugin="conversation-thread-list"]');
  await expect(list).toContainText("历史：基础会话");
  await list.getByText("历史：基础会话", { exact: true }).click();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始");
  await expect(host.locator('[data-plugin-state="error"]')).toHaveCount(0);
  const selection = await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "simple-chat", speed: 0 } });
  expect(selection.ok()).toBe(true);
  await list.getByRole("button", { name: /新建会话|New Thread/ }).click();
  const response = page.waitForResponse(value => value.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`) && value.request().method() === "POST");
  await host.locator(".aui-composer-root").getByRole("textbox").fill("Mock chat through ordinary Host");
  await host.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(host.locator('[data-slot="aui_assistant-message-root"]')).toContainText("你好，这是一个纯文本流式回复。");
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).not.toHaveAttribute("data-conversation-list-status", "error");
});

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
