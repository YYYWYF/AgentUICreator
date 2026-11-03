import { expect, test, type Page } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent-protocol.js";

const evidence = process.env.AGENT_UI_EDGE_EVIDENCE ? path.resolve(process.env.AGENT_UI_EDGE_EVIDENCE) : fileURLToPath(new URL("../../../artifacts/template-edge-20261101", import.meta.url));
const builds = process.env.AGENT_UI_TEMPLATE_BUILDS ? path.resolve(process.env.AGENT_UI_TEMPLATE_BUILDS) : path.join(evidence, "built");
const base = "/portal/agent-ui/";
type Mode = "platform" | "assistant" | "embedded";
type Stream = { input: ControlledRunInput; response: ServerResponse; id: string; closed: boolean };
const composer = (page: Page) => page.locator('[data-ui-plugin="composer"]').getByRole("textbox");
const send = async (page: Page, text: string) => { await composer(page).fill(text); await page.locator(".aui-composer-send").click(); };
const settle = async (page: Page) => { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); };
const lastText = (input: ControlledRunInput) => String([...input.messages].reverse().find(message => message.role === "user")?.content);

async function production(page: Page, mode: Mode, run: (stream: Stream, index: number) => void) {
  const root = path.join(builds, mode), inputs: ControlledRunInput[] = [], streams: Stream[] = [], errors: string[] = [], serverErrors: string[] = [];
  const contentTypes: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://fixture.test").pathname;
      if (pathname === "/agent" && request.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const input = JSON.parse(Buffer.concat(chunks).toString()) as ControlledRunInput; inputs.push(input);
        const stream = { input, response, id: `edge-${input.runId}`, closed: false }; streams.push(stream);
        response.once("close", () => { stream.closed = true; }); run(stream, inputs.length); return;
      }
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const file = path.resolve(root, decodeURIComponent(pathname.slice(base.length)) || "index.html");
      if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      const data = await readFile(file);
      response.setHeader("Content-Type", contentTypes[path.extname(file)] ?? "application/octet-stream");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:");
      response.end(data);
    } catch (error) { serverErrors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + base);
  if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click();
  await expect(composer(page)).toBeEditable();
  return { inputs, streams, errors, async close(label: string) {
    await mkdir(evidence, { recursive: true });
    const browser = test.info().project.use.browserName ?? "chromium";
    await writeFile(path.join(evidence, `${browser}-${mode}-${label}.json`), JSON.stringify({ mode, browser, label, inputs, errors, serverErrors }, null, 2));
    for (const stream of streams) stream.response.destroy();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    expect(serverErrors).toEqual([]); expect(errors).toEqual([]);
  } };
}

