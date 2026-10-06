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
  await page.getByRole("button", { name: "Continue with Mock Agent", exact: true }).click();
});

test("ordinary Host receives Mock thread list, history and chat through Creator", async ({ page, preview }) => {
  expect(existsSync(path.join(preview.hostRoot, "node_modules/@agent-ui/mock-agent"))).toBe(false);
  const host = page.frameLocator('iframe[title="Host Application"]');
  const list = host.locator('[data-ui-plugin="conversation-thread-list"]');
  await expect(list).toContainText("历史：基础会话");
  await list.getByText("历史：基础会话", { exact: true }).click();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始");
  const selection = await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "simple-chat", speed: 0 } });
  expect(selection.ok()).toBe(true);
  await list.getByRole("button", { name: /新建会话|New Thread/ }).click();
  const response = page.waitForResponse(value => value.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`) && value.request().method() === "POST");
  await host.locator(".aui-composer-input").fill("Mock chat through ordinary Host");
  await host.locator(".aui-composer-send").click();
  expect((await response).status()).toBe(200);
  await expect(host.locator('[data-slot="aui_assistant-message-root"]')).toContainText("你好，这是一个纯文本流式回复。");
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).not.toHaveAttribute("data-conversation-list-status", "error");
});

test("no-CORS Connected Agent streams before completion and Source switching isolates sessions", async ({ page, preview }) => {
  const host = page.frameLocator('iframe[title="Host Application"]');
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  const endpoint = page.getByRole("textbox", { name: "Agent Endpoint" });
  await endpoint.fill(preview.agentEndpoint);
  await page.getByRole("button", { name: "Connect Agent", exact: true }).click();
  await expect(page.getByText("Connected Agent · Selected", { exact: true })).toBeVisible();
  await expect(host.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  const child = page.frames().find(frame => frame.url().startsWith(preview.hostOrigin))!;
  // A direct browser POST is blocked by CORS; the Agent has no OPTIONS support.
  expect(await child.evaluate(async endpoint => {
    try { await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return false; }
    catch { return true; }
  }, preview.agentEndpoint)).toBe(true);
  await host.locator(".aui-composer-input").fill("Connected chat");
  await host.locator(".aui-composer-send").click();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:first");
  expect(preview.runCount()).toBe(1);
  expect(preview.pendingCount()).toBe(1); // Upstream has not finished: proves browser-visible streaming.
  await expect(page.getByRole("button", { name: "Use Mock Agent", exact: true })).toBeDisabled();
  preview.finishRun();
  await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("wire:finished");
  await expect(page.getByRole("button", { name: "Use Mock Agent", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Use Mock Agent", exact: true }).click();
  await expect(endpoint).toHaveValue(preview.agentEndpoint);
  await expect(host.locator('[data-ui-plugin="conversation-thread-list"]')).toContainText("历史：基础会话");
  await expect(host.getByText(/wire:first/)).toHaveCount(0);
  await page.getByRole("button", { name: "Connect Agent", exact: true }).click();
  await expect(endpoint).toHaveValue(preview.agentEndpoint);
  await expect(host.getByText("历史：基础会话", { exact: true })).toHaveCount(0);
  await expect(host.getByText(/wire:first/)).toHaveCount(0);
});
