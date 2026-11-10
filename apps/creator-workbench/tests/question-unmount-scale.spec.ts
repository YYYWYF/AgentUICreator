import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { createControlledAgentHost, startRun, finishRun, writeEvent } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
async function send(page: Page, text: string) { await expect(composer(page)).toBeEditable(); await composer(page).fill(text); await page.locator(".aui-composer-send").click(); }
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
function call(response: ServerResponse, toolCallId: string, toolCallName: string, args: object) {
  writeEvent(response, { type: "TOOL_CALL_START", toolCallId, toolCallName });
  writeEvent(response, { type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify(args) });
  writeEvent(response, { type: "TOOL_CALL_END", toolCallId });
}
const choices = [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }, { id: "gamma", label: "Gamma" }];
async function installUnmount(root: string) {
  const file = path.join(root, "src/main.tsx"), source = await readFile(file, "utf8");
  const target = 'createRoot(document.getElementById("root")!).render(';
  expect(source).toContain(target);
  await writeFile(file, source.replace(target, 'const fixtureRoot=createRoot(document.getElementById("root")!);window.addEventListener("fixture:unmount",()=>fixtureRoot.unmount());fixtureRoot.render('));
}

for (const mixed of [false, true]) test(`three questions preserve previous answers and submit once (mixed=${mixed})`, async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    application: () => ({ imports: 'import {askUserQuestionPlugin} from "@za38.03/agent-ui-plugins/ask-user-question";', props: 'toolkit={askUserQuestionPlugin.toolkit}' }),
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) { finishRun(response, input, "All three answers received"); return; }
      call(response, "three-questions", "ask_user_question", { steps: [
        { id: "first", question: "Choose the first option", options: choices, selectionMode: "single", minSelections: 1, maxSelections: 1 },
        { id: "second", question: "Choose two options", options: choices, selectionMode: "multiple", minSelections: 2, maxSelections: 2 },
        { id: "third", question: "Final response", options: mixed ? [] : choices, selectionMode: mixed ? "text" : "single", minSelections: mixed ? 1 : 0, maxSelections: 1 },
      ] });
      writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); response.end();
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Ask three questions");
    await page.getByRole("button", { name: "Alpha", exact: true }).click();
    const next = page.getByRole("button", { name: "下一步", exact: true });
    await expect(next).toBeDisabled();
    await page.getByRole("checkbox", { name: "Alpha", exact: true }).click(); await expect(next).toBeDisabled();
    await page.getByRole("checkbox", { name: "Beta", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Gamma", exact: true })).toHaveAttribute("aria-disabled", "true");
    await next.click();
    if (mixed) await page.getByRole("textbox", { name: "Final response", exact: true }).fill("Keep this answer while going back");
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Alpha", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Beta", exact: true })).toBeChecked();
    await page.getByRole("checkbox", { name: "Beta", exact: true }).click(); await expect(next).toBeDisabled();
    await page.getByRole("checkbox", { name: "Gamma", exact: true }).click(); await next.click();
    expect(f.requests).toHaveLength(1);
    if (mixed) {
      await expect(page.getByRole("textbox", { name: "Final response", exact: true })).toHaveValue("Keep this answer while going back");
      await page.getByRole("textbox", { name: "Final response", exact: true }).fill("   ");
      await expect(page.getByRole("button", { name: "确认选择", exact: true })).toBeDisabled();
      await page.getByRole("textbox", { name: "Final response", exact: true }).fill("Final text answer");
    }
    await page.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(page.locator(".aui-md")).toContainText("All three answers received");
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.messages.filter(message => message.role === "tool")).toMatchObject([{ toolCallId: "three-questions", content: JSON.stringify({ answers: { first: ["alpha"], second: ["alpha", "gamma"], third: mixed ? ["Final text answer"] : [] } }) }]);
    await expect(page.getByRole("button", { name: "确认选择", exact: true })).toHaveCount(0);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const kind of ["stream", "tool", "upload"] as const) test(`unmount cancels an active ${kind} request without a late Agent continuation`, async ({ page }) => {
  const errors = await watch(page); let started = false, closed = false;
  const hold = (response: ServerResponse) => { started = true; response.once("close", () => { closed = true; }); };
  const f = await createControlledAgentHost({
    application: origin => kind === "tool" ? {
      imports: 'import {createAgentUIFrontendTools} from "@za38.03/agent-ui-runtime";',
      declarations: `const tools=createAgentUIFrontendTools([{name:"unmount_task",description:"Waiting test task",inputSchema:{type:"object",properties:{},additionalProperties:false},async execute(_input,{signal}){return (await fetch(${JSON.stringify(`${origin}/hold`)},{signal})).json();}}]);`, props: 'frontendTools={tools}',
    } : kind === "upload" ? { props: `attachments={{uploadUrl:${JSON.stringify(`${origin}/upload`)}}}` } : {},
    prepareHost: installUnmount,
    other(request, response) { if (request.url === "/hold" || request.url === "/upload") hold(response); else { response.writeHead(404); response.end(); } },
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) { finishRun(response, input, "Fresh mount works"); return; }
      if (kind === "tool") { call(response, "unmount-tool", "unmount_task", {}); writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); response.end(); }
      else { hold(response); writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "open-stream", role: "assistant" }); writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "open-stream", delta: "Open stream before unmount" }); }
    },
  });
  try {
    await page.goto(f.hostOrigin);
    if (kind === "upload") {
      const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加附件", exact: true }).click();
      await (await chooser).setFiles({ name: "pending.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    }
    await send(page, `Run ${kind} before unmount`); await expect.poll(() => started).toBe(true);
    if (kind === "stream") await expect(page.locator(".aui-md")).toContainText("Open stream before unmount");
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
    await expect(page.locator(".aui-composer-root")).toHaveCount(0); await expect.poll(() => closed).toBe(true);
    expect(f.requests).toHaveLength(kind === "upload" ? 0 : 1);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("unmount cancels both the foreground and a still-running background thread", async ({ page }) => {
  const errors = await watch(page), closed = new Set<string>();
  const f = await createControlledAgentHost({
    prepareHost: installUnmount,
    application: origin => ({ imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";', declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`, props: 'conversationDataSource={history} initialThreadId="unmount-a"' }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations") response.end(JSON.stringify({ conversations: ["a", "b"].map(id => ({ id: `unmount-${id}`, title: `Thread ${id}` })) }));
      else if (request.url?.startsWith("/history/conversations/unmount-")) {
        const id = request.url.slice(-1); response.end(JSON.stringify({ id: `unmount-${id}`, title: `Thread ${id}`, state: { values: { messages: [{ id: `saved-${id}`, type: "human", content: `History ${id}` }] } } }));
      } else { response.writeHead(404); response.end(); }
    },
    run(input, response) {
      response.once("close", () => { closed.add(input.threadId); }); startRun(response, input);
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: input.runId, role: "assistant" });
      writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: input.runId, delta: `Running ${input.threadId}` });
    },
  });
  try {
    await page.goto(f.hostOrigin); await expect(page.locator('[data-role="user"]')).toContainText("History a");
    await send(page, "Run a"); await expect(page.locator(".aui-md")).toContainText("Running unmount-a");
    await page.locator('[data-ui-plugin="conversation-thread-list"]').getByRole("button", { name: "Thread b", exact: true }).click();
    await expect(page.locator('[data-role="user"]')).toContainText("History b"); await send(page, "Run b");
    await expect(page.locator(".aui-md")).toContainText("Running unmount-b"); expect(closed.size).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
    await expect.poll(() => [...closed].sort()).toEqual(["unmount-a", "unmount-b"]);
    expect(f.requests).toHaveLength(2); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("a Host callback that ignores cancellation cannot continue the Agent after unmount", async ({ page }) => {
  const errors = await watch(page);
  const f = await createControlledAgentHost({
    prepareHost: installUnmount,
    application: () => ({
      imports: 'import {createAgentUIFrontendTools} from "@za38.03/agent-ui-runtime";',
      declarations: `type LateState={ready:boolean;aborted:boolean;completed:boolean;resolve?:()=>void};const late:LateState={ready:false,aborted:false,completed:false};(window as Window & {fixtureLate?:LateState}).fixtureLate=late;const tools=createAgentUIFrontendTools([{name:"ignores_cancellation",description:"Deferred callback",inputSchema:{type:"object",properties:{},additionalProperties:false},async execute(_input,{signal}){late.ready=true;signal.addEventListener("abort",()=>{late.aborted=true;},{once:true});await new Promise<void>(resolve=>{late.resolve=resolve;});late.completed=true;return {late:true};}}]);`,
      props: 'frontendTools={tools}',
    }),
    run(input, response, index) {
      startRun(response, input);
      if (index > 1) { finishRun(response, input, "Unexpected late continuation"); return; }
      call(response, "late-callback", "ignores_cancellation", {});
      writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); response.end();
    },
  });
  try {
    await page.goto(f.hostOrigin); await send(page, "Wait for page callback");
    await expect.poll(() => page.evaluate(() => (window as Window & { fixtureLate?: { ready: boolean } }).fixtureLate?.ready)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
    await expect.poll(() => page.evaluate(() => (window as Window & { fixtureLate?: { aborted: boolean } }).fixtureLate?.aborted)).toBe(true);
    await page.evaluate(async () => {
      (window as Window & { fixtureLate?: { resolve?: () => void } }).fixtureLate?.resolve?.();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(await page.evaluate(() => (window as Window & { fixtureLate?: { completed: boolean } }).fixtureLate?.completed)).toBe(true);
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test("a thousand histories support bounded search, archived selection and cached thread switching", async ({ page }, testInfo) => {
  const errors = await watch(page), loaded: string[] = [];
  const target = "ticket/0799?区域=上海";
  const conversations = Array.from({ length: 1000 }, (_, index) => ({ id: index === 799 ? target : `ticket-${index}`, title: `${index < 800 ? "Work" : "Archive"} 工单 ${String(index).padStart(4, "0")}`, status: index < 800 ? "regular" : "archived" }));
  const timings: Record<string, number> = {}; let listRequests = 0, unarchives = 0;
  const f = await createControlledAgentHost({
    application: origin => ({ imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";', declarations: `const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`, props: 'conversationDataSource={history} initialThreadId="ticket-0"' }),
    other(request, response) {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/history/conversations") { listRequests++; response.end(JSON.stringify({ conversations })); }
      else if (request.url === "/history/conversations/ticket-999/unarchive" && request.method === "POST") {
        unarchives++; conversations[999]!.status = "regular"; response.writeHead(204); response.end();
      }
      else if (request.url?.startsWith("/history/conversations/")) {
        const id = decodeURIComponent(request.url.slice("/history/conversations/".length)); loaded.push(id);
        response.end(JSON.stringify({ id, title: conversations.find(item => item.id === id)?.title, state: { values: { messages: [{ id: `message-${id}`, type: "human", content: `History content for ${id}` }] } } }));
      } else { response.writeHead(404); response.end(); }
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "History continuation remains usable"); },
  });
  try {
    let time = Date.now(); await page.goto(f.hostOrigin);
    const list = page.locator('[data-ui-plugin="conversation-thread-list"]');
    await expect(list.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(1000, { timeout: 30_000 }); timings.initialListMs = Date.now() - time;
    const search = list.getByRole("searchbox", { name: "搜索会话", exact: true });
    time = Date.now(); await search.fill("  wORK 工单 0799  ");
    await expect(list.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(1); timings.filterMs = Date.now() - time;
    await list.getByRole("button", { name: "Work 工单 0799", exact: true }).click();
    await expect(page.locator('[data-role="user"]')).toContainText(`History content for ${target}`);
    await composer(page).fill("Draft for selected history");
    await search.fill("Archive 工单 0999");
    const archive = list.locator('[data-slot="agent-ui-archived-threads"]'); await archive.locator("summary").click();
    await list.getByRole("button", { name: "Archive 工单 0999", exact: true }).click();
    await expect(page.locator('[data-role="user"]')).toContainText("History content for ticket-999");
    await search.fill("Work 工单 0799"); await list.getByRole("button", { name: "Work 工单 0799", exact: true }).click();
    await expect(composer(page)).toHaveValue("Draft for selected history");
    expect(loaded.filter(id => id === target)).toHaveLength(1); expect(loaded).toContain("ticket-999");
    expect(listRequests).toBe(1); expect(unarchives).toBe(1); expect(f.requests).toHaveLength(0);
    await search.fill("No matching histories"); await expect(list.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(0);
    await expect(composer(page)).toHaveValue("Draft for selected history");
    await search.fill(""); await expect(list.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(1000);
    await testInfo.attach("observed-history-timings", { body: JSON.stringify(timings), contentType: "application/json" });
    console.log("[1000 history observations]", JSON.stringify(timings));
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally { await f.close(); }
});
