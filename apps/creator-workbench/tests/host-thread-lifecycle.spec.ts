import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode} Host retains its live thread through Fast Refresh and connection changes`, async ({ page }, testInfo) => {
    const preview = await createConnectionHostFixture({ mode });
    const errors: string[] = [];
    const applicationThreads: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
        status: "ready", workspace: { id: preview.workspaceId, name: "Thread lifecycle", displayPath: preview.hostRoot },
        project: { mode, sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
      } }));
      await page.route(`${preview.hostOrigin}agent`, route => {
        const input = route.request().postDataJSON(); applicationThreads.push(input.threadId);
        const events = [
          { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
          { type: "TEXT_MESSAGE_START", messageId: `reply-${input.runId}`, role: "assistant" },
          { type: "TEXT_MESSAGE_CONTENT", messageId: `reply-${input.runId}`, delta: "Application reply" },
          { type: "TEXT_MESSAGE_END", messageId: `reply-${input.runId}` },
          { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
        ];
        return route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.addInitScript(() => {
        window.addEventListener("agent-ui:preview-run-state", event => {
          const threadId = (event as CustomEvent<{ threadId?: string }>).detail.threadId;
          if (threadId) (window as Window & { hostRuntimeThreadId?: string }).hostRuntimeThreadId = threadId;
        });
      });
      await page.goto(preview.hostOrigin);
      if (mode === "embedded") {
        // The draggable development Dock initially overlaps this compact Host's
        // history button. Move it using its real pointer interaction.
        const handle = page.getByRole("button", { name: /Creator Agent/ });
        await expect(handle).toBeVisible();
        const box = await handle.boundingBox(); expect(box).not.toBeNull();
        const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x - 400, y, { steps: 12 }); await page.mouse.up();
      }
      const showAssistant = async () => {
        const open = page.getByRole("button", { name: "打开助手", exact: true });
        if (mode === "assistant") {
          await expect.poll(async () => await page.locator(".aui-composer-root").getByRole("textbox").isVisible() || await open.isVisible(), { timeout: 15000 }).toBe(true);
          if (await open.isVisible()) await open.click();
        }
      };
      await showAssistant();
      const input = page.locator(".aui-composer-root").getByRole("textbox");
      const waitForSource = async (source: string) => {
        await expect.poll(() => page.evaluate(() => (window as Window & { __agentUIPreviewEnvironment?: { type: string } }).__agentUIPreviewEnvironment?.type ?? "application")).toBe(source);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
        await showAssistant();
        await expect(input).toBeEditable();
      };
      const surface = page.locator('[data-ui-plugin="conversation-surface"]');
      const agentFile = path.join(preview.hostRoot, "src/agent-ui/application/Agent.tsx");
      const agentSource = await readFile(agentFile, "utf8");
      await page.evaluate(() => {
        window.addEventListener("agent-ui-test:host-refreshed", event => {
          (window as Window & { hostRefreshCount?: number }).hostRefreshCount = (event as CustomEvent<number>).detail;
        });
      });
      let revision = 0;
      const refresh = async (draft: string) => {
        await input.fill(draft);
        await writeFile(agentFile, `${agentSource}\nwindow.dispatchEvent(new CustomEvent("agent-ui-test:host-refreshed", {detail:${++revision}}));\n`);
        await expect.poll(() => page.evaluate(() => (window as Window & { hostRefreshCount?: number }).hostRefreshCount)).toBe(revision);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect(input).toHaveValue(draft);
      };
      const send = async (text: string) => { await input.fill(text); await page.locator(".aui-composer-send").click(); };
      // No history backend is configured. An ephemeral thread must never be fetched.
      await refresh("Startup draft");
      await send("Application before refresh"); await expect(surface).toContainText("Application reply");
      const initialThread = applicationThreads[0]; expect(initialThread).toBeTruthy();
      await refresh("Application draft"); await expect(surface).toContainText("Application before refresh");
      await send("Application after refresh"); await expect.poll(() => applicationThreads.length).toBe(2);
      expect(applicationThreads).toEqual([initialThread, initialThread]);

      await page.getByRole("button", { name: /Creator Agent/ }).click();
      const dock = page.frameLocator('iframe[title="Creator Agent"]');
      await dock.getByRole("button", { name: "设置", exact: true }).click();
      await dock.getByRole("button", { name: "连接 Agent", exact: true }).click();
      await dock.getByRole("button", { name: "使用示例 Agent", exact: true }).click();
      const selected = await page.request.post(`${preview.creatorOrigin}__agent-ui/creator/mock/select`, { data: { scenarioId: "simple-chat", speed: 0 } });
      expect(selected.ok()).toBe(true);
      await page.getByRole("button", { name: /收起 Creator/ }).click(); await showAssistant();
      const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
      // The compact Host's history lives in its drawer.
      const toggle = page.getByRole("button", { name: /^(切换侧边栏|历史会话)$/ });
      if (!(await list.isVisible())) await toggle.click({ timeout: 15000 });
      await list.getByRole("button", { name: "历史：基础会话", exact: true }).click();
      await expect(surface).toContainText("我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始");
      const historyDialog = page.getByRole("dialog", { name: "历史会话", exact: true });
      if (await historyDialog.isVisible()) await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "新建会话", exact: true }).click();
      await refresh("Mock draft");
      await send("Mock after refresh"); await expect(surface).toContainText("你好，这是一个纯文本流式回复。");
      await refresh("Completed Mock draft"); await expect(surface).toContainText("你好，这是一个纯文本流式回复。");

      await page.getByRole("button", { name: /Creator Agent/ }).click();
      await dock.getByRole("textbox", { name: "Agent 服务地址" }).fill(preview.agentEndpoint);
      await dock.getByRole("button", { name: "使用此地址", exact: true }).click();
      await page.getByRole("button", { name: /收起 Creator/ }).click(); await showAssistant();
      await waitForSource("connected");
      await expect(surface).not.toContainText("Mock after refresh");
      await send("Connected service"); await expect(surface).toContainText("wire:first"); preview.finishRun();
      await expect(surface).toContainText("wire:finished"); await refresh("Connected draft");
      await expect(surface).toContainText("wire:finished");
      const connectedThreadId = await page.evaluate(() => (window as Window & { hostRuntimeThreadId?: string }).hostRuntimeThreadId);
      expect(connectedThreadId).toBeTruthy();
      await page.getByRole("button", { name: /Creator Agent/ }).click();
      await dock.getByRole("button", { name: "关闭临时连接", exact: true }).click();
      await page.getByRole("button", { name: /收起 Creator/ }).click(); await showAssistant();
      // The connection reset intentionally replaces the previous source's
      // session. Type only after the Host has applied the application source.
      await expect.poll(() => page.evaluate(() => {
        const host = window as Window & { __agentUIPreviewEnvironment?: unknown; __agentUIPreviewEnvironmentReady?: boolean };
        return host.__agentUIPreviewEnvironmentReady === true && host.__agentUIPreviewEnvironment === undefined;
      })).toBe(true);
      await expect.poll(() => page.evaluate(() => (window as Window & { hostRuntimeThreadId?: string }).hostRuntimeThreadId)).not.toBe(connectedThreadId);
      await waitForSource("application");
      await expect(surface).not.toContainText("wire:first");
      await expect(input).toBeEditable();
      await refresh("Restored application draft"); await expect(surface).not.toContainText("wire:first");
      await send("Application restored"); await expect(surface).toContainText("Application reply");
      expect(applicationThreads).toHaveLength(3); expect(applicationThreads[2]).not.toBe(initialThread);
      expect(preview.runCount()).toBe(1);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-thread-lifecycle.png`), animations: "disabled" });
    } finally { await preview.close(); }
  });
}
