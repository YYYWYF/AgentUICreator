import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode} Host persists rename, archive and unarchive through project HTTP APIs`, async ({ page }, testInfo) => {
    const fixture = await createConnectionHostFixture({ mode, prepareHost: async root => {
      await writeFile(path.join(root, "src/main.tsx"), `import {createRoot} from "react-dom/client"; import {Agent} from "./agent-ui"; import {createHttpConversationDataSource} from "./agent-ui/services/conversations"; import "./host.css";
        const history=createHttpConversationDataSource({endpoint:"/history"}); createRoot(document.getElementById("root")!).render(<Agent conversationDataSource={history}/>);`);
    } });
    const records = [
      { id: "first", title: "待处理工单", status: "regular" },
      { id: "saved", title: "已保存工单", status: "archived" },
    ];
    const mutations: { url: string; method: string; body: unknown }[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    let fail = false;
    try {
      await page.route("**/history/**", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "GET") {
          if (url.pathname === "/history/conversations") return route.fulfill({ json: { conversations: records } });
          const id = url.pathname.split("/").at(-1)!;
          return route.fulfill({ json: { id, title: records.find(item => item.id === id)?.title ?? id, state: { values: { messages: [] } } } });
        }
        mutations.push({ url: url.pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
        if (fail) return route.fulfill({ status: 403, json: { error: "denied" } });
        const item = records.find(item => item.id === url.pathname.split("/")[3])!;
        if (request.method() === "PATCH") item.title = request.postDataJSON().title;
        else item.status = url.pathname.endsWith("/unarchive") ? "regular" : "archived";
        return route.fulfill({ status: 204 });
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(fixture.hostOrigin);
      // Move the development Dock clear of the compact Host's history control.
      const dock = page.getByRole("button", { name: /Creator Agent/ });
      await expect(dock).toBeVisible();
      const box = (await dock.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.mouse.move(600, 20, { steps: 10 }); await page.mouse.up();
      const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
      const showHistory = async () => {
        const composer = page.locator(".aui-composer-root");
        if (mode === "assistant") {
          const open = page.getByRole("button", { name: "打开助手", exact: true });
          await expect.poll(async () => await composer.isVisible() || await open.isVisible()).toBe(true);
          if (await open.isVisible()) await open.click();
        }
        await expect(composer).toBeVisible();
        if (!await list.isVisible()) await page.getByRole("button", { name: /^(切换侧边栏|历史会话)$/ }).click();
        await expect(list).toBeVisible();
      };
      await showHistory();
      const row = (title: string) => list.locator('[data-slot="aui_thread-list-item"]').filter({ has: page.locator('[data-slot="aui_thread-list-item-title"]', { hasText: title }) });
      await expect(row("待处理工单")).toBeVisible();
      await row("待处理工单").hover();
      await row("待处理工单").getByRole("button", { name: "更多选项" }).click();
      await page.locator('[data-slot="agent-ui-thread-action-rename"]').click();
      const input = list.locator('[data-slot="agent-ui-thread-rename-input"]');
      await input.fill("重命名后的工单"); await input.press("Enter");
      await expect(row("重命名后的工单")).toBeVisible();
      await row("重命名后的工单").hover();
      await row("重命名后的工单").getByRole("button", { name: "更多选项" }).click();
      await page.locator('[data-slot="agent-ui-thread-action-archive"]').click();
      const archive = list.locator('[data-slot="agent-ui-archived-threads"]');
      await archive.locator("summary").click();
      await expect(archive).toContainText("重命名后的工单");
      await row("重命名后的工单").hover();
      await row("重命名后的工单").getByRole("button", { name: "更多选项" }).click();
      await page.locator('[data-slot="agent-ui-thread-action-unarchive"]').click();
      await expect(archive).not.toContainText("重命名后的工单");
      expect(mutations).toEqual([
        { url: "/history/conversations/first", method: "PATCH", body: { title: "重命名后的工单" } },
        { url: "/history/conversations/first/archive", method: "POST", body: null },
        { url: "/history/conversations/first/unarchive", method: "POST", body: null },
      ]);
      // Failure follows the same real HTTP path and must not leave an archived row.
      fail = true;
      await row("重命名后的工单").hover();
      await row("重命名后的工单").getByRole("button", { name: "更多选项" }).click();
      await page.locator('[data-slot="agent-ui-thread-action-archive"]').click();
      await expect.poll(() => mutations.length).toBe(4);
      await expect(list.locator('[data-slot="aui_thread-list-items"]')).toContainText("重命名后的工单");
      await expect(archive).not.toContainText("重命名后的工单");
      fail = false;
      await page.reload();
      await showHistory();
      await expect(row("重命名后的工单")).toBeVisible();
      expect(records.find(item => item.id === "first")).toMatchObject({ title: "重命名后的工单", status: "regular" });
      await page.screenshot({ path: testInfo.outputPath(`${mode}-conversation-management.png`), fullPage: true });
      expect(pageErrors).toEqual([]);
    } finally { await fixture.close(); }
  });
}
