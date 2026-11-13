import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { startRun, finishRun, writeEvent } from "./support/controlled-agent-protocol.js";
import { staticTemplate, inputFor, sendText, reply, createThread, openHistory, closeHistory, chooseFiles, selectText, runText } from "./support/static-template-host.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode}: clipboard permission denial is recoverable without another Agent run`, async ({ page, context, browserName }) => {
    expect(browserName).toBe("chromium"); const f = await staticTemplate(page, mode, run => reply(run, "Permission recovery response"));
    const cdp = await context.newCDPSession(page);
    try {
      const { targetInfo } = await cdp.send("Target.getTargetInfo");
      expect(targetInfo.browserContextId).toBeTruthy();
      for (const allowWithoutSanitization of [false, true]) await cdp.send("Browser.setPermission", { origin: f.origin, browserContextId: targetInfo.browserContextId!, permission: { name: "clipboard-write", allowWithoutSanitization }, setting: "denied" });
      expect(await page.evaluate(async () => (await navigator.permissions.query({ name: "clipboard-write" as PermissionName })).state)).toBe("denied");
      await sendText(page, "Clipboard access"); await expect(page.locator(".aui-md")).toHaveText("Permission recovery response"); await inputFor(page).fill("Keep clipboard draft");
      const copy = page.locator('[data-ui-plugin="response-footer"]').getByRole("button", { name: "复制", exact: true }); await copy.click();
      await expect(page.getByRole("status")).toContainText("复制失败，请检查浏览器权限后重试。");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: f.origin }); await copy.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Permission recovery response"); await expect(page.locator('[data-slot="copy-action-error"]')).toHaveCount(0); await expect(inputFor(page)).toHaveValue("Keep clipboard draft"); expect(f.requests).toHaveLength(1);
    } finally { await cdp.detach(); await f.close("clipboard-denial", browserName); }
  });

  test(`${mode}: independent tabs do not share drafts, conversations or attachments`, async ({ page, context, browserName }) => {
    const f = await staticTemplate(page, mode, run => reply(run, "Tab reply: " + runText(run.input))); const other = await context.newPage(); other.on("pageerror", error => f.errors.push(error.message));
    try {
      await inputFor(page).fill("First tab draft"); await chooseFiles(page, [{ name: "first-tab.txt", mimeType: "text/plain", buffer: Buffer.from("Tab A only") }]);
      await other.goto(f.origin + "/portal/agent-ui/"); if (mode === "assistant") await other.getByRole("button", { name: "打开助手", exact: true }).click(); await expect(inputFor(other)).toHaveValue(""); await expect(other.getByRole("button", { name: "移除 first-tab.txt", exact: true })).toHaveCount(0);
      await sendText(other, "Second tab message"); await expect(other.locator(".aui-md")).toHaveText("Tab reply: Second tab message"); await expect(inputFor(page)).toHaveValue("First tab draft"); await expect(page.locator(".aui-md")).toHaveCount(0);
      await page.getByRole("button", { name: "移除 first-tab.txt", exact: true }).click(); await page.locator(".aui-composer-send").click(); await expect(page.locator(".aui-md")).toHaveText("Tab reply: First tab draft"); expect(f.requests).toHaveLength(2); expect(f.requests[0]!.threadId).not.toBe(f.requests[1]!.threadId);
      expect(f.requests[1]!.messages.map(message => message.content)).toEqual(["First tab draft"]);
    } finally { await other.close(); await f.close("tabs", browserName); }
  });

  test(`${mode}: audio and video tool results load real media and unresolved files stay safe`, async ({ page, browserName }) => {
    const audio = await readFile(new URL("./fixtures/media/tone.wav", import.meta.url)), video = await readFile(new URL("./fixtures/media/clip.webm", import.meta.url));
    const f = await staticTemplate(page, mode, run => {
      startRun(run.response, run.input); writeEvent(run.response, { type: "TOOL_CALL_START", toolCallId: "media", toolCallName: "media_report" }); writeEvent(run.response, { type: "TOOL_CALL_ARGS", toolCallId: "media", delta: "{}" }); writeEvent(run.response, { type: "TOOL_CALL_END", toolCallId: "media" });
      writeEvent(run.response, { type: "TOOL_CALL_RESULT", toolCallId: "media", messageId: "media-result", role: "tool", content: [
        { type: "audio", source: { type: "data", mimeType: "audio/wav", value: audio.toString("base64") }, metadata: { filename: "tone.wav" } },
        { type: "video", source: { type: "data", mimeType: "video/webm", value: video.toString("base64") }, metadata: { filename: "clip.webm" } },
        { type: "image", source: { type: "file", mimeType: "image/png", value: "opaque-file-id" }, metadata: { filename: "unresolved.png" } },
        { type: "image", source: { type: "url", mimeType: "image/png", value: "javascript:alert(1)" }, metadata: { filename: "unsafe.png" } },
      ] }); finishRun(run.response, run.input, "Media report ready");
    });
    try {
      await sendText(page, "Media report"); await expect(page.locator(".aui-md")).toHaveText("Media report ready"); await page.getByRole("button", { name: "1 次工具调用", exact: true }).click();
      const content = page.locator('[data-slot="tool-result-content"]');
      await expect.poll(() => content.locator("audio").evaluate(element => (element as HTMLMediaElement).readyState)).toBeGreaterThanOrEqual(1);
      await expect.poll(() => content.locator("video").evaluate(element => (element as HTMLMediaElement).readyState)).toBeGreaterThanOrEqual(1);
      expect(await content.locator("audio").evaluate(element => (element as HTMLMediaElement).duration)).toBeGreaterThan(0.1); expect(await content.locator("video").evaluate(element => (element as HTMLVideoElement).videoWidth)).toBe(32);
      for (const tag of ["audio", "video"]) {
        const media = content.locator(tag); await media.evaluate(async element => { const player = element as HTMLMediaElement; player.muted = true; await player.play(); });
        await expect.poll(() => media.evaluate(element => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.02);
        await media.evaluate(element => (element as HTMLMediaElement).pause()); await expect(media).toHaveJSProperty("paused", true);
      }
      await expect(content.locator('[data-slot="tool-result-unavailable"]')).toHaveCount(2); await expect(content.locator('img[src^="javascript:"]')).toHaveCount(0);
      expect(f.requests).toHaveLength(1);
    } finally { await f.close("media", browserName); }
  });

  test(`${mode}: edit, cancel, regenerate and navigate message branches`, async ({ page, context, browserName }, testInfo) => {
    const f = await staticTemplate(page, mode, (run, index) => reply(run, `Answer branch ${index}`));
    try {
      await expect(page.locator(".aui-composer-send")).toBeDisabled(); await inputFor(page).fill("  \n  "); await expect(page.locator(".aui-composer-send")).toBeDisabled();
      await sendText(page, "Original question"); await expect(page.locator(".aui-md")).toHaveText("Answer branch 1");
      await inputFor(page).fill("Keep composer draft"); await page.getByRole("button", { name: "重试", exact: true }).click();
      await expect(page.locator(".aui-md")).toHaveText("Answer branch 2"); await expect(inputFor(page)).toHaveValue("Keep composer draft");
      expect(f.requests[1]!.messages.filter(message => message.role === "user")).toHaveLength(1);
      const assistant = page.locator('[data-role="assistant"]'); const picker = assistant.locator(".aui-branch-picker-root");
      await picker.getByRole("button", { name: "上一项", exact: true }).click(); await expect(page.locator(".aui-md")).toHaveText("Answer branch 1");
      await picker.getByRole("button", { name: "下一项", exact: true }).click(); await expect(page.locator(".aui-md")).toHaveText("Answer branch 2"); expect(f.requests).toHaveLength(2);
      const user = page.locator('[data-role="user"]'); await user.hover(); await user.getByRole("button", { name: "编辑", exact: true }).click();
      const edit = page.locator('[data-slot="agent-ui-edit-composer"]'); await edit.getByRole("textbox").fill("Discarded edit"); await edit.getByRole("button", { name: "取消", exact: true }).click();
      await expect(user).toContainText("Original question"); expect(f.requests).toHaveLength(2);
      await user.hover(); await user.getByRole("button", { name: "编辑", exact: true }).click(); await edit.getByRole("textbox").fill("Updated question"); await edit.getByRole("button", { name: "更新", exact: true }).click();
      await expect(page.locator(".aui-md")).toHaveText("Answer branch 3"); expect(f.requests[2]!.messages.filter(message => message.role === "user")).toMatchObject([{ content: "Updated question" }]);
      await user.locator(".aui-branch-picker-root").getByRole("button", { name: "上一项", exact: true }).click(); await expect(user).toContainText("Original question");
      expect(f.requests).toHaveLength(3); await expect(page.locator('[data-ui-plugin="response-footer"]')).toHaveCount(1);
      if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: f.origin });
      const visibleAnswer = await page.locator(".aui-md").innerText(); await page.locator('[data-ui-plugin="response-footer"]').getByRole("button", { name: "复制", exact: true }).click(); await expect(page.locator('[data-slot="copy-action-copied"]')).toHaveCount(1);
      await page.getByRole("button", { name: "更多操作", exact: true }).click(); const downloading = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "导出 Markdown", exact: true }).click();
      const exported = testInfo.outputPath("branch-export.md"); await (await downloading).saveAs(exported); expect(await readFile(exported, "utf8")).toBe(visibleAnswer);
    } finally { await f.close("branches", browserName); }
  });

  test(`${mode}: quote selection, cancel, send and clear across conversations`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, run => reply(run, "Quote this exact sentence."));
    try {
      await sendText(page, "Quote original"); await expect(page.locator(".aui-md p")).toHaveText("Quote this exact sentence.");
      await selectText(page, ".aui-md p"); await page.getByRole("button", { name: "引用", exact: true }).click();
      const quote = page.locator('[data-slot="composer-quote"]'); await expect(quote).toContainText("Quote this exact sentence.");
      await inputFor(page).fill("Draft with quote"); await page.getByRole("button", { name: "取消引用", exact: true }).click(); await expect(quote).toHaveCount(0); await expect(inputFor(page)).toHaveValue("Draft with quote");
      await selectText(page, ".aui-md p"); await page.getByRole("button", { name: "引用", exact: true }).click(); await sendText(page, "Follow up");
      await expect.poll(() => f.requests.length).toBe(2); expect(JSON.stringify(f.requests[1]!.messages.at(-1))).toContain("Quote this exact sentence."); await expect(quote).toHaveCount(0);
      await expect(page.locator(".aui-md p")).toHaveCount(2);
      await page.evaluate(() => { const nodes = document.querySelectorAll(".aui-md p"), range = document.createRange(), selection = getSelection()!; range.setStartBefore(nodes[0]!); range.setEndAfter(nodes[1]!); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
      await expect(page.locator('[data-slot="selection-toolbar"]')).toHaveCount(0);
      await selectText(page, ".aui-md p"); await page.getByRole("button", { name: "引用", exact: true }).click(); await createThread(page, mode); await expect(quote).toHaveCount(0);
      await page.locator(".fixture-business").evaluate(element => { const span = document.createElement("span"); span.className = "outside-selection"; span.textContent = "Outside business selection"; element.append(span); });
      await selectText(page, ".outside-selection"); await expect(page.locator('[data-slot="selection-toolbar"]')).toHaveCount(0);
    } finally { await f.close("quote", browserName); }
  });

  test(`${mode}: default local conversation search, rename, archive, delete and refresh`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, run => reply(run, "Reply: " + runText(run.input)));
    try {
      await sendText(page, "First local conversation"); await expect(page.locator(".aui-md")).toHaveText("Reply: First local conversation"); await inputFor(page).fill("First draft");
      await createThread(page, mode); await sendText(page, "Second local conversation"); await expect(page.locator(".aui-md")).toHaveText("Reply: Second local conversation");
      const list = await openHistory(page, mode); const row = (title: string) => list.locator('[data-slot="aui_thread-list-item"]').filter({ hasText: title });
      const search = list.getByRole("searchbox"); await search.fill("First local"); await expect(row("Second local")).toHaveCount(0); await expect(row("First local")).toBeVisible(); await search.fill("No matching conversations"); await expect(list.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(0); await search.fill("");
      await row("First local conversation").getByRole("button", { name: "First local conversation", exact: true }).click(); await closeHistory(page);
      await expect(page.locator(".aui-md")).toHaveText("Reply: First local conversation"); await expect(inputFor(page)).toHaveValue("First draft");
      await openHistory(page, mode); await row("First local conversation").hover(); await row("First local conversation").getByRole("button", { name: "更多选项", exact: true }).click();
      await page.locator('[data-slot="agent-ui-thread-action-rename"]').click(); const rename = list.locator('[data-slot="agent-ui-thread-rename-input"]');
      await rename.fill("Cancel rename"); await rename.press("Escape"); await expect(row("First local conversation")).toBeVisible();
      await row("First local conversation").hover(); await row("First local conversation").getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-rename"]').click();
      await rename.fill("Renamed local"); await rename.press("Enter"); await expect(row("Renamed local")).toBeVisible();
      await row("Renamed local").hover(); await row("Renamed local").getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-archive"]').click();
      const archive = list.locator('[data-slot="agent-ui-archived-threads"]'); await archive.locator("summary").click(); await expect(archive).toContainText("Renamed local");
      await row("Renamed local").hover(); await row("Renamed local").getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-unarchive"]').click(); await expect(archive.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(0); await expect(row("Renamed local")).toBeVisible();
      await row("Renamed local").hover(); await row("Renamed local").getByRole("button", { name: "更多选项", exact: true }).click(); await page.locator('[data-slot="agent-ui-thread-action-delete"]').click(); await expect(row("Renamed local")).toHaveCount(0);
      await closeHistory(page); await expect(page.locator(".aui-md")).toHaveCount(0); await page.reload(); if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click();
      await expect(inputFor(page)).toHaveValue(""); await expect(page.locator(".aui-md")).toHaveCount(0); expect(f.requests).toHaveLength(2);
    } finally { await f.close("local-history", browserName); }
  });

  test(`${mode}: image attachment preview, Escape and broken-image recovery`, async ({ page, browserName }, testInfo) => {
    const f = await staticTemplate(page, mode, run => reply(run, "File received"));
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(async () => { const box = await inputFor(page).boundingBox(); return box !== null && box.width > 160 && box.x + box.width <= 391; }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await chooseFiles(page, [{ name: "preview.png", mimeType: "image/png", buffer: png }]);
      await page.getByRole("textbox", { name: "Host business input", exact: true }).hover(); await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
      await page.getByRole("button", { name: "预览 preview.png", exact: true }).press("Enter"); const dialog = page.getByRole("dialog", { name: "预览 preview.png", exact: true }); await expect(dialog).toBeVisible();
      await writeFile(testInfo.outputPath("dialog-layout.json"), JSON.stringify(await dialog.evaluate(element => {
        const style = getComputedStyle(element), box = element.getBoundingClientRect(), close = element.querySelector('[data-slot="dialog-close"]')!; const button = close.getBoundingClientRect();
        return { rect: box.toJSON(), button: button.toJSON(), style: { width: style.width, maxWidth: style.maxWidth, left: style.left, top: style.top, translate: style.translate, transform: style.transform }, ancestors: [...function* () { let parent = element.parentElement; while (parent) { yield parent; parent = parent.parentElement; } }()].map(parent => ({ class: parent.className, rect: parent.getBoundingClientRect().toJSON(), transform: getComputedStyle(parent).transform, filter: getComputedStyle(parent).filter })) };
      }), null, 2));
      await expect.poll(() => dialog.getByRole("button", { name: "关闭", exact: true }).evaluate(element => { const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit !== null && element.contains(hit); })).toBe(true);
      const dialogBox = await dialog.boundingBox(), closeBox = await dialog.getByRole("button", { name: "关闭", exact: true }).boundingBox();
      expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height);
      await expect(dialog.locator("img")).toHaveJSProperty("naturalWidth", 1); await page.screenshot({ path: testInfo.outputPath("preview.png"), animations: "disabled" }); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await sendText(page, "Image attached"); await expect(page.locator(".aui-md")).toHaveText("File received");
      await page.getByRole("button", { name: "预览 preview.png", exact: true }).click(); await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "关闭", exact: true }).click(); await expect(dialog).toHaveCount(0);
      await chooseFiles(page, [{ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") }]);
      await page.getByRole("button", { name: "预览 broken.png", exact: true }).click(); await expect(page.getByRole("dialog", { name: "预览 broken.png", exact: true }).getByRole("alert")).toHaveText("无法加载图片预览。"); await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "移除 broken.png", exact: true })).toBeVisible(); await page.getByRole("button", { name: "移除 broken.png", exact: true }).click();
      await sendText(page, "After broken attachment"); await expect.poll(() => f.requests.length).toBe(2); expect(f.requests[1]!.messages.at(-1)!.content).toBe("After broken attachment");
    } finally { await f.close("preview", browserName); }
  });

  test(`${mode}: reasoning, retrieval data, grouped tool results and final footer`, async ({ page, browserName }, testInfo) => {
    const f = await staticTemplate(page, mode, run => {
      startRun(run.response, run.input);
      for (const event of [
        { type: "REASONING_START", messageId: "reason-root" }, { type: "REASONING_MESSAGE_START", messageId: "reason", role: "reasoning" }, { type: "REASONING_MESSAGE_CONTENT", messageId: "reason", delta: "Reasoned production plan" }, { type: "REASONING_MESSAGE_END", messageId: "reason" }, { type: "REASONING_END", messageId: "reason-root" },
        { type: "CUSTOM", name: "CONTEXT_CONTENT", value: { source: "rag", content: [{ query: "Actual query", context: ["Evidence one", "Evidence two"] }] } },
        { type: "CUSTOM", name: "CONTEXT_CONTENT", value: { source: 42, content: "invalid" } },
        { type: "TOOL_CALL_START", toolCallId: "one", toolCallName: "read_report" }, { type: "TOOL_CALL_ARGS", toolCallId: "one", delta: '{"path":"report.txt"}' }, { type: "TOOL_CALL_END", toolCallId: "one" },
        { type: "TOOL_CALL_RESULT", toolCallId: "one", messageId: "result-one", role: "tool", content: [{ type: "text", text: "Result body" }, { type: "image", source: { type: "data", mimeType: "image/png", value: png.toString("base64") }, metadata: { filename: "result.png" } }, { type: "document", source: { type: "data", mimeType: "application/pdf", value: Buffer.from("%PDF-1.4\n").toString("base64") }, metadata: { filename: "result.pdf" } }] },
        { type: "TOOL_CALL_START", toolCallId: "two", toolCallName: "unknown_tool" }, { type: "TOOL_CALL_ARGS", toolCallId: "two", delta: "{}" }, { type: "TOOL_CALL_END", toolCallId: "two" }, { type: "TOOL_CALL_RESULT", toolCallId: "two", messageId: "result-two", role: "tool", content: '{"error":"Controlled tool failure"}' },
      ]) writeEvent(run.response, event);
      finishRun(run.response, run.input, "Final answer after tools");
    });
    try {
      await sendText(page, "Reason and retrieve"); await expect(page.locator(".aui-md").last()).toHaveText("Final answer after tools");
      await page.getByRole("button", { name: /思考/ }).click(); await expect(page.locator('[data-ui-plugin="conversation-surface"]')).toContainText("Reasoned production plan");
      const retrieval = page.locator('[data-slot="context-retrieval-message"]'); await expect(retrieval).toHaveCount(1); await retrieval.locator("summary").click(); await expect(retrieval).toContainText("Evidence two");
      await page.getByRole("button", { name: "2 次工具调用", exact: true }).click(); const result = page.locator('[data-slot="tool-result-content"]'); await expect(result).toContainText("Result body"); await expect(result.locator("img")).toHaveJSProperty("naturalWidth", 1);
      const pdf = result.locator('[download="result.pdf"]'); await expect(pdf).toBeVisible();
      const downloading = page.waitForEvent("download"); await pdf.click(); const file = testInfo.outputPath("result.pdf"); await (await downloading).saveAs(file); expect(await readFile(file, "utf8")).toBe("%PDF-1.4\n");
      await expect(page.locator('[data-ui-plugin="response-footer"]')).toHaveCount(1);
      expect(f.requests).toHaveLength(1); await expect(inputFor(page)).toBeEditable();
    } finally { await f.close("agui-content", browserName); }
  });

  for (const approved of [true, false]) test(`${mode}: approval ${approved ? "allow" : "deny"} resumes once with the correlated answer`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, async (run, index) => {
      startRun(run.response, run.input);
      if (index > 1) { writeEvent(run.response, { type: "TOOL_CALL_RESULT", toolCallId: "decision", messageId: "decision-result", role: "tool", content: JSON.stringify({ approved }) }); finishRun(run.response, run.input, approved ? "Decision allowed" : "Decision denied"); return; }
      writeEvent(run.response, { type: "TOOL_CALL_START", toolCallId: "decision", toolCallName: "request_permission" }); writeEvent(run.response, { type: "TOOL_CALL_ARGS", toolCallId: "decision", delta: "{}" }); writeEvent(run.response, { type: "TOOL_CALL_END", toolCallId: "decision" });
      writeEvent(run.response, { type: "RUN_FINISHED", threadId: run.input.threadId, runId: run.input.runId, outcome: { type: "interrupt", interrupts: [{ id: "decision-id", reason: "tool_call", toolCallId: "decision", message: "Controlled approval", responseSchema: { type: "object", properties: { approved: { type: "boolean" } }, required: ["approved"] } }] } }); run.response.end();
    });
    try {
      await sendText(page, "Ask approval"); const decide = page.getByRole("button", { name: approved ? "允许" : "拒绝", exact: true });
      if (!(await decide.isVisible())) await page.getByRole("button", { name: "1 次工具调用", exact: true }).click();
      await inputFor(page).fill("Approval draft"); await inputFor(page).press("Enter"); await expect(inputFor(page)).toHaveValue("Approval draft"); expect(f.requests).toHaveLength(1); await decide.click();
      await expect(page.locator(".aui-md")).toHaveText(approved ? "Decision allowed" : "Decision denied"); expect(f.requests).toHaveLength(2);
      await expect(inputFor(page)).toHaveValue("Approval draft"); expect(JSON.stringify(f.requests[1]!.messages)).not.toContain("Approval draft");
      expect(f.requests[1]!.resume).toEqual([{ interruptId: "decision-id", status: "resolved", payload: { approved } }]); expect(f.requests[1]!.threadId).toBe(f.requests[0]!.threadId); await expect(decide).toHaveCount(0);
    } finally { await f.close(`approval-${approved}`, browserName); }
  });

  test(`${mode}: fragmented UTF-8 SSE, cancellation before output and reload isolation`, async ({ page, browserName }) => {
    const f = await staticTemplate(page, mode, async (run, index) => {
      if (index === 1) { startRun(run.response, run.input); return; }
      run.response.writeHead(200, { "Content-Type": "text/event-stream" });
      const bytes = Buffer.from([
        { type: "RUN_STARTED", threadId: run.input.threadId, runId: run.input.runId }, { type: "TEXT_MESSAGE_START", messageId: run.id, role: "assistant" }, { type: "TEXT_MESSAGE_CONTENT", messageId: run.id, delta: "中文🚀 café\r\n完整回复" }, { type: "TEXT_MESSAGE_END", messageId: run.id }, { type: "RUN_FINISHED", threadId: run.input.threadId, runId: run.input.runId },
      ].map(event => "data: " + JSON.stringify(event) + "\r\n\r\n").join(""));
      for (let offset = 0; offset < bytes.length; offset += 7) { run.response.write(bytes.subarray(offset, offset + 7)); await new Promise<void>(resolve => setImmediate(resolve)); } run.response.end();
    });
    try {
      await sendText(page, "Cancel before text"); await page.getByRole("button", { name: "停止生成", exact: true }).click(); await expect.poll(() => f.streams[0]?.closed).toBe(true);
      await expect(page.getByText("生成已停止", { exact: true })).toBeVisible();
      await sendText(page, "Fragmented response"); await expect(page.locator(".aui-md")).toContainText("中文🚀 café"); await expect(page.locator(".aui-md")).toContainText("完整回复");
      const thread = f.requests[1]!.threadId; await page.reload(); if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click(); await expect(page.locator(".aui-md")).toHaveCount(0);
      await sendText(page, "After refresh"); await expect.poll(() => f.requests.length).toBe(3); expect(f.requests[2]!.threadId).not.toBe(thread); expect(f.requests[2]!.messages.map(message => message.content)).toEqual(["After refresh"]);
    } finally { await f.close("fragmentation-refresh", browserName); }
  });
}