function hold(stream: Stream, text: string) {
  startRun(stream.response, stream.input);
  writeEvent(stream.response, { type: "TEXT_MESSAGE_START", messageId: stream.id, role: "assistant" });
  writeEvent(stream.response, { type: "TEXT_MESSAGE_CONTENT", messageId: stream.id, delta: text });
}
function complete(stream: Stream, text: string) { startRun(stream.response, stream.input); finishRun(stream.response, stream.input, text); }
async function attach(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加附件", exact: true }).click(); await (await chooser).setFiles(files);
}
async function newThread(page: Page, mode: Mode) {
  const button = page.getByRole("button", { name: "新建会话", exact: true });
  if (!await button.isVisible()) await page.getByRole("button", { name: mode === "platform" ? "打开业务面板" : "历史会话", exact: true }).click();
  await button.click();
  if (await page.getByRole("dialog", { name: "历史会话", exact: true }).isVisible() || await page.locator(".app-ui-layout-drawer[open]").isVisible()) await page.keyboard.press("Escape");
  await expect(composer(page)).toHaveValue("");
}

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode}: production uses real clipboard, keyboard menus and safe Markdown links`, async ({ page, context }, testInfo) => {
    const markdown = "## Safe content\n\n**Formatted answer** with [normal link](https://example.com/docs) and [unsafe link](javascript:alert(1)).\n\n<script>window.__templateXss = 1</script>\n\n```js\nconst value = 42;\n```";
    const f = await production(page, mode, stream => complete(stream, markdown));
    try {
      const origin = new URL(page.url()).origin;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await send(page, "Exercise default message actions"); await expect(page.getByRole("heading", { name: "Safe content", exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as Window & { __templateXss?: number }).__templateXss)).toBeUndefined();
      await expect(page.locator('.aui-md script, .aui-md a[href^="javascript:"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: "normal link", exact: true })).toHaveAttribute("href", "https://example.com/docs");
      await page.locator('[data-slot="agent-ui-code-header"]').getByRole("button", { name: "复制", exact: true }).click();
      await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).trim())).toBe("const value = 42;");
      const copy = page.locator('[data-ui-plugin="response-footer"]').getByRole("button", { name: "复制", exact: true });
      await copy.focus(); await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
      const more = page.getByRole("button", { name: "更多操作", exact: true });
      await more.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("menuitem", { name: "导出 Markdown", exact: true })).toBeVisible();
      await page.keyboard.press("Escape"); await expect(page.getByRole("menuitem", { name: "导出 Markdown", exact: true })).toHaveCount(0); await expect(more).toBeFocused();
      await more.press("Enter"); const download = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "导出 Markdown", exact: true }).press("Enter");
      const file = testInfo.outputPath("keyboard-export.md"); await (await download).saveAs(file); expect(await readFile(file, "utf8")).toBe(markdown);
      if (mode === "assistant") {
        await composer(page).fill("Keyboard close draft"); const trigger = page.getByRole("button", { name: "关闭助手", exact: true });
        await trigger.focus(); await trigger.press("Enter"); await expect(composer(page)).toBeHidden();
        await page.getByRole("button", { name: "打开助手", exact: true }).press("Enter"); await expect(composer(page)).toHaveValue("Keyboard close draft");
      }
      expect(f.inputs).toHaveLength(1);
    } finally { await f.close("actions-markdown"); }
  });

  test(`${mode}: production recovers from socket loss, malformed SSE, RUN_ERROR and offline send`, async ({ page }) => {
    const f = await production(page, mode, stream => {
      const text = lastText(stream.input);
      if (text === "Socket loss") { hold(stream, "Partial survives disconnection"); return; }
      if (text === "Clean early EOF") { hold(stream, "Partial before early EOF"); stream.response.end(); return; }
      if (text === "HTTP 401" || text === "HTTP 429") { stream.response.writeHead(Number(text.slice(5))); stream.response.end("Controlled HTTP failure"); return; }
      if (text === "Malformed event") { startRun(stream.response, stream.input); stream.response.end("data: {not-json}\n\n"); return; }
      if (text === "Agent failure") { startRun(stream.response, stream.input); writeEvent(stream.response, { type: "RUN_ERROR", message: "Controlled agent failure", code: "EDGE_FAILURE" }); stream.response.end(); return; }
      complete(stream, "Recovered: " + text);
    });
    try {
      await send(page, "Socket loss"); await expect(page.locator(".aui-md")).toContainText("Partial survives disconnection");
      f.streams[0]!.response.destroy(); await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
      await expect(page.locator(".aui-md")).toContainText("Partial survives disconnection");
      await send(page, "After socket loss"); await expect(page.locator(".aui-md").last()).toHaveText("Recovered: After socket loss");
      for (const text of ["Clean early EOF", "Malformed event", "Agent failure", "HTTP 401", "HTTP 429"]) {
        await send(page, text); await expect(page.getByRole("alert").last()).toBeVisible();
        await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
        await send(page, "After " + text); await expect(page.locator(".aui-md").last()).toHaveText("Recovered: After " + text);
      }
      const beforeOffline = f.inputs.length;
      await page.context().setOffline(true); await send(page, "Offline message"); await expect(page.getByRole("alert").last()).toBeVisible();
      await page.context().setOffline(false); expect(f.inputs).toHaveLength(beforeOffline);
      await composer(page).fill("Draft while recovering"); await page.getByRole("button", { name: "重试", exact: true }).last().click();
      await expect(page.locator(".aui-md").last()).toHaveText("Recovered: Offline message"); await expect(composer(page)).toHaveValue("Draft while recovering");
      expect(f.inputs.at(-1)!.messages.filter(message => message.content === "Offline message")).toHaveLength(1);
      expect(new Set(f.inputs.map(input => input.threadId)).size).toBe(1);
    } finally { await page.context().setOffline(false); await f.close("network"); }
  });

  test(`${mode}: production IME, repeated Enter, stop then send and new-thread isolation`, async ({ page }) => {
    const f = await production(page, mode, stream => lastText(stream.input) === "New conversation message" ? complete(stream, "New conversation reply") : hold(stream, "Held reply"));
    try {
      const input = composer(page); await input.focus(); const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.imeSetComposition", { text: "中文候选", selectionStart: 4, selectionEnd: 4 });
      await input.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
      await cdp.send("Input.insertText", { text: "最终中文输入" });
      await input.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, bubbles: true, cancelable: true })));
      await settle(page); expect(f.inputs).toHaveLength(0); await expect(input).toHaveValue("最终中文输入");
      await input.press("Shift+Enter"); await input.pressSequentially("第二行"); await settle(page); expect(f.inputs).toHaveLength(0);
      await input.press("Enter"); await input.press("Enter"); await expect(page.locator(".aui-md")).toHaveText("Held reply");
      expect(f.inputs).toHaveLength(1); expect(f.inputs[0]!.messages.at(-1)!.content).toBe("最终中文输入\n第二行"); await cdp.detach();
      await input.fill("Immediately after stopping"); await page.getByRole("button", { name: "停止生成", exact: true }).click();
      await page.locator(".aui-composer-send").click(); await expect.poll(() => f.inputs.length).toBe(2);
      await expect.poll(() => f.streams[0]!.closed).toBe(true); expect(f.inputs[1]!.messages.at(-1)!.content).toBe("Immediately after stopping");
      const old = f.streams[1]!; await newThread(page, mode); await expect(page.locator(".aui-md")).toHaveCount(0);
      if (!old.closed) writeEvent(old.response, { type: "TEXT_MESSAGE_CONTENT", messageId: old.id, delta: " OLD THREAD ONLY" });
      await send(page, "New conversation message"); await expect(page.locator(".aui-md")).toHaveText("New conversation reply");
      expect(f.inputs).toHaveLength(3); expect(f.inputs[2]!.threadId).not.toBe(f.inputs[1]!.threadId);
      expect(f.inputs[2]!.messages.map(message => message.content)).toEqual(["New conversation message"]);
      await expect(page.locator('[data-ui-plugin="conversation-surface"]')).not.toContainText("OLD THREAD ONLY");
    } finally { await f.close("input-runs"); }
  });

  test(`${mode}: production handles empty, Unicode, multiple, removed and oversized attachments`, async ({ page }) => {
    const f = await production(page, mode, stream => complete(stream, "Attachment accepted"));
    try {
      await composer(page).fill("Draft remains while selecting files");
      await attach(page, [
        { name: "空文件.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
        { name: "报告 ①.txt", mimeType: "text/plain", buffer: Buffer.from("报告正文\r\n第二行") },
        { name: "removed.txt", mimeType: "text/plain", buffer: Buffer.from("DO NOT SEND") },
      ]);
      await expect(page.getByRole("group", { name: "文档附件 空文件.txt", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "移除 removed.txt", exact: true }).click();
      await expect(composer(page)).toHaveValue("Draft remains while selecting files");
      await page.locator(".aui-composer-send").click(); await expect(page.locator(".aui-md")).toHaveText("Attachment accepted");
      const wire = JSON.stringify(f.inputs[0]!.messages.at(-1)!.content);
      expect(wire).toContain("空文件.txt"); expect(wire).toContain("报告 ①.txt"); expect(wire).toContain(Buffer.from("报告正文\r\n第二行").toString("base64")); expect(wire).not.toContain("removed.txt"); expect(wire).not.toContain(Buffer.from("DO NOT SEND").toString("base64"));
      await composer(page).fill("After rejected file");
      await attach(page, [{ name: "too-large.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }]);
      await expect(page.getByRole("alert")).toHaveText("文件超过配置的大小限制。");
      await expect(composer(page)).toHaveValue("After rejected file"); expect(f.inputs).toHaveLength(1);
      await page.locator(".aui-composer-send").click(); await expect.poll(() => f.inputs.length).toBe(2);
      expect(f.inputs[1]!.messages.at(-1)!.content).toBe("After rejected file");
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
      await composer(page).evaluate((element, bytes) => {
        const clipboardData = new DataTransfer(); clipboardData.items.add(new File([new Uint8Array(bytes)], "粘贴图片.png", { type: "image/png" }));
        const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData });
        // Firefox's synthetic ClipboardEvent constructor discards file items.
        // Preserve the test-owned DataTransfer; real OS paste supplies it itself.
        if (!event.clipboardData?.files.length) Object.defineProperty(event, "clipboardData", { value: clipboardData });
        element.dispatchEvent(event);
      }, [...png]);
      await expect(page.getByRole("button", { name: "移除 粘贴图片.png", exact: true })).toBeVisible();
      await page.locator(".aui-composer-send").click(); await expect.poll(() => f.inputs.length).toBe(3);
      const image = JSON.stringify(f.inputs[2]!.messages.at(-1)!.content); expect(image).toContain("image/png"); expect(image).toContain(png.toString("base64"));
    } finally { await f.close("attachments"); }
  });

  test(`${mode}: production long Markdown stays contained and respects manual scroll`, async ({ page }, testInfo) => {
    const long = "## Long response\n\n" + Array.from({ length: 120 }, (_, i) => `Paragraph ${i}: ` + "Long conversation content. ".repeat(8)).join("\n\n") + "\n\n| Wide column | Second column |\n|---|---|\n|" + "wideword".repeat(100) + "|value|\n\n```txt\n" + "longcode".repeat(140) + "\n```\n";
    const f = await production(page, mode, stream => hold(stream, long));
    try {
      await send(page, "Large response"); await expect(page.locator(".aui-md-table-wrapper")).toBeVisible();
      for (const width of [1440, 390, 768, 390]) {
        await page.setViewportSize({ width, height: 844 }); await settle(page);
        await expect.poll(async () => (await composer(page).boundingBox())!.width).toBeGreaterThan(160);
        const box = await composer(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      const viewport = page.locator('[data-slot="aui_thread-viewport"]'); await expect(viewport).toHaveCount(1);
      await viewport.hover();
      // Firefox caps the movement of one enormous wheel delta. Scroll as a user
      // would, over multiple compositor frames, without changing the assertion.
      for (let step = 0; step < 80 && await viewport.evaluate(element => element.scrollTop) >= 300; step++) {
        await page.mouse.wheel(0, -1000); await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
      await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeLessThan(300);
      const oldTop = await viewport.evaluate(element => element.scrollTop);
      writeEvent(f.streams[0]!.response, { type: "TEXT_MESSAGE_CONTENT", messageId: f.streams[0]!.id, delta: "\n\nSTREAM TAIL AFTER MANUAL SCROLL" });
      await expect(page.locator(".aui-md")).toContainText("STREAM TAIL AFTER MANUAL SCROLL"); await settle(page);
      expect(await viewport.evaluate(element => element.scrollTop)).toBeLessThanOrEqual(oldTop + 100);
      await page.getByRole("button", { name: "停止生成", exact: true }).click();
      if (mode === "embedded") await page.locator(".fixture-agent").evaluate(element => { (element as HTMLElement).style.transform = "translateZ(0)"; });
      await composer(page).focus(); await expect(composer(page)).toBeFocused();
      await page.keyboard.press("Tab"); const focus = await page.evaluate(() => document.activeElement?.tagName); expect(focus).not.toBe("BODY");
      const tooltip = page.locator('[data-slot="tooltip-content"][data-open]').filter({ hasText: "添加附件" });
      await expect(tooltip).toBeVisible();
      await expect.poll(async () => { const box = await tooltip.boundingBox(); return box !== null && box.y >= 0 && box.y + box.height <= 845; }).toBe(true);
      const layout = await page.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight,
        body: document.body.scrollHeight, children: [...document.body.children].map(element => ({ tag: element.tagName, class: element.className, height: element.getBoundingClientRect().height, scrollHeight: element.scrollHeight })),
        positioned: [...document.querySelectorAll("*")].filter(element => ["fixed", "absolute"].includes(getComputedStyle(element).position) && element.getBoundingClientRect().bottom > innerHeight).map(element => ({ tag: element.tagName, class: typeof element.className === "string" ? element.className : "", slot: element.getAttribute("data-slot"), top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, position: getComputedStyle(element).position })).slice(-30) }));
      await writeFile(testInfo.outputPath("layout.json"), JSON.stringify(layout, null, 2));
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 1);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-long-mobile.png`), fullPage: true, animations: "disabled" });
    } finally { await f.close("long-layout"); }
  });
}
