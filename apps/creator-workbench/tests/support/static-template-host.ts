import { expect, type Page } from "@playwright/test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRun, finishRun, writeEvent, type ControlledRunInput } from "./controlled-agent-protocol.js";

export type TemplateMode = "platform" | "assistant" | "embedded";
export type StaticRun = { input: ControlledRunInput; response: ServerResponse; id: string; closed: boolean };
export const templateEvidence = fileURLToPath(new URL("../../../../artifacts/template-complete-20261101", import.meta.url));
const buildRoot = process.env.AGENT_UI_TEMPLATE_BUILDS ?? fileURLToPath(new URL("../../../../artifacts/template-edge-20261101/built", import.meta.url));
export const inputFor = (page: Page) => page.locator('[data-ui-plugin="composer"]').getByRole("textbox");
export const sendText = async (page: Page, text: string) => { await inputFor(page).fill(text); await page.locator(".aui-composer-send").click(); };
export const runText = (input: ControlledRunInput) => String([...input.messages].reverse().find(message => message.role === "user")?.content);
export function reply(run: StaticRun, text: string) { startRun(run.response, run.input); finishRun(run.response, run.input, text); }
export function holdRun(run: StaticRun, text: string) {
  startRun(run.response, run.input); writeEvent(run.response, { type: "TEXT_MESSAGE_START", messageId: run.id, role: "assistant" });
  writeEvent(run.response, { type: "TEXT_MESSAGE_CONTENT", messageId: run.id, delta: text });
}
export async function openHistory(page: Page, mode: TemplateMode) {
  const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
  if (mode === "platform") await expect.poll(async () => await list.isVisible() || await page.getByRole("button", { name: "打开业务面板", exact: true }).isVisible()).toBe(true);
  const open = mode === "platform" ? await list.isVisible() : await page.locator(".conversation-thread-list-popover[data-open]").count() > 0;
  if (!open) await page.getByRole("button", { name: mode === "platform" ? "打开业务面板" : "历史会话", exact: true }).click();
  await expect(list).toBeVisible(); return list;
}
export async function closeHistory(page: Page) {
  if (await page.locator(".conversation-thread-list-popover[data-open],.app-ui-layout-drawer[open]").isVisible()) await page.keyboard.press("Escape");
  await expect(page.locator(".conversation-thread-list-popover")).toBeHidden();
}
export async function createThread(page: Page, mode: TemplateMode) {
  const button = page.getByRole("button", { name: "新建会话", exact: true }); if (!await button.isVisible()) await openHistory(page, mode);
  await button.click(); await closeHistory(page); await expect(inputFor(page)).toHaveValue("");
}
export async function chooseFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加附件", exact: true }).click(); await (await chooser).setFiles(files);
}
export async function selectText(page: Page, selector: string) {
  await page.locator(selector).last().evaluate(element => { const selection = window.getSelection()!, range = document.createRange(); range.selectNodeContents(element); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
}
export async function staticTemplate(page: Page, mode: TemplateMode, run: (stream: StaticRun, index: number) => void | Promise<void>, query = "", other?: (request: IncomingMessage, response: ServerResponse) => boolean | Promise<boolean>) {
  const root = path.resolve(buildRoot, mode), requests: ControlledRunInput[] = [], streams: StaticRun[] = [], errors: string[] = [], serviceErrors: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://fixture.test").pathname;
      if (pathname === "/agent" && request.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const input = JSON.parse(Buffer.concat(chunks).toString()) as ControlledRunInput; requests.push(input);
        const stream = { input, response, id: `complete-${input.runId}`, closed: false }; streams.push(stream);
        response.once("close", () => { stream.closed = true; }); await run(stream, requests.length); return;
      }
      if (await other?.(request, response)) return;
      if (!pathname.startsWith("/portal/agent-ui/")) { response.writeHead(404); response.end(); return; }
      const file = path.resolve(root, decodeURIComponent(pathname.slice("/portal/agent-ui/".length)) || "index.html");
      if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      let data: Buffer; try { data = await readFile(file); } catch { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" } as Record<string, string>)[path.extname(file)] ?? "application/octet-stream");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:");
      response.end(data);
    } catch (error) { serviceErrors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/portal/agent-ui/" + query);
  if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click();
  await expect(inputFor(page)).toBeEditable();
  return { origin, requests, streams, errors, async close(label: string, browser: string) {
    await mkdir(templateEvidence, { recursive: true }); await writeFile(path.join(templateEvidence, `${browser}-${mode}-${label}.json`), JSON.stringify({ mode, browser, label, requests, errors, serviceErrors }, null, 2));
    for (const stream of streams) stream.response.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    expect(serviceErrors).toEqual([]); expect(errors).toEqual([]);
  } };
}
