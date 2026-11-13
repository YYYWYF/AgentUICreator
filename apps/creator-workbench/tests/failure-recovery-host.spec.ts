import { expect, test, type Page } from "@playwright/test";
import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createControlledAgentHost, startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const inputFor = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) { await inputFor(page).fill(text); await page.locator(".aui-composer-send").click(); }
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
function finishTool(response: ServerResponse, input: ControlledRunInput, id: string, name: string, args: object, outcome?: object) {
  startRun(response, input);
  writeEvent(response, { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name });
  writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) });
  writeEvent(response, { type: "TOOL_CALL_END", toolCallId: id });
  writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: outcome ?? { type: "success", pendingToolCallIds: [id] } });
  response.end();
}

test("HTTP 503 displays failure and retry keeps one user message and the same thread", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ run(input, response, index) {
    if (index === 1) { response.writeHead(503); response.end("Controlled outage"); return; }
    startRun(response, input); finishRun(response, input, "Recovered after HTTP outage");
  } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Retry this request");
    await expect(page.getByRole("alert")).toContainText("503");
    await expect(inputFor(page)).toBeEditable();
    expect(f.requests).toHaveLength(1);
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.locator(".aui-md")).toContainText("Recovered after HTTP outage");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.threadId).toBe(f.requests[0]!.threadId);
    expect(f.requests[1]!.runId).not.toBe(f.requests[0]!.runId);
    expect(f.requests[1]!.messages.filter(message => message.role === "user")).toHaveLength(1);
    expect(f.requests[1]!.messages.find(message => message.role === "user")?.id).toBe(f.requests[0]!.messages.find(message => message.role === "user")?.id);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("a truncated SSE response reports failure, retains partial text and permits a fresh turn", async ({ page }) => {
  const errors = await watch(page);
  let truncate: (() => void) | undefined;
  const f = await createControlledAgentHost({ run(input, response, index) {
    startRun(response, input);
    if (index > 1) { finishRun(response, input, "Fresh turn recovered"); return; }
    writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "partial", role: "assistant" });
    writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "partial", delta: "Partial before disconnect" });
    truncate = () => response.destroy();
  } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Drop the stream");
    await expect(page.locator(".aui-md")).toContainText("Partial before disconnect");
    truncate!();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
    await expect(page.locator(".aui-md")).toContainText("Partial before disconnect");
    await send(page, "A fresh request");
    await expect(page.locator(".aui-md").last()).toContainText("Fresh turn recovered");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.threadId).toBe(f.requests[0]!.threadId);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("denying an interrupt resumes once with false and never fabricates an approval ToolMessage", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({ run(input, response, index) {
    if (index === 1) return finishTool(response, input, "danger", "delete_file", { path: "draft.txt" }, {
      type: "interrupt", interrupts: [{ id: "deny-review", reason: "tool_call", toolCallId: "danger", message: "Delete this file?", responseSchema: { type: "object", properties: { approved: { type: "boolean" } }, required: ["approved"] } }],
    });
    startRun(response, input);
    writeEvent(response, { type: "TOOL_CALL_RESULT", toolCallId: "danger", messageId: "denial-result", role: "tool", content: '{"skipped":true}' });
    finishRun(response, input, "Denied; no files were changed");
  } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Request a decision");
    const deny = page.getByRole("button", { name: "拒绝", exact: true });
    if (!await deny.isVisible()) await page.getByRole("button", { name: "1 次工具调用", exact: true }).click();
    await deny.click();
    await expect(page.locator(".aui-md")).toContainText("Denied; no files were changed");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.resume).toEqual([{ interruptId: "deny-review", status: "resolved", payload: { approved: false } }]);
    expect(f.requests[1]!.messages.some(message => message.role === "tool")).toBe(false);
    await expect(page.getByRole("button", { name: "拒绝", exact: true })).toHaveCount(0);
    await expect(inputFor(page)).toBeEditable();
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const malformed of [false, true]) test(`human question validates input and tool result (malformed=${malformed})`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    application: () => ({ imports: 'import {askUserQuestionPlugin} from "@za38.03/agent-ui-plugins/ask-user-question";', props: 'toolkit={askUserQuestionPlugin.toolkit}' }),
    run(input, response, index) {
      if (index > 1) { startRun(response, input); finishRun(response, input, "Question answer received"); return; }
      finishTool(response, input, "question", "ask_user_question", malformed ? { steps: [] } : {
        steps: [{ id: "task", question: "Describe your task", options: [], selectionMode: "text", minSelections: 1, maxSelections: 1 }],
      });
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Ask a question");
    if (malformed) {
      await expect(page.getByText("此问题暂时无法回答", { exact: true })).toBeVisible();
      expect(f.requests).toHaveLength(1);
      await expect(page.getByRole("button", { name: "确认选择", exact: true })).toHaveCount(0);
      const invalidThread = f.requests[0]!.threadId;
      await page.getByRole("button", { name: "新建会话", exact: true }).click();
      await expect(page.getByText("此问题暂时无法回答", { exact: true })).toHaveCount(0);
      await send(page, "Fresh thread after malformed question");
      await expect(page.locator(".aui-md")).toContainText("Question answer received");
      expect(f.requests).toHaveLength(2);
      expect(f.requests[1]!.threadId).not.toBe(invalidThread);
      expect(f.requests[1]!.messages.some(message => message.role === "tool")).toBe(false);
    } else {
      const answer = page.getByRole("textbox", { name: "Describe your task", exact: true });
      const submit = page.getByRole("button", { name: "确认选择", exact: true });
      await expect(submit).toBeDisabled(); await answer.fill("   "); await expect(submit).toBeDisabled();
      expect(f.requests).toHaveLength(1);
      await answer.fill("Build a task dashboard"); await submit.click();
      await expect(page.locator(".aui-md")).toContainText("Question answer received");
      expect(f.requests).toHaveLength(2);
      expect(f.requests[1]!.resume?.length ?? 0).toBe(0);
      expect(f.requests[1]!.messages.filter(message => message.role === "tool")).toMatchObject([{ toolCallId: "question", content: JSON.stringify({ answers: { task: ["Build a task dashboard"] } }) }]);
      await expect(answer).toHaveCount(0);
      await expect(page.getByText("Build a task dashboard", { exact: true })).toBeVisible();
    }
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("queued messages can be removed and cancellation keeps the remaining queue paused", async ({ page }) => {
  const errors = await watch(page);
  let cancelled = false;
  const f = await createControlledAgentHost({ application: () => ({ props: "enableMessageQueue" }), run(input, response) {
    response.once("close", () => { cancelled = true; });
    startRun(response, input);
    writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: `active-${input.runId}`, role: "assistant" });
    writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: `active-${input.runId}`, delta: "Active response" });
  } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Active message");
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
    for (const text of ["Remove queued B", "Keep queued C"]) {
      await inputFor(page).fill(text); await page.getByRole("button", { name: "加入发送队列", exact: true }).click();
    }
    const queue = page.locator('[data-slot="aui_composer-queue-item"]');
    await expect(queue).toHaveCount(2);
    await queue.filter({ hasText: "Remove queued B" }).getByRole("button", { name: "移除待发送消息", exact: true }).click();
    await expect(queue).toHaveCount(1); await expect(queue).toContainText("Keep queued C");
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect.poll(() => cancelled).toBe(true);
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
    await expect(page.locator(".aui-md")).toContainText("Active response");
    await expect(queue).toHaveCount(1); await expect(queue).toContainText("Keep queued C");
    expect(f.requests).toHaveLength(1);
    await expect(inputFor(page)).toBeEditable();
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("a failed attachment upload cannot invoke the Agent and removing it preserves the draft", async ({ page }) => {
  const errors = await watch(page);
  let uploads = 0;
  const f = await createControlledAgentHost({
    application: origin => ({ props: `attachments={{uploadUrl:${JSON.stringify(`${origin}/upload`)},maxSizeBytes:1024}}` }),
    other(request, response) { if (request.url === "/upload") { uploads++; response.writeHead(503); response.end("Upload unavailable"); } else { response.writeHead(404); response.end(); } },
    run(input, response) { startRun(response, input); finishRun(response, input, "Text-only recovery succeeded"); },
  });
  try {
    await page.goto(f.hostOrigin);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "添加附件", exact: true }).click();
    await (await chooser).setFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fixture") });
    await send(page, "Keep this draft");
    await expect.poll(() => uploads).toBe(1);
    const failed = page.getByRole("group", { name: "文档附件 report.pdf，上传失败", exact: true });
    await expect(failed).toBeVisible();
    await failed.hover();
    const tooltip = page.locator('[data-slot="tooltip-content"][data-open]');
    await expect(tooltip).toBeVisible(); await expect(tooltip).toContainText("503");
    expect(f.requests).toHaveLength(0);
    await expect(inputFor(page)).toHaveValue("Keep this draft");
    await page.getByRole("button", { name: "移除 report.pdf", exact: true }).click();
    await page.locator(".aui-composer-send").click();
    await expect(page.locator(".aui-md")).toContainText("Text-only recovery succeeded");
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.messages.at(-1)!.content).toBe("Keep this draft");
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("clipboard denial is recoverable and Markdown export contains the response", async ({ page }, testInfo) => {
  const errors = await watch(page);
  await page.addInitScript(() => {
    const state = window as Window & { clipboardAllowed?: boolean; copiedText?: string };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text: string) {
      if (!state.clipboardAllowed) throw new DOMException("Controlled permission denial", "NotAllowedError");
      state.copiedText = text;
    } } });
  });
  const markdown = "# Export test\n\nThis is **Markdown**, with a [safe link](https://example.com).";
  const f = await createControlledAgentHost({ run(input, response) { startRun(response, input); finishRun(response, input, markdown); } });
  try {
    await page.goto(f.hostOrigin); await send(page, "Copy and export");
    await expect(page.getByRole("heading", { name: "Export test", exact: true })).toBeVisible();
    const copy = page.getByRole("button", { name: "复制", exact: true });
    await expect(copy).toBeEnabled(); await copy.click();
    await expect(page.getByRole("status")).toContainText("复制失败，请检查浏览器权限后重试。");
    await expect(page.locator('[data-slot="copy-action-copied"]')).toHaveCount(0);
    await page.evaluate(() => { (window as Window & { clipboardAllowed?: boolean }).clipboardAllowed = true; });
    await copy.click();
    await expect(page.locator('[data-slot="copy-action-copied"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(markdown);
    await expect(page.locator('[data-slot="copy-action-error"]')).toHaveCount(0);
    await page.getByRole("button", { name: "更多操作", exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "导出 Markdown", exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/^response-\d+\.md$/);
    const file = testInfo.outputPath("exported-response.md"); await download.saveAs(file);
    expect(await readFile(file, "utf8")).toBe(markdown);
    expect(f.requests).toHaveLength(1);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
