import { expect, test } from "@playwright/test";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { captureWindowErrors } from "./support/window-errors.js";
import { createServer, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode} approval and responsive resizing do not trigger observer errors`, async ({ page }, testInfo) => {
    const preview = await createConnectionHostFixture({ mode });
    const errors: string[] = [];
    await captureWindowErrors(page, errors);
    const runs: Record<string, unknown>[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (request.method() === "POST" && request.url().startsWith(`${preview.hostOrigin}__agent-ui/mock`)) runs.push(request.postDataJSON());
    });
    try {
      await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
        status: "ready", workspace: { id: preview.workspaceId, name: "Resize acceptance", displayPath: preview.hostRoot },
        project: { mode, sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
      } }));
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(preview.creatorOrigin);
      await page.getByRole("button", { name: "设置", exact: true }).click();
      await page.getByRole("button", { name: "连接 Agent", exact: true }).click();
      await page.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
      await page.getByRole("button", { name: "返回对话", exact: true }).click();
      const host = page.frameLocator('iframe[title="Host Application"]');
      if (mode === "assistant") await host.getByRole("button", { name: "打开助手", exact: true }).click();
      const surface = host.locator('[data-ui-plugin="conversation-surface"]');
      const input = host.locator(".aui-composer-root").getByRole("textbox");
      expect((await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "approval-resume", speed: 0 } })).ok()).toBe(true);
      await input.fill("Resize while awaiting approval");
      await host.locator(".aui-composer-send").click();
      await host.getByRole("button", { name: /思考/ }).click();
      await expect(surface).toContainText("请假方案已经准备好");
      if (!(await host.getByRole("button", { name: "允许", exact: true }).isVisible())) await host.getByRole("button", { name: /1 次工具调用/ }).click();
      await expect(host.getByRole("button", { name: "允许", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`${mode}-awaiting-approval.png`), fullPage: true });
      const frame = page.locator('iframe[title="Host Application"]');
      for (let cycle = 0; cycle < 3; cycle++) {
        await frame.evaluate(element => { element.style.display = "none"; });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await frame.evaluate(element => { element.style.display = ""; });
        await expect(input).toBeVisible();
        await expect(host.getByRole("button", { name: "允许", exact: true })).toBeVisible();
      }
      for (const width of [900, 1200, 820, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(input).toBeVisible();
        await expect(host.getByRole("button", { name: "允许", exact: true })).toBeVisible();
      }
      await host.getByRole("button", { name: "允许", exact: true }).click();
      await expect(surface).toContainText("已确认这次请假方案，继续处理后续流程。");
      await expect(host.getByRole("button", { name: "允许", exact: true })).toHaveCount(0);
      expect(runs).toHaveLength(2);
      expect(runs[1]!.threadId).toBe(runs[0]!.threadId);
      expect(runs[1]!.resume).toEqual([{ interruptId: "approval-resume-1", status: "resolved", payload: { decisions: [{ type: "approve" }] } }]);
      await expect(input).toBeEditable();
      await input.fill("Draft after resizing");
      await page.setViewportSize({ width: 1100, height: 850 });
      await expect(input).toHaveValue("Draft after resizing");
      await page.screenshot({ path: testInfo.outputPath(`${mode}-approval-resize.png`) });
      expect(errors).toEqual([]);
    } finally { await preview.close(); }
  });
}

test("long reasoning preserves a user's scroll position through streaming and resizing", async ({ page }, testInfo) => {
  let stream: ServerResponse | undefined;
  let identity: { threadId: string; runId: string } | undefined;
  const emit = (event: object) => {
    if (!stream) throw new Error("Reasoning stream has not started");
    stream.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const paragraphs = (prefix: string) => Array.from({ length: 12 }, (_, index) => `${prefix} ${index}: Check streaming reasoning layout and user-controlled scrolling.\n\n`).join("");
  const agent = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { threadId: string; runId: string };
    identity = { threadId: input.threadId, runId: input.runId }; stream = response;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    emit({ type: "RUN_STARTED", ...identity });
    emit({ type: "REASONING_START", messageId: "reasoning" });
    emit({ type: "REASONING_MESSAGE_START", messageId: "reasoning-message", role: "reasoning" });
    emit({ type: "REASONING_MESSAGE_CONTENT", messageId: "reasoning-message", delta: paragraphs("Initial") });
  });
  await new Promise<void>(resolve => agent.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(agent.address() as { port: number }).port}/agent`;
  const preview = await createConnectionHostFixture({ prepareHost: async root => {
    await writeFile(path.join(root, "src/main.tsx"), `import {createRoot} from "react-dom/client"; import {Agent} from "./agent-ui"; import "./host.css"; createRoot(document.getElementById("root")!).render(<Agent endpoint={${JSON.stringify(endpoint)}}/>);`);
  } }).catch(async error => {
    agent.closeAllConnections();
    await new Promise<void>(resolve => agent.close(() => resolve()));
    throw error;
  });
  const errors: string[] = [];
  await captureWindowErrors(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(preview.hostOrigin);
    const host = page;
    const input = host.locator(".aui-composer-root").getByRole("textbox");
    await expect(input).toBeEditable();
    await input.fill("Long reasoning while resizing");
    await host.locator(".aui-composer-send").click();
    const reasoning = host.locator('[data-slot="reasoning-text"]');
    await expect(reasoning).toBeVisible();
    // Let the presentation's typewriter finish this controlled batch before
    // exercising a reader's scroll; later batches are still sent incrementally.
    await expect(reasoning).toContainText("Initial 11: Check streaming reasoning layout and user-controlled scrolling.");
    await expect.poll(() => reasoning.evaluate(element => element.scrollHeight - element.clientHeight), { timeout: 15000 }).toBeGreaterThan(80);
    await page.screenshot({ path: testInfo.outputPath("reasoning-live.png") });
    await reasoning.hover();
    await page.mouse.wheel(0, -(await reasoning.evaluate(element => element.scrollHeight)));
    await expect.poll(() => reasoning.evaluate(element => element.scrollTop)).toBeLessThan(5);
    const before = (await reasoning.textContent())!.length;
    emit({ type: "REASONING_MESSAGE_CONTENT", messageId: "reasoning-message", delta: paragraphs("While reading") });
    await expect.poll(async () => (await reasoning.textContent())!.length).toBeGreaterThan(before + 30);
    await page.setViewportSize({ width: 820, height: 900 });
    await expect.poll(() => reasoning.evaluate(element => element.scrollTop)).toBeLessThan(5);
    // Scroll events re-enable automatic following only when the user returns
    // to the bottom of this reasoning viewport.
    await reasoning.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => reasoning.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(3);
    emit({ type: "REASONING_MESSAGE_CONTENT", messageId: "reasoning-message", delta: paragraphs("Following again") });
    await expect(reasoning).toContainText("Following again 11");
    await expect.poll(() => reasoning.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(3);
    emit({ type: "REASONING_MESSAGE_END", messageId: "reasoning-message" });
    emit({ type: "REASONING_END", messageId: "reasoning" });
    emit({ type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" });
    emit({ type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "长 reasoning 预览已完成" });
    emit({ type: "TEXT_MESSAGE_END", messageId: "answer" });
    emit({ type: "RUN_FINISHED", ...identity });
    stream!.end();
    await expect(host.locator('[data-ui-plugin="conversation-surface"]')).toContainText("长 reasoning 预览已完成", { timeout: 20000 });
    await expect(input).toBeEditable();
    await input.fill("Draft after long reasoning");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(input).toHaveValue("Draft after long reasoning");
    await page.screenshot({ path: testInfo.outputPath("long-reasoning-completed.png") });
    expect(errors).toEqual([]);
  } finally {
    stream?.destroy();
    await preview.close();
    agent.closeAllConnections();
    await new Promise<void>(resolve => agent.close(() => resolve()));
  }
});
