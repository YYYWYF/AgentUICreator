import { expect, test } from "@playwright/test";
import { writeEvent } from "./support/controlled-agent-protocol.js";
import type { ServerResponse } from "node:http";
import { staticTemplate, inputFor, sendText, reply, holdRun, openHistory, closeHistory, createThread } from "./support/static-template-host.js";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode}: a failed pending deletion preserves newer navigation and drafts`, async ({ page, browserName }) => {
    let pending: ServerResponse | undefined;
    const f = await staticTemplate(page, mode, run => reply(run, "Still usable"), "?history=1", (request, response) => {
      if (!request.url?.startsWith("/history/")) return false; response.setHeader("Content-Type", "application/json");
      if (request.method === "DELETE") { pending = response; return true; }
      if (request.url.endsWith("/conversations")) response.end(JSON.stringify({ conversations: [{ id: "A", title: "Safe A", status: "regular" }, { id: "B", title: "Safe B", status: "regular" }] }));
      else { const id = request.url.endsWith("/A") ? "A" : "B"; response.end(JSON.stringify({ id, title: `Safe ${id}`, state: { values: { messages: [{ id: `${id}-answer`, type: "ai", content: `Safe answer ${id}` }] } } })); } return true;
    });
    try {
      const list = await openHistory(page, mode); await list.getByRole("button", { name: "Safe A", exact: true }).click(); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Safe answer A"); await inputFor(page).fill("A retained draft");
      const remove = async () => { await openHistory(page, mode); const row = list.locator('[data-slot="aui_thread-list-item"]').filter({ hasText: "Safe A" }); await row.hover(); await row.getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-delete"]').click(); await expect.poll(() => pending !== undefined).toBe(true); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveCount(0); };
      await remove(); await inputFor(page).fill("New draft while deletion waits"); pending!.writeHead(503); pending!.end('{}'); pending = undefined;
      await expect(inputFor(page)).toHaveValue("New draft while deletion waits"); await openHistory(page, mode); await expect(list.getByRole("button", { name: "Safe A", exact: true })).toBeVisible(); await list.getByRole("button", { name: "Safe A", exact: true }).click(); await closeHistory(page); await expect(inputFor(page)).toHaveValue("A retained draft");
      await remove(); await openHistory(page, mode); await list.getByRole("button", { name: "Safe B", exact: true }).click(); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Safe answer B"); await inputFor(page).fill("B new draft"); pending!.writeHead(503); pending!.end('{}'); pending = undefined;
      await expect(page.locator(".aui-md")).toHaveText("Safe answer B"); await expect(inputFor(page)).toHaveValue("B new draft"); expect(f.requests).toHaveLength(0);
    } finally { pending?.destroy(); await f.close("delete-navigation-guard", browserName); }
  });

  test(`${mode}: delayed history cannot replace a more recently selected conversation`, async ({ page, browserName }) => {
    let pending: ServerResponse | undefined;
    const detail = (id: string) => JSON.stringify({ id, title: `Race ${id}`, state: { values: { messages: [{ id: `${id}-answer`, type: "ai", content: `Race answer ${id}` }] } } });
    const f = await staticTemplate(page, mode, run => reply(run, "Race recovery"), "?history=1", (request, response) => {
      if (!request.url?.startsWith("/history/")) return false; response.setHeader("Content-Type", "application/json");
      if (request.url.endsWith("/conversations")) response.end(JSON.stringify({ conversations: [{ id: "A", title: "Race A", status: "regular" }, { id: "B", title: "Race B", status: "regular" }] }));
      else if (request.url.endsWith("/A")) pending = response; else response.end(detail("B")); return true;
    });
    try {
      const list = await openHistory(page, mode); await list.getByRole("button", { name: "Race A", exact: true }).click(); await expect.poll(() => pending !== undefined).toBe(true);
      await openHistory(page, mode); await list.getByRole("button", { name: "Race B", exact: true }).click(); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Race answer B");
      pending!.end(detail("A")); await inputFor(page).fill("B draft after delayed A"); await expect(page.locator(".aui-md")).toHaveText("Race answer B");
      await sendText(page, "Continue B"); await expect(page.locator(".aui-md").last()).toHaveText("Race recovery"); expect(f.requests[0]!.threadId).toBe("B"); expect(JSON.stringify(f.requests[0]!.messages)).not.toContain("Race answer A");
    } finally { pending?.destroy(); await f.close("history-race", browserName); }
  });

  test(`${mode}: Host suggestions, live locale/theme and thread-local transient notices`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, run => holdRun(run, "Streaming while Host changes"), "?suggestions=1");
    try {
      const suggestion = page.getByRole("button", { name: /起步问题/ }); await expect(suggestion).toBeVisible(); await suggestion.click();
      await expect(page.locator(".aui-md")).toHaveText("Streaming while Host changes"); expect(f.requests[0]!.messages.at(-1)!.content).toBe("Suggested prompt");
      await inputFor(page).fill("Keep presentation draft"); await page.getByRole("button", { name: "Host notice", exact: true }).click();
      await expect(page.locator('[data-slot="transient-message"]')).toHaveText("Local page notice");
      await page.getByRole("button", { name: "Host language", exact: true }).click(); await page.getByRole("button", { name: "Host theme", exact: true }).click();
      await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible(); await expect(page.locator(".agent-ui-root")).toHaveAttribute("data-color-scheme", "dark");
      await expect(inputFor(page)).toHaveValue("Keep presentation draft"); expect(f.streams[0]!.closed).toBe(false);
      writeEvent(f.streams[0]!.response, { type: "TEXT_MESSAGE_CONTENT", messageId: f.streams[0]!.id, delta: " after Host changes" }); await expect(page.locator(".aui-md")).toContainText("after Host changes");
      await page.getByRole("button", { name: "Host language", exact: true }).click(); await page.getByRole("button", { name: "Host theme", exact: true }).click();
      await page.getByRole("button", { name: "停止生成", exact: true }).click(); await expect.poll(() => f.streams[0]!.closed).toBe(true);
      const previous = f.requests[0]!.threadId; await createThread(page, mode); await expect(page.locator('[data-slot="transient-message"]')).toHaveCount(0);
      await sendText(page, "New message without notices"); await expect.poll(() => f.requests.length).toBe(2); expect(JSON.stringify(f.requests)).not.toContain("Local page notice"); expect(f.requests[1]!.threadId).not.toBe(previous);
      await page.reload(); if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click(); await expect(page.locator('[data-slot="transient-message"]')).toHaveCount(0);
    } finally { await f.close("presentation-notices", browserName); }
  });

  test(`${mode}: real HTTP history retries and persisted mutations preserve failed edits`, async ({ page, browserName }) => {
    const records = [{ id: "A", title: "History A", status: "regular" }, { id: "B", title: "History B", status: "regular" }];
    let failList = true, failDetail = true, failRename = true, failDelete = true;
    const calls: { url: string; method: string; body: string }[] = [];
    const f = await staticTemplate(page, mode, run => reply(run, "New after saved history"), "?history=1", async (request, response) => {
      const url = new URL(request.url!, "http://fixture.test").pathname; if (!url.startsWith("/history/")) return false;
      response.setHeader("Content-Type", "application/json");
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks).toString(); calls.push({ url, method: request.method!, body });
      if (request.method === "GET" && url === "/history/conversations") { if (failList) { failList = false; response.writeHead(503); response.end('{}'); } else response.end(JSON.stringify({ conversations: records })); return true; }
      if (request.method === "GET" && url.startsWith("/history/conversations/")) {
        if (failDetail) { failDetail = false; response.writeHead(503); response.end('{}'); return true; }
        const id = url.split("/").at(-1)!; response.end(JSON.stringify({ id, title: records.find(item => item.id === id)?.title ?? id, state: { values: { messages: [{ id: `${id}-user`, type: "human", content: `Saved question ${id}` }, { id: `${id}-answer`, type: "ai", content: `Saved answer ${id}` }] } } })); return true;
      }
      const item = records.find(record => record.id === url.split("/")[3]);
      if (request.method === "PATCH") { if (failRename) { failRename = false; response.writeHead(403); response.end('{}'); } else { item!.title = JSON.parse(body).title; response.writeHead(204); response.end(); } return true; }
      if (request.method === "DELETE") { if (failDelete) { failDelete = false; response.writeHead(503); response.end('{}'); } else { records.splice(records.indexOf(item!), 1); response.writeHead(204); response.end(); } return true; }
      if (request.method === "POST") { item!.status = url.endsWith("/unarchive") ? "regular" : "archived"; response.writeHead(204); response.end(); return true; }
      response.writeHead(404); response.end('{}'); return true;
    });
    try {
      const list = await openHistory(page, mode); await expect(list.getByRole("alert")).toContainText("加载会话失败"); await list.getByRole("button", { name: "重试", exact: true }).click();
      const row = (title: string) => list.locator('[data-slot="aui_thread-list-item"]').filter({ hasText: title });
      await expect(row("History A")).toBeVisible(); await row("History A").getByRole("button", { name: "History A", exact: true }).click();
      await openHistory(page, mode); const detailError = list.locator('[data-slot="agent-ui-thread-detail-error"]'); await expect(detailError).toBeVisible(); await detailError.getByRole("button", { name: "重试", exact: true }).click();
      await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Saved answer A"); expect(f.requests).toHaveLength(0); await inputFor(page).fill("Persisted draft");
      await openHistory(page, mode); const action = async (title: string, operation: string) => { await row(title).hover(); await row(title).getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator(`[data-slot="agent-ui-thread-action-${operation}"]`).click(); };
      await action("History A", "rename"); const editor = list.getByRole("textbox", { name: "重命名", exact: true }); await editor.fill("Saved renamed A"); await editor.press("Enter"); await expect.poll(() => calls.filter(call => call.method === "PATCH").length).toBe(1); await expect(editor).toBeVisible();
      await editor.press("Enter"); await expect(row("Saved renamed A")).toBeVisible(); await action("Saved renamed A", "archive");
      await expect(page.locator(".aui-md")).toHaveCount(0); await closeHistory(page); await openHistory(page, mode);
      const archived = list.locator('[data-slot="agent-ui-archived-threads"]'); await archived.locator("summary").click(); await expect(archived).toContainText("Saved renamed A");
      await action("Saved renamed A", "unarchive"); await expect(archived.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(0); await expect(row("Saved renamed A")).toBeVisible();
      await row("Saved renamed A").getByRole("button", { name: "Saved renamed A", exact: true }).click(); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Saved answer A"); await inputFor(page).fill("Persisted draft"); await openHistory(page, mode);
      await action("Saved renamed A", "delete"); await expect.poll(() => calls.filter(call => call.method === "DELETE").length).toBe(1); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveText("Saved answer A"); await expect(inputFor(page)).toHaveValue("Persisted draft");
      await openHistory(page, mode); await action("Saved renamed A", "delete"); await expect(row("Saved renamed A")).toHaveCount(0); await closeHistory(page); await expect(page.locator(".aui-md")).toHaveCount(0);
      await sendText(page, "After history deletion"); await expect(page.locator(".aui-md")).toHaveText("New after saved history"); expect(f.requests[0]!.threadId).not.toBe("A");
      await page.reload(); if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click(); await openHistory(page, mode); await expect(row("Saved renamed A")).toHaveCount(0); await expect(row("History B")).toBeVisible();
      expect(records.map(item => item.id)).toEqual(["B"]); expect(calls.filter(call => call.method === "PATCH")).toHaveLength(2); expect(calls.filter(call => call.method === "DELETE")).toHaveLength(2);
    } finally { await f.close("http-history", browserName); }
  });

  test(`${mode}: malformed history reports failure and a fresh conversation stays usable`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, run => reply(run, "Recovered from malformed history"), "?history=1", (request, response) => {
      if (!request.url?.startsWith("/history/")) return false; response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(request.url.endsWith("/conversations") ? { conversations: [{ id: "broken", title: "Broken history", status: "regular" }] } : { id: "broken", state: { values: { messages: "not an array" } } })); return true;
    });
    try {
      const list = await openHistory(page, mode); await list.getByRole("button", { name: "Broken history", exact: true }).click(); await openHistory(page, mode); await expect(list.locator('[data-slot="agent-ui-thread-detail-error"]')).toBeVisible(); expect(f.requests).toHaveLength(0);
      await createThread(page, mode); await sendText(page, "Fresh after malformed history"); await expect(page.locator(".aui-md")).toHaveText("Recovered from malformed history"); expect(f.requests).toHaveLength(1); expect(f.requests[0]!.threadId).not.toBe("broken");
    } finally { await f.close("malformed-history", browserName); }
  });
}
